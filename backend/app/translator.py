"""Konkani <-> English translation with the fine-tuned Qwen LoRA."""

from __future__ import annotations

import logging
import queue
import threading
from concurrent.futures import Future
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


def _units(translator: Translator, texts: list[str], direction: Direction, batch_size: int) -> list[str]:
    """Translate several units, in GPU batches when the translator supports it."""
    batch = getattr(translator, "translate_batch", None)
    if batch is None or batch_size <= 1 or len(texts) <= 1:
        return [translator.translate_unit(t, direction) for t in texts]
    out: list[str] = []
    for i in range(0, len(texts), batch_size):
        out.extend(batch(texts[i : i + batch_size], direction))
    return out


def translate_segments(
    translator: Translator, texts: list[str], direction: Direction, batch_size: int = 1
) -> list[str]:
    """Translate a list of segments, keeping each one's markup and layout."""
    prepared = [prepare_for_translation(t) for t in texts]
    bodies = [p.body for p in prepared if p.body]
    translated = iter(_units(translator, bodies, direction, batch_size))
    return [
        restore_after_translation(p, next(translated)) if p.body else p.prefix.strip()
        for p in prepared
    ]


def translate_text(
    translator: Translator, text: str, direction: Direction, max_words: int, batch_size: int = 1
) -> str:
    """Translate arbitrary-length text, chunk by chunk, keeping its layout."""
    segments = chunk_text(text, max_words)
    with_text = [s.text for s in segments if s.text]
    translated = iter(translate_segments(translator, with_text, direction, batch_size))
    outputs = [next(translated) if s.text else "" for s in segments]
    return join_segments(segments, outputs)


def translate_segment(translator: Translator, text: str, direction: Direction) -> str:
    return translate_segments(translator, [text], direction)[0]


