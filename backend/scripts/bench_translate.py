"""Benchmark one-at-a-time vs batched translation on the GPU.

Run on the Lightning Studio (T4), from the backend folder, with the server stopped
(both load the model and share one GPU):

    cd ~/konkani_companion/backend
    python scripts/bench_translate.py            # default batch sizes 1, 2, 4, 8
    python scripts/bench_translate.py 1 4 6      # custom batch sizes

It prints the time per configuration and whether batched outputs match the
one-at-a-time outputs (greedy decoding should give the same text).
"""

from __future__ import annotations

import statistics
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.translator import QwenTranslator, translate_text  # noqa: E402

SENTENCES_EN = [
    "Panaji is the capital of Goa and lies on the banks of the Mandovi river.",
    "The monsoon usually reaches Goa in the first week of June.",
    "Residents should store enough drinking water before the supply is interrupted.",
    "The Basilica of Bom Jesus is a UNESCO World Heritage Site in Old Goa.",
    "Fishermen do not go out to sea during the monsoon ban period.",
    "Please submit the application form at the ward office within thirty days.",
    "Dudhsagar Falls is a four-tiered waterfall on the Mandovi river.",
    "Konkani is the official language of Goa.",
]

DOCUMENT_EN = "\n\n".join(" ".join(SENTENCES_EN[i:] + SENTENCES_EN[:i]) for i in range(6))


def timed(fn, repeats: int = 2):
    times, result = [], None
    for _ in range(repeats):
        start = time.perf_counter()
        result = fn()
        times.append(time.perf_counter() - start)
    return statistics.median(times), result


def main() -> None:
    sizes = [int(a) for a in sys.argv[1:]] or [1, 2, 4, 8]
    settings = get_settings()
    print(f"Loading {settings.qwen_model} …")
    translator = QwenTranslator(settings, threading.Lock())

    # Warm-up (first CUDA calls are slow).
    translator.translate_unit(SENTENCES_EN[0], "en2kok")

    print("\n== Streaming case: 8 sentences, en2kok ==")
    base_time, base = timed(lambda: [translator.translate_unit(s, "en2kok") for s in SENTENCES_EN])
    print(f"one at a time : {base_time:6.2f} s")
    for size in sizes:
        if size <= 1:
            continue

        def batched(size=size):
            out = []
            for i in range(0, len(SENTENCES_EN), size):
                out.extend(translator.translate_batch(SENTENCES_EN[i : i + size], "en2kok"))
            return out

        t, out = timed(batched)
        same = sum(a == b for a, b in zip(base, out))
        print(f"batch of {size:<4} : {t:6.2f} s  ({base_time / t:4.2f}x)  identical outputs: {same}/{len(base)}")

    print(f"\n== Document case: {len(DOCUMENT_EN.split())} words, en2kok, chunk {settings.translate_chunk_words} words ==")
    doc_base_time, doc_base = timed(lambda: translate_text(translator, DOCUMENT_EN, "en2kok", 60, 1), repeats=1)
    print(f"one at a time : {doc_base_time:6.2f} s")
    for size in sizes:
        if size <= 1:
            continue
        t, out = timed(lambda size=size: translate_text(translator, DOCUMENT_EN, "en2kok", 60, size), repeats=1)
        print(f"batch of {size:<4} : {t:6.2f} s  ({doc_base_time / t:4.2f}x)  identical: {out == doc_base}")

    print("\nSample output:\n", base[0])
    print("\nSet TRANSLATE_BATCH_SIZE in backend/.env to the fastest size that keeps outputs identical.")


if __name__ == "__main__":
    main()
