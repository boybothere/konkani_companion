"""Prompt-injection and leakage guardrails.

Layers:
1. User input is normalised, stripped of control characters and length-capped.
2. Untrusted text (web pages, OCR output) is sanitised: instruction-like lines
   are neutralised and the text is wrapped in tags with a random nonce, inside
   the *user* message, never the system prompt.
3. The system prompt carries a secret canary. Output is checked for the canary
   and for long verbatim runs of the system prompt before anything is shown.
"""

from __future__ import annotations

import re
import secrets
import unicodedata
from dataclasses import dataclass

_INJECTION_PATTERNS: dict[str, re.Pattern[str]] = {
    "ignore_instructions": re.compile(
        r"\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|any|the|your|system)\b.{0,40}\b(instructions?|prompts?|rules?|guidelines?|directives?)\b",
        re.I,
    ),
    "role_change": re.compile(
        r"\b(you are now|from now on,? you|act as (an? )?(unfiltered|unrestricted|different)|pretend (to be|you are)|roleplay as)\b",
        re.I,
    ),
    "prompt_extraction": re.compile(
        r"\b(reveal|show|print|repeat|output|tell me|leak)\b.{0,40}\b(system prompt|your (instructions|prompt|rules)|hidden (prompt|instructions)|initial prompt)\b",
        re.I,
    ),
    "jailbreak_terms": re.compile(r"\b(jailbreak|developer mode|DAN mode|do anything now)\b", re.I),
    "fake_roles": re.compile(
        r"(^|\n)\s*(system|assistant|developer)\s*:|<\|?(im_start|im_end|system|endoftext)\|?>|\[/?(INST|SYS)\]",
        re.I,
    ),
    "fake_tags": re.compile(r"</?\s*(untrusted_\w+|system_role|instructions?)\b", re.I),
}

_ZERO_WIDTH = re.compile(r"[​-‏‪-‮⁠-⁤﻿]")
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_MANY_BLANK_LINES = re.compile(r"\n{3,}")


class InputRejected(ValueError):
    """Raised when user input is empty or unusable after cleaning."""


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = _ZERO_WIDTH.sub("", text)
    text = _CONTROL.sub("", text)
    return _MANY_BLANK_LINES.sub("\n\n", text).strip()


def scan(text: str) -> list[str]:
    """Names of injection patterns found in the text."""
    return [name for name, pattern in _INJECTION_PATTERNS.items() if pattern.search(text)]


def clean_user_input(text: str, max_chars: int) -> str:
    cleaned = normalise(text)[:max_chars].strip()
    if not cleaned:
        raise InputRejected("Message is empty.")
    return cleaned


def sanitize_untrusted(text: str, max_chars: int) -> str:
    """Neutralise instruction-like lines in third-party text."""
    text = normalise(text)
    lines = []
    for line in text.split("\n"):
        if scan(line):
            lines.append("[removed: instruction-like text from an untrusted source]")
        else:
            lines.append(line)
    text = "\n".join(lines)
    if len(text) > max_chars:
        text = text[:max_chars].rsplit(" ", 1)[0] + " …"
    return text


def wrap_untrusted(label: str, body: str) -> str:
    """Wrap untrusted content in tags the content itself cannot forge."""
    nonce = secrets.token_hex(4)
    tag = f"untrusted_{label}_{nonce}"
    body = body.replace(f"</{tag}", "")
    return f"<{tag}>\n{body}\n</{tag}>"


@dataclass
class LeakGuard:
    """Detects system prompt leakage in model output."""

    system_prompt: str
    canary: str
    shingle_words: int = 12

    def __post_init__(self) -> None:
        words = self._words(self.system_prompt)
        n = self.shingle_words
        self._shingles = {" ".join(words[i : i + n]) for i in range(max(0, len(words) - n + 1))}

    @staticmethod
    def _words(text: str) -> list[str]:
        return re.findall(r"[a-z0-9']+", text.lower())

    def leaked(self, output: str) -> bool:
        if self.canary and self.canary in output:
            return True
        words = self._words(output)
        n = self.shingle_words
        return any(" ".join(words[i : i + n]) in self._shingles for i in range(max(0, len(words) - n + 1)))


def new_canary() -> str:
    return f"KC-{secrets.token_hex(6)}"