class BatchingTranslator:
    """Shares the GPU between users by translating their segments together.

    Every caller (any request, any thread) submits its text and waits. One
    worker thread takes whatever is waiting, up to ``max_batch`` items in the
    same direction, and translates them in a single ``translate_batch`` call.
    Under load this is the big win: ten users waiting for one sentence each
    cost about one GPU call instead of ten.
    """

    def __init__(self, inner: Translator, max_batch: int, max_wait_s: float = 0.005) -> None:
        self.inner = inner
        self.max_batch = max(1, max_batch)
        self.max_wait_s = max_wait_s
        self._queue: queue.Queue[tuple[str, Direction, Future[str]]] = queue.Queue()
        self._worker: threading.Thread | None = None
        self._start_lock = threading.Lock()

    def _ensure_worker(self) -> None:
        if self._worker is None:
            with self._start_lock:
                if self._worker is None:
                    self._worker = threading.Thread(target=self._run, name="translation-batcher", daemon=True)
                    self._worker.start()

    def _submit(self, text: str, direction: Direction) -> Future[str]:
        self._ensure_worker()
        future: Future[str] = Future()
        self._queue.put((text, direction, future))
        return future

    def translate_unit(self, text: str, direction: Direction) -> str:
        return self._submit(text, direction).result()

    def translate_batch(self, texts: list[str], direction: Direction) -> list[str]:
        futures = [self._submit(t, direction) for t in texts]
        return [f.result() for f in futures]

    def _run(self) -> None:
        held: list[tuple[str, Direction, Future[str]]] = []  # other-direction items for the next round
        while True:
            first = held.pop(0) if held else self._queue.get()
            batch = [first]
            # Collect what is already waiting (and anything arriving within a few ms).
            while len(batch) < self.max_batch:
                try:
                    item = self._queue.get(timeout=self.max_wait_s)
                except queue.Empty:
                    break
                if item[1] == first[1]:
                    batch.append(item)
                else:
                    held.append(item)
            texts = [t for t, _, _ in batch]
            try:
                if len(batch) > 1 and hasattr(self.inner, "translate_batch"):
                    outputs = self.inner.translate_batch(texts, first[1])  # type: ignore[attr-defined]
                else:
                    outputs = [self.inner.translate_unit(t, first[1]) for t in texts]
                for (_, _, future), out in zip(batch, outputs):
                    future.set_result(out)
            except Exception as exc:  # noqa: BLE001 - hand the error to every waiting caller
                for _, _, future in batch:
                    if not future.done():
                        future.set_exception(exc)


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

    def _budget(self, n_input: int, direction: Direction) -> int:
        room = self.settings.qwen_max_seq_length - n_input
        return min(
            self.settings.translate_max_new_tokens,
            max(64, int(n_input * _LENGTH_FACTOR[direction])),
            room,
        )

    def translate_batch(self, texts: list[str], direction: Direction) -> list[str]:
        """Translate several texts in one generate() call (left-padded batch).

        Much faster than one call per text on a GPU, because generation is
        memory-bound: a batch of 4 costs little more than a single text.
        """
        import torch

        if len(texts) == 1:
            return [self.translate_unit(texts[0], direction)]
        prompts = [
            self.tokenizer.apply_chat_template(
                [{"role": "system", "content": PROMPTS[direction]}, {"role": "user", "content": t}],
                tokenize=False,
                add_generation_prompt=True,
            )
            for t in texts
        ]
        tok = getattr(self.tokenizer, "tokenizer", self.tokenizer)  # processors wrap the tokenizer
        previous_side = tok.padding_side
        tok.padding_side = "left"  # decoder-only models must be left-padded for batching
        if tok.pad_token is None:
            tok.pad_token = tok.eos_token
        try:
            encoded = tok(prompts, return_tensors="pt", padding=True, add_special_tokens=False)
        finally:
            tok.padding_side = previous_side
        input_ids = encoded["input_ids"].to(self.model.device)
        attention_mask = encoded["attention_mask"].to(self.model.device)
        width = input_ids.shape[1]
        lengths = attention_mask.sum(dim=1).tolist()
        budget = max(self._budget(int(n), direction) for n in lengths)
        budget = min(budget, self.settings.qwen_max_seq_length - width)
        if budget <= 0:
            # Too long to batch safely: fall back to one at a time.
            return [self.translate_unit(t, direction) for t in texts]

        with self.lock, torch.inference_mode():
            output = self.model.generate(
                input_ids=input_ids,
                attention_mask=attention_mask,
                max_new_tokens=budget,
                do_sample=False,
                pad_token_id=tok.pad_token_id,
            )
        return [tok.decode(row[width:], skip_special_tokens=True).strip() for row in output]

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
        budget = self._budget(n_input, direction)
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
    """Marks text instead of translating; used for tests and GPU-less dev.

    With ``latency_s`` and a shared ``lock`` it imitates one GPU: each call (or
    batch) takes that long and calls run one at a time, which is what load
    tests need to see realistic queueing.
    """

    def __init__(self, latency_s: float = 0.0, lock: threading.Lock | None = None) -> None:
        self.calls: list[tuple[str, str]] = []
        self.batches: list[int] = []  # size of each batched call
        self.latency_s = latency_s
        self.lock = lock or threading.Lock()

    def _simulate_gpu(self) -> None:
        if self.latency_s > 0:
            import time

            with self.lock:
                time.sleep(self.latency_s)

    def _mark(self, text: str, direction: Direction) -> str:
        self.calls.append((direction, text))
        tag = "KOK" if direction == "en2kok" else "EN"
        return f"[{tag}] {text}"

    def translate_unit(self, text: str, direction: Direction) -> str:
        self._simulate_gpu()
        return self._mark(text, direction)

    def translate_batch(self, texts: list[str], direction: Direction) -> list[str]:
        self.batches.append(len(texts))
        self._simulate_gpu()  # one GPU call for the whole batch
        return [self._mark(t, direction) for t in texts]
