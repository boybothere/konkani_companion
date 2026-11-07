"""Batched translation: same results as one-at-a-time, fewer GPU calls."""

import time
from dataclasses import replace

from app.llm import MockLLM
from app.translator import MockTranslator, translate_segments, translate_text
from test_api import answer_text, client_for, parse_sse


class SlowTranslator(MockTranslator):
    """Takes time per GPU call, like the real model, so segments pile up."""

    def translate_unit(self, text, direction):
        time.sleep(0.05)
        return super().translate_unit(text, direction)

    def translate_batch(self, texts, direction):
        time.sleep(0.05)  # one call, regardless of batch size
        self.batches.append(len(texts))
        return [MockTranslator.translate_unit(self, t, direction) for t in texts]


LINES = [f"Line number {i} says something about Goa." for i in range(1, 9)]


def test_translate_text_batches_chunks_and_keeps_layout():
    text = "\n\n".join(f"Paragraph {i}. " + "Goa has many beaches. " * 30 for i in range(5))
    single, batched = MockTranslator(), MockTranslator()
    one = translate_text(single, text, "en2kok", max_words=60, batch_size=1)
    many = translate_text(batched, text, "en2kok", max_words=60, batch_size=4)
    assert one == many
    assert single.batches == []
    assert batched.batches and max(batched.batches) <= 4
    assert sum(batched.batches) == len(batched.calls) == len(single.calls)


def test_translate_segments_keeps_markup_and_empty_segments():
    tr = MockTranslator()
    out = translate_segments(tr, ["- **Bold** point", "", "1. Second"], "en2kok", batch_size=4)
    assert out[1] == ""
    assert out[0].startswith("- ") and "[KOK]" in out[0]
    assert out[2].startswith("1. ")
    assert tr.batches == [2]


def test_streamed_answer_batches_waiting_segments_in_order(services):
    services.translator = SlowTranslator()
    services.llm = MockLLM("\n".join(LINES))
    with client_for(services) as client:
        r = client.post("/openai/v1/chat/completions", json={"messages": [{"role": "user", "content": "Hello, tell me about Goa"}]})
    text = answer_text(parse_sse(r.text))
    # Every line is translated, exactly once, in the original order.
    positions = [text.index(f"[KOK] {line}") for line in LINES]
    assert positions == sorted(positions)
    assert len(services.translator.calls) == len(LINES)
    # At least some segments were grouped into one GPU call.
    assert any(size > 1 for size in services.translator.batches)
    assert max(services.translator.batches) <= services.settings.translate_batch_size


def test_batching_can_be_switched_off(services):
    services.translator = SlowTranslator()
    services.llm = MockLLM("\n".join(LINES))
    services.settings = replace(services.settings, translate_batch_size=1)
    with client_for(services) as client:
        r = client.post("/openai/v1/chat/completions", json={"messages": [{"role": "user", "content": "Hello, tell me about Goa"}]})
    assert services.translator.batches == []
    assert all(f"[KOK] {line}" in answer_text(parse_sse(r.text)) for line in LINES)


def test_batched_stream_is_faster_than_one_at_a_time(services):
    def run(batch_size):
        svc = replace(services, translator=SlowTranslator(), llm=MockLLM("\n".join(LINES)))
        svc.settings = replace(services.settings, translate_batch_size=batch_size)
        start = time.perf_counter()
        with client_for(svc) as client:
            client.post("/openai/v1/chat/completions", json={"messages": [{"role": "user", "content": "Hello, tell me about Goa"}]})
        return time.perf_counter() - start

    sequential, batched = run(1), run(4)
    assert batched < sequential
