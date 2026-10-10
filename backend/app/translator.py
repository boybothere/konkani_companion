"""Konkani <-> English translation with the fine-tuned Qwen LoRA."""

from __future__ import annotations

import logging
import threading
from typing import Literal, Protocol

from .config import Settings
from .text_utils import (
    chunk_text,
    join_segments,
    prepare_for_translation,
    restore_after_translation,
)

logger = logging.getLogger("konkani.translator")

Direction = Literal["kok2en", "en2kok"]

# These must match the prompts used when the LoRA was trained.
PROMPTS: dict[str, str] = {
    "kok2en": "Translate the following Devanagari Konkani text into English.",
    "en2kok": "Translate the following English text into Devanagari Konkani.",
}

# Output length budget relative to input tokens. Devanagari needs more
# tokens than English in the Qwen tokenizer, so en2kok gets a larger factor.
_LENGTH_FACTOR = {"kok2en": 1.5, "en2kok": 3.0}


class Translator(Protocol):
    def translate_unit(self, text: str, direction: Direction) -> str: ...


def translate_text(translator: Translator, text: str, direction: Direction, max_words: int) -> str:
    """Translate arbitrary-length text, chunk by chunk, keeping its layout."""
    segments = chunk_text(text, max_words)
    outputs = [translate_segment(translator, s.text, direction) if s.text else "" for s in segments]
    return join_segments(segments, outputs)


def translate_segment(translator: Translator, text: str, direction: Direction) -> str:
    prepared = prepare_for_translation(text)
    if not prepared.body:
        return prepared.prefix.strip()
    translated = translator.translate_unit(prepared.body, direction)
    return restore_after_translation(prepared, translated)


class QwenTranslator:
    def __init__(self, settings: Settings, gpu_lock: threading.Lock) -> None:
        # Unsloth must be imported before transformers.
        from unsloth import FastLanguageModel
        from unsloth.chat_templates import get_chat_template

        logger.info("Loading Qwen translator %s", settings.qwen_model)
        model, tokenizer = FastLanguageModel.from_pretrained(
            model_name=settings.qwen_model,
            max_seq_length=settings.qwen_max_seq_length,
            load_in_4bit=True,
        )
        FastLanguageModel.for_inference(model)
        self.model = model
        self.tokenizer = get_chat_template(tokenizer, chat_template="chatml")
        self.settings = settings
        self.lock = gpu_lock

    def translate_unit(self, text: str, direction: Direction) -> str:
        import torch

        messages = [
            {"role": "system", "content": PROMPTS[direction]},
            {"role": "user", "content": text},
        ]
        encoded = self.tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
        if isinstance(encoded, torch.Tensor):
            input_ids, attention_mask = encoded, None
        else:
            input_ids, attention_mask = encoded["input_ids"], encoded.get("attention_mask")
        input_ids = input_ids.to(self.model.device)
        if attention_mask is not None:
            attention_mask = attention_mask.to(self.model.device)

        n_input = input_ids.shape[1]
        room = self.settings.qwen_max_seq_length - n_input
        budget = min(
            self.settings.translate_max_new_tokens,
            max(64, int(n_input * _LENGTH_FACTOR[direction])),
            room,
        )
        if budget <= 0:
            raise ValueError("Text is too long for one translation call.")

        pad_id = self.tokenizer.pad_token_id or self.tokenizer.eos_token_id
        with self.lock, torch.inference_mode():
            output = self.model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=budget,
                do_sample=False,
                pad_token_id=pad_id,
            )
        generated = output[0, n_input:]
        if generated.shape[0] >= budget:
            logger.warning(
                "translation hit the %d-token budget (%s, %d input tokens); output may be cut off",
                budget,
                direction,
                n_input,
            )
        return self.tokenizer.decode(generated, skip_special_tokens=True).strip()


class MockTranslator:
    """Marks text instead of translating; used for tests and GPU-less dev."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def translate_unit(self, text: str, direction: Direction) -> str:
        self.calls.append((direction, text))
        tag = "KOK" if direction == "en2kok" else "EN"
        return f"[{tag}] {text}"
