"""Reasoning model client (Groq), streaming, with a fallback model."""

from __future__ import annotations

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


class MockLLM:
    """Deterministic stand-in for tests and frontend development."""

    def __init__(self, answer: str | None = None) -> None:
        self.answer = answer or (
            "Panaji is the capital of Goa [1].\n\n"
            "It lies on the banks of the Mandovi river."
        )
        self.last_messages: list[dict[str, str]] = []

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        self.last_messages = messages
        for word in self.answer.split(" "):
            yield word + " "

    async def complete(self, messages: list[dict[str, str]]) -> str:
        return "".join([p async for p in self.stream(messages)]).strip()
