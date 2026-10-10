"""Web search with provider fallback: Firecrawl -> Tavily -> DuckDuckGo.

Each provider returns the same ``Source`` shape. The first provider that
returns results wins; failures are logged and the next one is tried.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable

import httpx

from .config import Settings

logger = logging.getLogger("konkani.search")

FIRECRAWL_URL = "https://api.firecrawl.dev/v1/search"
TAVILY_URL = "https://api.tavily.com/search"

_SMALL_TALK = re.compile(
    r"^\s*(hi|hii+|hello|hey|namaskar|namaste|dev borem korum|thanks?|thank you|ok(ay)?|bye|good (morning|afternoon|evening|night)|who are you|how are you)\W*$",
    re.I,
)


@dataclass(frozen=True)
class Source:
    title: str
    url: str
    content: str
    provider: str


@dataclass
class SearchResult:
    sources: list[Source]
    provider: str | None
    errors: list[str] = field(default_factory=list)


_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MD_NOISE = re.compile(r"[#>*_`|~]+")
_BARE_URL = re.compile(r"https?://\S+")


def make_snippet(text: str, limit: int = 280) -> str:
    """Short plain-text preview of a source for display (not sent to the model)."""
    text = _MD_IMAGE.sub(" ", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _BARE_URL.sub(" ", text)
    text = _MD_NOISE.sub(" ", text)
    text = " ".join(text.split())
    if len(text) > limit:
        text = text[:limit].rsplit(" ", 1)[0] + "…"
    return text


def should_search(query_en: str, mode: str) -> bool:
    if mode == "never":
        return False
    if mode == "always":
        return True
    return not _SMALL_TALK.match(query_en)


def _clean_sources(raw: list[Source], limit: int) -> list[Source]:
    seen: set[str] = set()
    out: list[Source] = []
    for source in raw:
        url = source.url.strip()
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        if not source.content.strip():
            continue
        seen.add(url)
        out.append(source)
        if len(out) >= limit:
            break
    return out


class SearchService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self._client = client or httpx.AsyncClient(timeout=settings.search_timeout_s)
        self._providers: dict[str, Callable[[str], Awaitable[list[Source]]]] = {
            "firecrawl": self._firecrawl,
            "tavily": self._tavily,
            "duckduckgo": self._duckduckgo,
        }

    def configured_providers(self) -> list[str]:
        available = []
        for name in self.settings.search_providers:
            if name == "firecrawl" and not self.settings.firecrawl_api_key:
                continue
            if name == "tavily" and not self.settings.tavily_api_key:
                continue
            if name == "duckduckgo" and _load_ddgs() is None:
                continue
            if name in self._providers:
                available.append(name)
        return available

    async def search(self, query: str) -> SearchResult:
        errors: list[str] = []
        for name in self.configured_providers():
            try:
                raw = await asyncio.wait_for(
                    self._providers[name](query), timeout=self.settings.search_timeout_s
                )
                sources = _clean_sources(raw, self.settings.search_max_results)
                if sources:
                    return SearchResult(sources=sources, provider=name, errors=errors)
                errors.append(f"{name}: no results")
            except Exception as exc:  # noqa: BLE001 - any provider failure falls through
                logger.warning("search provider %s failed: %s", name, type(exc).__name__)
                errors.append(f"{name}: {type(exc).__name__}")
        return SearchResult(sources=[], provider=None, errors=errors)

    async def _firecrawl(self, query: str) -> list[Source]:
        body: dict = {"query": query, "limit": self.settings.search_max_results}
        if self.settings.firecrawl_scrape:
            body["scrapeOptions"] = {"formats": ["markdown"], "onlyMainContent": True}
        response = await self._client.post(
            FIRECRAWL_URL,
            headers={"Authorization": f"Bearer {self.settings.firecrawl_api_key}"},
            json=body,
        )
        response.raise_for_status()
        data = response.json().get("data") or []
        if isinstance(data, dict):  # newer API versions group results by type
            data = data.get("web") or []
        sources = []
        for item in data:
            metadata = item.get("metadata") or {}
            sources.append(
                Source(
                    title=item.get("title") or metadata.get("title") or item.get("url", ""),
                    url=item.get("url") or metadata.get("sourceURL") or "",
                    content=item.get("markdown") or item.get("description") or "",
                    provider="firecrawl",
                )
            )
        return sources

    async def _tavily(self, query: str) -> list[Source]:
        response = await self._client.post(
            TAVILY_URL,
            headers={"Authorization": f"Bearer {self.settings.tavily_api_key}"},
            json={
                "query": query,
                "search_depth": "basic",
                "max_results": self.settings.search_max_results,
                "include_answer": False,
            },
        )
        response.raise_for_status()
        return [
            Source(
                title=item.get("title") or "",
                url=item.get("url") or "",
                content=item.get("content") or "",
                provider="tavily",
            )
            for item in response.json().get("results") or []
        ]

    async def _duckduckgo(self, query: str) -> list[Source]:
        ddgs_cls = _load_ddgs()
        if ddgs_cls is None:
            return []

        def run() -> list[dict]:
            return list(ddgs_cls().text(query, max_results=self.settings.search_max_results))

        results = await asyncio.to_thread(run)
        return [
            Source(
                title=item.get("title") or "",
                url=item.get("href") or item.get("url") or "",
                content=item.get("body") or "",
                provider="duckduckgo",
            )
            for item in results
        ]

    async def aclose(self) -> None:
        await self._client.aclose()


def _load_ddgs():
    try:
        from ddgs import DDGS  # type: ignore[import-not-found]

        return DDGS
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore[import-not-found]

            return DDGS
        except ImportError:
            return None
