import os
import sys
from dataclasses import replace
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import load_settings  # noqa: E402
from app.llm import MockLLM  # noqa: E402
from app.ocr import ExtractResult  # noqa: E402
from app.pipeline import Services  # noqa: E402
from app.search import SearchResult, SearchService, Source  # noqa: E402
from app.stt import MockSTT  # noqa: E402
from app.translator import MockTranslator  # noqa: E402


class FakeSearch(SearchService):
    def __init__(self, settings, sources=None):
        super().__init__(settings)
        self.sources = sources if sources is not None else [
            Source("Goa capital", "https://example.org/goa", "Panaji is the capital of Goa.", "fake")
        ]
        self.queries: list[str] = []

    def configured_providers(self):
        return ["fake"]

    async def search(self, query):
        self.queries.append(query)
        return SearchResult(self.sources, "fake" if self.sources else None)


@pytest.fixture
def settings():
    for key in ("BACKEND_API_KEY", "GROQ_API_KEY", "FIRECRAWL_API_KEY", "TAVILY_API_KEY"):
        os.environ.pop(key, None)
    return replace(load_settings(), model_backend="mock", llm_backend="mock", rate_limit_per_minute=0)


@pytest.fixture
def services(settings):
    def extractor(data, _settings):
        return ExtractResult(text="गोंयांत पावस पडटा.", pages=1, method="ocr", truncated=False)

    return Services(
        settings=settings,
        translator=MockTranslator(),
        stt=MockSTT(),
        llm=MockLLM(),
        search=FakeSearch(settings),
        extractor=extractor,
    )
