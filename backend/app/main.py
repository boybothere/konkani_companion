"""FastAPI application.

Endpoints
    GET  /health                       liveness + which providers are configured
    POST /transcribe                   audio -> text (form field ``language``: kok | en | auto)
    POST /translate                    text -> translation (kok2en | en2kok | auto), no LLM
    POST /memory/extract               update a user's memory facts after an exchange
    POST /openai/v1/chat/completions   chat, streamed as server-sent events
    POST /analyze-document             PDF/image -> OCR text, English, Konkani summary
    POST /analyze-document/stream      same, with stage events and a final ``result`` event
    POST /document-chat                question about a document, streamed

SSE format
    Answer text uses OpenAI-style ``chat.completion.chunk`` objects so any
    OpenAI-compatible reader can show it. Extra information is sent as named
    events (``status``, ``meta``, ``sources``, ``english``, ``error``), which
    such readers ignore. The stream always ends with ``data: [DONE]``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import security
from .config import Settings, get_settings
from .memory import MAX_FACTS, extract_memory
from .ocr import DocumentError, detect_kind
from .pipeline import (
    Event,
    IncomingMessage,
    Services,
    analyze_document,
    analyze_document_events,
    build_services,
    chat_events,
    document_chat_events,
    translate_any,
)
from .stt import AudioError

logger = logging.getLogger("konkani.api")


def _code_version() -> str:
    """Short git commit of the running code, so /health shows which version is live."""
    import subprocess
    from pathlib import Path

    try:
        out = subprocess.run(
            ["git", "-C", str(Path(__file__).resolve().parent), "log", "-1", "--format=%h %s"],
            capture_output=True, text=True, timeout=5,
        )
        return out.stdout.strip()[:80] or "unknown"
    except Exception:  # noqa: BLE001 - git may be missing (e.g. Docker image)
        return "unknown"


_VERSION = _code_version()


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    role: Literal["user", "assistant", "system"]
    content: str = Field(max_length=20_000)
    english: str | None = Field(default=None, max_length=20_000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    messages: list[ChatMessage] = Field(min_length=1, max_length=100)
    language: Literal["en", "kok"] = "en"
    # Language of the answer: Konkani (default) or English for English mode.
    output_language: Literal["kok", "en"] = "kok"
    # Short facts the user saved about themselves (see app.memory).
    memory: list[str] = Field(default_factory=list, max_length=MAX_FACTS * 2)
    model: str | None = None  # accepted for OpenAI compatibility, not used
    stream: bool = True  # responses are always streamed

    @field_validator("messages")
    @classmethod
    def last_is_user(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        if messages[-1].role != "user" or not messages[-1].content.strip():
            raise ValueError("The last message must be a non-empty user message.")
        return messages


class DocumentChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    question: str = Field(min_length=1, max_length=4_000)
    document_context: str = Field(min_length=1, max_length=100_000)
    output_language: Literal["kok", "en"] = "kok"


class MemoryRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    facts: list[str] = Field(default_factory=list, max_length=MAX_FACTS * 2)
    question: str = Field(min_length=1, max_length=4_000)  # English version of the user's message
    answer: str = Field(default="", max_length=8_000)  # English version of the reply

    @field_validator("facts")
    @classmethod
    def short_facts(cls, facts: list[str]) -> list[str]:
        return [f[:300] for f in facts]


class TranslateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1, max_length=20_000)
    direction: Literal["auto", "kok2en", "en2kok"] = "auto"


def _sse(events: AsyncIterator[Event], jobs: "security.JobLimiter | None" = None) -> AsyncIterator[str]:
    async def generate() -> AsyncIterator[str]:
        chunk_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
        created = int(time.time())

        def chunk(delta: dict, finish: str | None = None) -> str:
            payload = {
                "id": chunk_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": "konkani-companion",
                "choices": [{"index": 0, "delta": delta, "finish_reason": finish}],
            }
            return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

        # Take a job slot only once the stream is actually running, so a client
        # that disconnects early can never leave a slot held.
        if jobs is not None:
            try:
                await jobs.acquire()
            except HTTPException as exc:
                yield f"event: error\ndata: {json.dumps({'message': exc.detail})}\n\n"
                yield "data: [DONE]\n\n"
                return
        yield chunk({"role": "assistant", "content": ""})
        try:
            async for event in events:
                if event.type == "delta":
                    yield chunk({"content": event.data})
                elif event.type == "done":
                    yield chunk({}, finish="stop")
                    yield "data: [DONE]\n\n"
                else:
                    yield f"event: {event.type}\ndata: {json.dumps(event.data, ensure_ascii=False)}\n\n"
        except Exception:  # noqa: BLE001 - headers are already sent; report in-band
            logger.exception("stream failed")
            yield f"event: error\ndata: {json.dumps({'message': 'Something went wrong while answering.'})}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            if jobs is not None:
                jobs.release()

    return generate()


def _streaming(events: AsyncIterator[Event], jobs: "security.JobLimiter | None" = None) -> StreamingResponse:
    return StreamingResponse(
        _sse(events, jobs),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def create_app(services: Services | None = None, settings: Settings | None = None) -> FastAPI:
    """Build the app. Pass ``services`` to reuse models that are already loaded."""
    settings = settings or (services.settings if services else get_settings())

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.services is None:
            app.state.services = build_services(settings)
        if not settings.backend_api_key:
            logger.warning("BACKEND_API_KEY is not set: the API is open to anyone who can reach it.")
        logger.info("search providers: %s", app.state.services.search.configured_providers() or "none")
        yield

    app = FastAPI(title="Konkani Companion API", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.services = services
    limiter = security.RateLimiter(settings.rate_limit_per_minute)
    jobs = security.JobLimiter(settings.max_concurrent_jobs, settings.queue_timeout_s)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers.setdefault("Cache-Control", "no-store")
        return response

    async def streamed_job(events: AsyncIterator[Event]) -> StreamingResponse:
        """Stream while holding a job slot (released when it ends or the client leaves)."""
        return _streaming(events, jobs)

    async def run_job(fn, *args):
        await jobs.acquire()
        try:
            return await fn(*args)
        finally:
            jobs.release()

    def get_services(request: Request) -> Services:
        return request.app.state.services

    def guard(request: Request) -> None:
        security.check_api_key(request, settings)
        limiter.check(security.client_id(request, settings))

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", exc_info=exc)
        return JSONResponse({"error": "Internal server error."}, status_code=500)

    @app.get("/health")
    async def health(svc: Services = Depends(get_services)) -> dict:
        return {
            "status": "ok",
            "model_backend": settings.model_backend,
            "llm_backend": settings.llm_backend,
            "search_providers": svc.search.configured_providers(),
            "auth": bool(settings.backend_api_key),
            "version": _VERSION,
            "jobs": {"running": jobs.running, "waiting": jobs.waiting, "max": settings.max_concurrent_jobs},
        }

    @app.post("/transcribe", dependencies=[Depends(guard)])
    async def transcribe(
        file: UploadFile = File(...),
        language: Literal["kok", "en", "auto"] = Form("kok"),
        svc: Services = Depends(get_services),
    ) -> dict:
        data = await security.read_limited(file, settings.max_audio_bytes)
        suffix = security.audio_suffix(data)
        if suffix is None:
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported audio format.")
        fd, path = tempfile.mkstemp(suffix=suffix, prefix="kc-audio-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            text = await run_job(asyncio.to_thread, svc.stt.transcribe_file, path, language)
        except AudioError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        finally:
            try:
                os.remove(path)
            except OSError:
                pass
        return {"text": text, "language": language}

    @app.post("/memory/extract", dependencies=[Depends(guard)])
    async def memory_extract(body: MemoryRequest, svc: Services = Depends(get_services)) -> dict:
        """Propose an updated memory after an exchange. The browser decides whether to save it."""
        facts = await extract_memory(svc.llm, body.facts, body.question, body.answer)
        return {"facts": facts}

    @app.post("/translate", dependencies=[Depends(guard)])
    async def translate(body: TranslateRequest, svc: Services = Depends(get_services)) -> dict:
        """Plain translation with the Konkani model (Interpreter mode, documents)."""
        text = body.text.strip()
        if len(text) > settings.max_document_chars:
            raise HTTPException(
                413,
                f"Text is longer than {settings.max_document_chars} characters.",
            )
        if not text:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "There is no text to translate.")
        translation, direction = await run_job(translate_any, svc, text, body.direction)
        return {"translation": translation, "direction": direction}

    @app.post("/openai/v1/chat/completions", dependencies=[Depends(guard)])
    async def chat(body: ChatRequest, svc: Services = Depends(get_services)) -> StreamingResponse:
        messages = [IncomingMessage(m.role, m.content, m.english) for m in body.messages]
        memory = [m[:300] for m in body.memory]
        return await streamed_job(chat_events(svc, messages, body.language, body.output_language, memory))

    async def read_document(file: UploadFile) -> bytes:
        data = await security.read_limited(file, settings.max_document_bytes)
        if detect_kind(data) is None:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                "Unsupported file type. Upload a PDF, PNG, JPEG, WEBP or TIFF file.",
            )
        return data

    @app.post("/analyze-document", dependencies=[Depends(guard)])
    async def analyze(file: UploadFile = File(...), svc: Services = Depends(get_services)) -> dict:
        data = await read_document(file)
        try:
            return await run_job(analyze_document, svc, data)
        except DocumentError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    @app.post("/analyze-document/stream", dependencies=[Depends(guard)])
    async def analyze_stream(file: UploadFile = File(...), svc: Services = Depends(get_services)) -> StreamingResponse:
        """Same as /analyze-document, but reports progress as SSE ``status`` events
        and delivers the result as a ``result`` event."""
        data = await read_document(file)
        return await streamed_job(analyze_document_events(svc, data))

    @app.post("/document-chat", dependencies=[Depends(guard)])
    async def document_chat(body: DocumentChatRequest, svc: Services = Depends(get_services)) -> StreamingResponse:
        return await streamed_job(
            document_chat_events(svc, body.question, body.document_context, body.output_language)
        )

    return app
