"""All runtime configuration, read from environment variables.

Nothing secret is hard-coded here. On Colab the runner notebook copies
Colab Secrets into the environment; in Docker they come from an env file.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


def _str(name: str, default: str = "") -> str:
    value = os.getenv(name)
    return default if value is None or not value.strip() else value.strip()


def _int(name: str, default: int) -> int:
    value = _str(name)
    return int(value) if value else default


def _float(name: str, default: float) -> float:
    value = _str(name)
    return float(value) if value else default


def _bool(name: str, default: bool) -> bool:
    value = _str(name).lower()
    if not value:
        return default
    return value in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    return [item.strip().lower() for item in _str(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Which implementations to load. "mock" lets the API run without a GPU.
    model_backend: str
    llm_backend: str

    # Qwen translation bridge (prompts must match the LoRA training prompts).
    qwen_model: str
    qwen_max_seq_length: int
    translate_chunk_words: int
    translate_max_new_tokens: int

    # Speech
    whisper_model: str
    whisper_language: str

    # Reasoning
    groq_api_key: str
    groq_model: str
    groq_fallback_model: str
    groq_reasoning_effort: str
    groq_max_tokens: int
    groq_temperature: float
    groq_timeout_s: float

    # Web search
    firecrawl_api_key: str
    firecrawl_scrape: bool
    tavily_api_key: str
    search_providers: list[str]
    search_mode: str
    search_max_results: int
    search_source_chars: int
    search_timeout_s: float

    # Security and limits
    backend_api_key: str
    rate_limit_per_minute: int
    max_input_chars: int
    max_history_turns: int
    max_audio_bytes: int
    max_audio_seconds: int
    max_document_bytes: int
    max_document_pages: int
    max_document_chars: int

    # OCR
    ocr_langs: str
    ocr_min_chars_per_page: int
    ocr_force: bool
    ocr_dpi: int


def load_settings() -> Settings:
    return Settings(
        model_backend=_str("MODEL_BACKEND", "gpu").lower(),
        llm_backend=_str("LLM_BACKEND", "groq").lower(),
        qwen_model=_str("QWEN_MODEL", "braisefernz07/konkani-qwen-lora"),
        qwen_max_seq_length=_int("QWEN_MAX_SEQ_LENGTH", 2048),
        translate_chunk_words=_int("TRANSLATE_CHUNK_WORDS", 250),
        translate_max_new_tokens=_int("TRANSLATE_MAX_NEW_TOKENS", 1024),
        whisper_model=_str("WHISPER_MODEL", "medium"),
        whisper_language=_str("WHISPER_LANGUAGE", "hi"),
        groq_api_key=_str("GROQ_API_KEY"),
        groq_model=_str("GROQ_MODEL", "openai/gpt-oss-120b"),
        groq_fallback_model=_str("GROQ_FALLBACK_MODEL", "llama-3.3-70b-versatile"),
        groq_reasoning_effort=_str("GROQ_REASONING_EFFORT", "low"),
        groq_max_tokens=_int("GROQ_MAX_TOKENS", 2048),
        groq_temperature=_float("GROQ_TEMPERATURE", 0.3),
        groq_timeout_s=_float("GROQ_TIMEOUT_S", 60.0),
        firecrawl_api_key=_str("FIRECRAWL_API_KEY"),
        firecrawl_scrape=_bool("FIRECRAWL_SCRAPE", True),
        tavily_api_key=_str("TAVILY_API_KEY"),
        search_providers=_list("SEARCH_PROVIDERS", "firecrawl,tavily,duckduckgo"),
        search_mode=_str("SEARCH_MODE", "auto").lower(),
        search_max_results=_int("SEARCH_MAX_RESULTS", 5),
        search_source_chars=_int("SEARCH_SOURCE_CHARS", 1500),
        search_timeout_s=_float("SEARCH_TIMEOUT_S", 20.0),
        backend_api_key=_str("BACKEND_API_KEY"),
        rate_limit_per_minute=_int("RATE_LIMIT_PER_MINUTE", 30),
        max_input_chars=_int("MAX_INPUT_CHARS", 4000),
        max_history_turns=_int("MAX_HISTORY_TURNS", 6),
        max_audio_bytes=_int("MAX_AUDIO_BYTES", 10 * 1024 * 1024),
        max_audio_seconds=_int("MAX_AUDIO_SECONDS", 120),
        max_document_bytes=_int("MAX_DOCUMENT_BYTES", 15 * 1024 * 1024),
        max_document_pages=_int("MAX_DOCUMENT_PAGES", 10),
        max_document_chars=_int("MAX_DOCUMENT_CHARS", 6000),
        ocr_langs=_str("OCR_LANGS", "hin+mar+eng"),
        ocr_min_chars_per_page=_int("OCR_MIN_CHARS_PER_PAGE", 40),
        ocr_force=_bool("OCR_FORCE", False),
        ocr_dpi=_int("OCR_DPI", 300),
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
