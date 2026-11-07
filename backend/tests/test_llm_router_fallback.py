"""The router falls back to a working model when its model is unavailable."""

import asyncio
from dataclasses import replace
from types import SimpleNamespace

import pytest

from app.llm import GroqLLM, LLMError


class NotFound(Exception):
    status_code = 404


class FakeCompletions:
    def __init__(self, missing):
        self.missing = set(missing)
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        if kwargs["model"] in self.missing:
            raise NotFound(kwargs["model"])
        content = '{"search": false, "query": ""}'
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=content))])


def make_llm(settings, missing):
    llm = GroqLLM.__new__(GroqLLM)  # skip the real client
    llm.settings = replace(settings, groq_model="openai/gpt-oss-120b", groq_fallback_model="llama-3.3-70b-versatile")
    llm._unavailable = set()
    completions = FakeCompletions(missing)
    llm.client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return llm, completions


def test_missing_router_model_falls_back_and_is_remembered(settings):
    llm, calls = make_llm(settings, missing={"llama-3.1-8b-instant"})
    msgs = [{"role": "user", "content": "x"}]
    assert asyncio.run(llm.classify(msgs, "llama-3.1-8b-instant", 80)) == '{"search": false, "query": ""}'
    assert [c["model"] for c in calls.calls] == ["llama-3.1-8b-instant", "openai/gpt-oss-120b"]
    # gpt-oss gets room to think and low effort.
    assert calls.calls[1]["max_tokens"] >= 512 and calls.calls[1]["extra_body"] == {"reasoning_effort": "low"}
    # Next call skips the missing model straight away.
    asyncio.run(llm.classify(msgs, "llama-3.1-8b-instant", 80))
    assert [c["model"] for c in calls.calls][2:] == ["openai/gpt-oss-120b"]


def test_all_models_missing_raises(settings):
    llm, _ = make_llm(settings, missing={"a", "openai/gpt-oss-120b", "llama-3.3-70b-versatile"})
    with pytest.raises(LLMError):
        asyncio.run(llm.classify([{"role": "user", "content": "x"}], "a", 4))
