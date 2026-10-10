"""Request orchestration.

Chat flow (output is always Devanagari Konkani):
    input -> detect script -> [Qwen kok2en] -> [web search] -> Groq (streamed)
          -> segment at line/sentence boundaries -> Qwen en2kok per segment -> SSE

Groq keeps generating while earlier segments are being translated, so the
first Konkani text arrives after the first complete line, not the whole answer.
"""

from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Callable

from . import guardrails, prompts
from .config import Settings
from .llm import LLM, GroqLLM, LLMError, MockLLM
from .ocr import DocumentError, ExtractResult, extract_text
from .search import SearchService, Source, make_snippet, should_search
from .stt import MockSTT, SpeechToText
from .text_utils import Segment, StreamSegmenter, detect_input_language, devanagari_ratio
from .translator import MockTranslator, Translator, translate_segment, translate_text

logger = logging.getLogger("konkani.pipeline")

REFUSAL_EN = "Sorry, I can't share that. Please ask me something else."


@dataclass
class Event:
    type: str  # status | meta | sources | delta | english | error | done
    data: Any = None


@dataclass
class Services:
    settings: Settings
    translator: Translator
    stt: SpeechToText
    llm: LLM
    search: SearchService
    extractor: Callable[[bytes, Settings], ExtractResult] = extract_text
    canary: str = field(default_factory=guardrails.new_canary)


def build_services(settings: Settings) -> Services:
    """Load models and clients. Slow on GPU (model download + load)."""
    if settings.model_backend == "mock":
        translator: Translator = MockTranslator()
        stt: SpeechToText = MockSTT()
    else:
        from .stt import WhisperSTT
        from .translator import QwenTranslator

        gpu_lock = threading.Lock()  # one GPU job at a time
        translator = QwenTranslator(settings, gpu_lock)
        stt = WhisperSTT(settings, gpu_lock)
    llm: LLM = MockLLM() if settings.llm_backend == "mock" else GroqLLM(settings)
    return Services(settings=settings, translator=translator, stt=stt, llm=llm, search=SearchService(settings))


@dataclass(frozen=True)
class IncomingMessage:
    role: str
    content: str
    english: str | None = None


def _history(messages: list[IncomingMessage], settings: Settings) -> list[prompts.HistoryTurn]:
    """English history for the reasoning model.

    The browser stores the English version of each turn (sent back to it in
    ``meta`` and ``english`` events). Turns without an English version are
    used only if they are already in English.
    """
    turns: list[prompts.HistoryTurn] = []
    for message in messages[-settings.max_history_turns * 2 :]:
        if message.role not in ("user", "assistant"):
            continue  # clients may not inject system messages
        text = message.english or message.content
        if not text or devanagari_ratio(text) >= 0.5:
            continue
        turns.append(prompts.HistoryTurn(message.role, guardrails.normalise(text)[:1500]))
    return turns


async def _translate(services: Services, text: str, direction: str) -> str:
    return await asyncio.to_thread(
        translate_text, services.translator, text, direction, services.settings.translate_chunk_words
    )


async def _answer_events(
    services: Services, llm_messages: list[dict[str, str]], system_prompt: str
) -> AsyncIterator[Event]:
    """Stream the reasoning model, translating each finished segment."""
    settings = services.settings
    leak_guard = guardrails.LeakGuard(system_prompt=system_prompt, canary=services.canary)
    queue: asyncio.Queue[Segment | Exception | None] = asyncio.Queue()
    english_parts: list[str] = []

    async def produce() -> None:
        segmenter = StreamSegmenter(settings.translate_chunk_words)
        try:
            async for token in services.llm.stream(llm_messages):
                english_parts.append(token)
                for segment in segmenter.feed(token):
                    await queue.put(segment)
            for segment in segmenter.flush():
                await queue.put(segment)
            await queue.put(None)
        except Exception as exc:  # noqa: BLE001
            await queue.put(exc)

    producer = asyncio.create_task(produce())
    emitted_any = False
    try:
        while True:
            item = await queue.get()
            if item is None:
                break
            if isinstance(item, Exception):
                logger.error("reasoning model failed: %s", item)
                yield Event("error", {"message": "The reasoning service failed. Please try again."})
                break
            if not item.text:
                if emitted_any:
                    yield Event("english_delta", item.sep)
                    yield Event("delta", item.sep)
                continue
            if leak_guard.leaked("".join(english_parts)):
                logger.warning("blocked output: system prompt leakage detected")
                producer.cancel()
                refusal = await asyncio.to_thread(
                    translate_segment, services.translator, REFUSAL_EN, "en2kok"
                )
                prefix = "\n\n" if emitted_any else ""
                yield Event("english_delta", prefix + REFUSAL_EN)
                yield Event("delta", prefix + refusal)
                english_parts[:] = [REFUSAL_EN]
                break
            # The English segment is ready before its translation, so clients
            # that show both languages can display it straight away.
            yield Event("english_delta", item.text + item.sep)
            if not emitted_any:
                yield Event("status", {"stage": "translating"})
            konkani = await asyncio.to_thread(
                translate_segment, services.translator, item.text, "en2kok"
            )
            yield Event("delta", konkani + item.sep)
            emitted_any = True
    finally:
        if not producer.done():
            producer.cancel()

    yield Event("english", {"text": "".join(english_parts).strip()})


