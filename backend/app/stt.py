"""Speech-to-text with Whisper."""

from __future__ import annotations

import logging
import threading
from typing import Protocol

from .config import Settings

logger = logging.getLogger("konkani.stt")

SAMPLE_RATE = 16_000


class AudioError(ValueError):
    """The audio could not be decoded or breaks a limit."""


# Spoken language requested by the client -> Whisper language code.
# Whisper has no Konkani model; Hindi decoding gives Devanagari output that
# matches spoken Konkani best. "auto" lets Whisper detect the language.
def whisper_language(requested: str | None, default: str) -> str | None:
    if requested == "en":
        return "en"
    if requested == "auto":
        return None
    return default or None


class SpeechToText(Protocol):
    def transcribe_file(self, path: str, language: str | None = None) -> str: ...


class WhisperSTT:
    def __init__(self, settings: Settings, gpu_lock: threading.Lock) -> None:
        import whisper

        logger.info("Loading Whisper %s", settings.whisper_model)
        self._whisper = whisper
        self.model = whisper.load_model(settings.whisper_model)
        self.settings = settings
        self.lock = gpu_lock

    def transcribe_file(self, path: str, language: str | None = None) -> str:
        """Transcribe audio. ``language`` is "kok" (default), "en" or "auto"."""
        import torch

        try:
            # Decodes any format ffmpeg understands (webm/opus, ogg, wav, mp3, m4a).
            audio = self._whisper.load_audio(path)
        except Exception as exc:  # noqa: BLE001
            raise AudioError("Could not decode the audio file.") from exc

        seconds = len(audio) / SAMPLE_RATE
        if seconds > self.settings.max_audio_seconds:
            raise AudioError(f"Audio is longer than {self.settings.max_audio_seconds} seconds.")
        if seconds < 0.3:
            return ""

        with self.lock:
            result = self.model.transcribe(
                audio,
                language=whisper_language(language, self.settings.whisper_language),
                fp16=torch.cuda.is_available(),
            )
        return str(result.get("text", "")).strip()


class MockSTT:
    def __init__(self, text: str = "गोंयचो सद्याचो मुख्यमंत्री कोण?", english: str = "Who is the chief minister of Goa?") -> None:
        self.text = text
        self.english = english
        self.languages: list[str | None] = []

    def transcribe_file(self, path: str, language: str | None = None) -> str:
        self.languages.append(language)
        return self.english if language == "en" else self.text
