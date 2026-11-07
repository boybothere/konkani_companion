"""Reasoning model client (Groq), streaming, with a fallback model."""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator, Protocol

from .config import Settings

logger = logging.getLogger("konkani.llm")


class LLMError(RuntimeError):
    pass


class LLM(Protocol):
    def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]: ...

    async def complete(self, messages: list[dict[str, str]]) -> str: ...


class GroqLLM:
    def __init__(self, settings: Settings) -> None:
        from groq import AsyncGroq

        if not settings.groq_api_key:
            raise LLMError("GROQ_API_KEY is not set.")
        self.settings = settings
        self._unavailable: set[str] = set()  # models Groq reported as missing
        self.client = AsyncGroq(
            api_key=settings.groq_api_key, timeout=settings.groq_timeout_s, max_retries=1
        )

    def _models(self) -> list[str]:
        models = [self.settings.groq_model]
        fallback = self.settings.groq_fallback_model
        if fallback and fallback != self.settings.groq_model:
            models.append(fallback)
        return models

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        models = self._models()
        for index, model in enumerate(models):
            started = False
            try:
                kwargs: dict = {
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "max_tokens": self.settings.groq_max_tokens,
                    "temperature": self.settings.groq_temperature,
                }
                if model.startswith("openai/gpt-oss") and self.settings.groq_reasoning_effort:
                    kwargs["extra_body"] = {"reasoning_effort": self.settings.groq_reasoning_effort}
                response = await self.client.chat.completions.create(**kwargs)
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        started = True
                        yield delta
                return
            except Exception as exc:  # noqa: BLE001
                # Once text has been sent we can't switch models mid-answer.
                if started or index == len(models) - 1:
                    raise LLMError(f"{model} failed: {type(exc).__name__}") from exc
                logger.warning("model %s failed (%s), trying fallback", model, type(exc).__name__)

    async def complete(self, messages: list[dict[str, str]]) -> str:
        parts = [part async for part in self.stream(messages)]
        return "".join(parts).strip()

    async def classify(self, messages: list[dict[str, str]], model: str, max_tokens: int = 4) -> str:
        """A quick non-streamed call for small decisions (e.g. the search router).

        If ``model`` isn't available on this Groq account (404, e.g. retired),
        fall back to the main models and remember that, so later calls don't
        pay for the failed attempt again.
        """
        candidates = [m for m in [model, *self._models()] if m and m not in self._unavailable]
        last: Exception | None = None
        for name in dict.fromkeys(candidates):  # keep order, drop duplicates
            kwargs: dict = {"model": name, "messages": messages, "temperature": 0}
            if name.startswith("openai/gpt-oss"):
                # Reasoning models spend tokens thinking first; leave room for the answer.
                kwargs["max_tokens"] = max(max_tokens, 512)
                kwargs["extra_body"] = {"reasoning_effort": "low"}
            else:
                kwargs["max_tokens"] = max_tokens
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(**kwargs),
                    timeout=self.settings.search_router_timeout_s,
                )
                return (response.choices[0].message.content or "").strip()
            except Exception as exc:  # noqa: BLE001
                last = exc
                if getattr(exc, "status_code", None) in (400, 404):
                    logger.warning("router model %s unavailable (%s); using another model", name, type(exc).__name__)
                    self._unavailable.add(name)
                    continue
                raise
        raise LLMError("no router model available") from last


class MockLLM:
    """Deterministic stand-in for tests and frontend development."""

    def __init__(self, answer: str | None = None, word_delay_s: float = 0.0) -> None:
        self.word_delay_s = word_delay_s  # imitate a model writing over time (load tests)
        self.answer = answer or (
            "Panaji is the capital of Goa [1].\n\n"
            "It lies on the banks of the Mandovi river."
        )
        self.last_messages: list[dict[str, str]] = []
        self.route_reply = "SEARCH"  # what the search router answers in tests
        self.classified: list[str] = []

    async def classify(self, messages: list[dict[str, str]], model: str, max_tokens: int = 4) -> str:
        self.classified.append(messages[-1]["content"])
        return self.route_reply

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        self.last_messages = messages
        for word in self.answer.split(" "):
            if self.word_delay_s:
                await asyncio.sleep(self.word_delay_s)
            yield word + " "

    async def complete(self, messages: list[dict[str, str]]) -> str:
        return "".join([p async for p in self.stream(messages)]).strip()