def _public_sources(sources: list[Source]) -> list[dict[str, Any]]:
    return [
        {
            "id": i,
            "title": s.title[:200],
            "url": s.url,
            "provider": s.provider,
            "snippet": make_snippet(guardrails.normalise(s.content)),
        }
        for i, s in enumerate(sources, start=1)
    ]


async def chat_events(
    services: Services, messages: list[IncomingMessage], language_hint: str
) -> AsyncIterator[Event]:
    settings = services.settings
    try:
        user_text = guardrails.clean_user_input(messages[-1].content, settings.max_input_chars)
    except guardrails.InputRejected as exc:
        yield Event("error", {"message": str(exc)})
        yield Event("done")
        return

    input_lang = detect_input_language(user_text, language_hint)
    if input_lang == "kok":
        yield Event("status", {"stage": "understanding"})
        query_en = await _translate(services, user_text, "kok2en")
    else:
        query_en = user_text
    flags = guardrails.scan(query_en)
    if flags:
        logger.info("user input matched injection patterns: %s", flags)
    yield Event("meta", {"input_language": input_lang, "query_en": query_en})

    sources: list[Source] = []
    attempted = should_search(query_en, settings.search_mode)
    if attempted:
        yield Event("status", {"stage": "searching"})
        result = await services.search.search(query_en)
        sources = result.sources
        if result.errors:
            logger.info("search errors: %s", result.errors)
        yield Event("sources", {"provider": result.provider, "sources": _public_sources(sources)})

    yield Event("status", {"stage": "thinking"})
    system_prompt = prompts.chat_system_prompt(services.canary)
    llm_messages = prompts.build_chat_messages(
        system_prompt,
        _history(messages[:-1], settings),
        query_en,
        sources,
        attempted,
        settings.search_source_chars,
    )
    async for event in _answer_events(services, llm_messages, system_prompt):
        yield event
    yield Event("done")


async def document_chat_events(
    services: Services, question: str, document_en: str
) -> AsyncIterator[Event]:
    settings = services.settings
    try:
        question = guardrails.clean_user_input(question, settings.max_input_chars)
    except guardrails.InputRejected as exc:
        yield Event("error", {"message": str(exc)})
        yield Event("done")
        return

    if detect_input_language(question) == "kok":
        yield Event("status", {"stage": "understanding"})
        question_en = await _translate(services, question, "kok2en")
    else:
        question_en = question
    yield Event("meta", {"input_language": detect_input_language(question), "query_en": question_en})

    yield Event("status", {"stage": "thinking"})
    system_prompt = prompts.document_system_prompt(services.canary)
    llm_messages = prompts.build_document_messages(
        system_prompt, document_en, f"User question:\n{question_en}", settings.max_document_chars
    )
    async for event in _answer_events(services, llm_messages, system_prompt):
        yield event
    yield Event("done")


async def analyze_document_events(services: Services, data: bytes) -> AsyncIterator[Event]:
    """OCR -> English -> summary -> Konkani summary, reporting each stage.

    Emits ``status`` events as each stage starts, then one ``result`` event with
    the shape the Document Lens UI expects, then ``done``. Unreadable files
    produce an ``error`` event instead of a result.
    """
    settings = services.settings
    yield Event("status", {"stage": "extracting"})
    try:
        extracted = await asyncio.to_thread(services.extractor, data, settings)
    except DocumentError as exc:
        yield Event("error", {"message": str(exc)})
        yield Event("done")
        return
    text = extracted.text.strip()
    if not text:
        yield Event("result", {
            "ocr_text": "",
            "english_translation": "",
            "summary": "No readable text was found in this document.",
            "error": True,
        })
        yield Event("done")
        return

    truncated = extracted.truncated or len(text) > settings.max_document_chars
    text = text[: settings.max_document_chars]

    if detect_input_language(text) == "kok":
        yield Event("status", {"stage": "translating_document"})
        english = await _translate(services, text, "kok2en")
    else:
        english = text

    yield Event("status", {"stage": "summarizing"})
    system_prompt = prompts.document_system_prompt(services.canary)
    messages = prompts.build_document_messages(
        system_prompt, english, prompts.SUMMARY_INSTRUCTION, settings.max_document_chars
    )
    try:
        summary_en = await services.llm.complete(messages)
    except LLMError:
        logger.exception("summary failed")
        yield Event("result", {
            "ocr_text": text,
            "english_translation": english,
            "summary": "The text was extracted, but the summary service failed. Please try again.",
            "error": True,
        })
        yield Event("done")
        return
    if guardrails.LeakGuard(system_prompt, services.canary).leaked(summary_en):
        summary_en = REFUSAL_EN
    summary = await _translate(services, summary_en, "en2kok")

    yield Event("result", {
        "ocr_text": text,
        "english_translation": english,
        "summary": summary,
        "summary_english": summary_en,
        "error": False,
        "pages": extracted.pages,
        "method": extracted.method,
        "truncated": truncated,
    })
    yield Event("done")


async def analyze_document(services: Services, data: bytes) -> dict[str, Any]:
    """Non-streaming version of ``analyze_document_events``.

    Raises ``DocumentError`` for unreadable files.
    """
    async for event in analyze_document_events(services, data):
        if event.type == "error":
            raise DocumentError(event.data["message"])
        if event.type == "result":
            return event.data
    raise RuntimeError("document analysis ended without a result")
