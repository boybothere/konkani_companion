"""Request authentication, rate limiting and upload checks."""

from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, UploadFile, status

from .config import Settings


def check_api_key(request: Request, settings: Settings) -> None:
    """Only the Next.js server (which holds BACKEND_API_KEY) may call the API."""
    expected = settings.backend_api_key
    if not expected:
        return  # dev mode; a warning is logged at startup
    provided = request.headers.get("x-api-key", "")
    if not secrets.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized")


class RateLimiter:
    """Sliding-window limit per client, kept in memory (single process)."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, client_id: str) -> None:
        if self.per_minute <= 0:
            return
        now = time.monotonic()
        hits = self._hits[client_id]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests. Please wait a minute.")
        hits.append(now)


def client_id(request: Request, settings: Settings) -> str:
    # X-Client-Id is set by the Next.js server; only trusted when the API key is in use.
    if settings.backend_api_key:
        forwarded = request.headers.get("x-client-id", "").strip()
        if forwarded:
            return forwarded[:128]
    return request.client.host if request.client else "unknown"


async def read_limited(upload: UploadFile, max_bytes: int) -> bytes:
    data = await upload.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(
            413,
            f"File is larger than {max_bytes // (1024 * 1024)} MB.",
        )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")
    return data


def audio_suffix(data: bytes) -> str | None:
    """Recognise common browser and phone audio formats by their first bytes."""
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return ".webm"
    if data[:4] == b"OggS":
        return ".ogg"
    if data[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return ".wav"
    if data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
        return ".mp3"
    if data[4:8] == b"ftyp":
        return ".m4a"
    if data[:4] == b"fLaC":
        return ".flac"
    return None
