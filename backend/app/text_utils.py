"""Language detection, chunking and formatting helpers for translation."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterator

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_LATIN = re.compile(r"[A-Za-z]")
# Sentence ends: Latin punctuation and the Devanagari danda / double danda.
_SENTENCE_SPLIT = re.compile(r"(?<=[.!?।॥])\s+")
_LIST_PREFIX = re.compile(r"^(\s*(?:[-*•]|\d{1,3}[.)])\s+)")
_CITATION = re.compile(r"\[\d{1,2}\]")
_MARKDOWN_EMPHASIS = re.compile(r"(\*\*|__|\*(?=\S)|(?<=\S)\*|`)")
_HEADING = re.compile(r"^\s*#{1,6}\s+")


def devanagari_ratio(text: str) -> float:
    """Share of letters that are Devanagari (0 when there are no letters)."""
    dev = len(_DEVANAGARI.findall(text))
    lat = len(_LATIN.findall(text))
    total = dev + lat
    return dev / total if total else 0.0


def detect_input_language(text: str, hint: str = "en") -> str:
    """Return "kok" for Devanagari input and "en" for Latin input.

    The script decides; the UI toggle is only used when the text is mixed
    or has no letters. This keeps voice input (always Devanagari) on the
    Konkani path even if the toggle was left on English.
    """
    ratio = devanagari_ratio(text)
    if ratio >= 0.5:
        return "kok"
    if ratio <= 0.2 and _LATIN.search(text):
        return "en"
    return "kok" if hint == "kok" else "en"


def word_count(text: str) -> int:
    return len(text.split())


def split_sentences(text: str) -> list[str]:
    return [part.strip() for part in _SENTENCE_SPLIT.split(text) if part.strip()]


def _split_long(sentence: str, max_words: int) -> list[str]:
    words = sentence.split()
    return [" ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)]


def chunk_line(line: str, max_words: int) -> list[str]:
    """Split one line into sentence-aligned pieces of at most max_words."""
    line = line.strip()
    if not line:
        return []
    if word_count(line) <= max_words:
        return [line]
    pieces: list[str] = []
    current: list[str] = []
    count = 0
    for sentence in split_sentences(line):
        n = word_count(sentence)
        if n > max_words:
            if current:
                pieces.append(" ".join(current))
                current, count = [], 0
            pieces.extend(_split_long(sentence, max_words))
        elif count + n > max_words:
            pieces.append(" ".join(current))
            current, count = [sentence], n
        else:
            current.append(sentence)
            count += n
    if current:
        pieces.append(" ".join(current))
    return pieces


@dataclass(frozen=True)
class Segment:
    """A unit of text to translate, plus the separator that follows it."""

    text: str
    sep: str


def chunk_text(text: str, max_words: int = 250) -> list[Segment]:
    """Chunk text for translation, keeping line and paragraph structure.

    Every line is translated on its own (so lists stay lists), long lines are
    cut at sentence boundaries into pieces of at most ``max_words`` words, and
    blank lines are kept as separators so paragraphs survive translation.
    """
    segments: list[Segment] = []
    lines = text.strip().split("\n")
    for index, line in enumerate(lines):
        is_last = index == len(lines) - 1
        pieces = chunk_line(line, max_words)
        if not pieces:
            if not is_last:
                segments.append(Segment("", "\n"))
            continue
        for i, piece in enumerate(pieces):
            last_piece = i == len(pieces) - 1
            sep = (" " if not last_piece else ("" if is_last else "\n"))
            segments.append(Segment(piece, sep))
    return segments


def join_segments(segments: list[Segment], texts: list[str]) -> str:
    return "".join(t + s.sep for s, t in zip(segments, texts)).strip()


class StreamSegmenter:
    """Turns a token stream into translatable segments as soon as they complete.

    A segment is emitted at every newline, or earlier when a line grows past
    ``max_words`` and already contains complete sentences.
    """

    def __init__(self, max_words: int = 250) -> None:
        self.max_words = max_words
        self._buffer = ""

    def feed(self, token: str) -> Iterator[Segment]:
        self._buffer += token
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            pieces = chunk_line(line, self.max_words)
            if not pieces:
                yield Segment("", "\n")
                continue
            for i, piece in enumerate(pieces):
                yield Segment(piece, "\n" if i == len(pieces) - 1 else " ")
        if word_count(self._buffer) > self.max_words:
            sentences = split_sentences(self._buffer)
            if len(sentences) > 1:
                done, tail = sentences[:-1], sentences[-1]
                for piece in chunk_line(" ".join(done), self.max_words):
                    yield Segment(piece, " ")
                self._buffer = tail

    def flush(self) -> Iterator[Segment]:
        rest, self._buffer = self._buffer, ""
        pieces = chunk_line(rest, self.max_words)
        for i, piece in enumerate(pieces):
            yield Segment(piece, "" if i == len(pieces) - 1 else " ")


@dataclass(frozen=True)
class PreparedText:
    prefix: str
    body: str
    citations: tuple[str, ...]


def prepare_for_translation(text: str) -> PreparedText:
    """Keep list markers out of the model input and strip stray markdown."""
    text = _HEADING.sub("", text)
    text = _MARKDOWN_EMPHASIS.sub("", text)
    match = _LIST_PREFIX.match(text)
    prefix = ""
    if match:
        prefix = match.group(1).strip() + " "
        text = text[match.end() :]
    citations = tuple(dict.fromkeys(_CITATION.findall(text)))
    return PreparedText(prefix=prefix, body=text.strip(), citations=citations)


def restore_after_translation(prepared: PreparedText, translated: str) -> str:
    """Put the list marker back and re-attach citations the model dropped."""
    translated = translated.strip()
    missing = [c for c in prepared.citations if c not in translated]
    if missing:
        translated = f"{translated} {''.join(missing)}".strip()
    return f"{prepared.prefix}{translated}"
