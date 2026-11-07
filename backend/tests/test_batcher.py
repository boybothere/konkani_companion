"""Cross-request batching: many users' segments share GPU calls."""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from app.translator import BatchingTranslator, MockTranslator


class CountingGPU(MockTranslator):
    """One call at a time, each taking `delay` seconds, like a single GPU."""

    def __init__(self, delay=0.1):
        super().__init__(latency_s=delay)
        self.gpu_calls = 0

    def translate_unit(self, text, direction):
        self.gpu_calls += 1
        return super().translate_unit(text, direction)

    def translate_batch(self, texts, direction):
        self.gpu_calls += 1
        return super().translate_batch(texts, direction)


def test_concurrent_requests_share_gpu_calls_and_get_their_own_results():
    gpu = CountingGPU(delay=0.1)
    batcher = BatchingTranslator(gpu, max_batch=8)
    texts = [f"Sentence number {i}" for i in range(16)]
    with ThreadPoolExecutor(16) as pool:
        results = list(pool.map(lambda t: batcher.translate_unit(t, "en2kok"), texts))
    assert results == [f"[KOK] {t}" for t in texts]  # nobody gets someone else's translation
    assert gpu.gpu_calls <= 6  # vs 16 one-at-a-time
    assert max(gpu.batches) > 1


def test_batches_are_faster_than_one_at_a_time():
    texts = [f"Line {i}" for i in range(12)]

    def run(translator):
        start = time.perf_counter()
        with ThreadPoolExecutor(12) as pool:
            list(pool.map(lambda t: translator.translate_unit(t, "en2kok"), texts))
        return time.perf_counter() - start

    sequential = run(CountingGPU(delay=0.05))
    batched = run(BatchingTranslator(CountingGPU(delay=0.05), max_batch=8))
    assert batched < sequential / 2


def test_directions_are_never_mixed_in_one_batch():
    gpu = CountingGPU(delay=0.05)
    batcher = BatchingTranslator(gpu, max_batch=8)
    jobs = [("Hello", "en2kok"), ("नमस्कार", "kok2en")] * 5
    with ThreadPoolExecutor(10) as pool:
        out = list(pool.map(lambda j: batcher.translate_unit(*j), jobs))
    assert out == ["[KOK] Hello", "[EN] नमस्कार"] * 5


def test_translate_batch_through_the_batcher():
    batcher = BatchingTranslator(CountingGPU(delay=0.0), max_batch=4)
    assert batcher.translate_batch(["a", "b", "c"], "en2kok") == ["[KOK] a", "[KOK] b", "[KOK] c"]


def test_errors_reach_every_waiting_caller_and_the_worker_survives():
    class Broken(MockTranslator):
        fail = True

        def translate_unit(self, text, direction):
            if self.fail:
                raise RuntimeError("GPU out of memory")
            return super().translate_unit(text, direction)

        def translate_batch(self, texts, direction):
            return [self.translate_unit(t, direction) for t in texts]

    inner = Broken()
    batcher = BatchingTranslator(inner, max_batch=4)
    with pytest.raises(RuntimeError):
        batcher.translate_unit("x", "en2kok")
    inner.fail = False
    assert batcher.translate_unit("y", "en2kok") == "[KOK] y"
    assert any(t.name == "translation-batcher" and t.is_alive() for t in threading.enumerate())
