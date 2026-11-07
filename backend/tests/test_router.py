"""Routing: translation requests skip search and the reasoning model; search only when needed."""

import asyncio
from dataclasses import replace

import pytest

from app.llm import MockLLM
from app.router import detect_translation, needs_search, rule_decision
from test_api import answer_text, client_for, parse_sse


@pytest.mark.parametrize(
    "message, text, target",
    [
        ('Translate the given sentence to english "गोंयची राजधानी खंयची?"', "गोंयची राजधानी खंयची?", "en"),
        ("translate to konkani: Where is the bus stand?", "Where is the bus stand?", "kok"),
        ("Translate 'Good morning, how are you?' into Konkani", "Good morning, how are you?", "kok"),
        ("Please translate this sentence: बाजार खंय आसा?", "बाजार खंय आसा?", "en"),
        ("translate where is the market to konkani", "where is the market", "kok"),
        ("translate गोंय सोबीत आसा", "गोंय सोबीत आसा", "en"),  # no target: the other language
        ('What does "देव बरें करूं" mean in English?', "देव बरें करूं", "en"),
        ("How do you say thank you in Konkani?", "thank you", "kok"),
        ("हें इंग्लीशींत अणकार कर: म्हाका उदक जाय", "म्हाका उदक जाय", "en"),
        ("“Where is the hospital?” कोंकणींत", "Where is the hospital?", "kok"),
    ],
)
def test_translation_requests_are_detected(message, text, target):
    req = detect_translation(message)
    assert req is not None, message
    assert (req.text, req.target) == (text, target)


@pytest.mark.parametrize(
    "message",
    [
        "What is the capital of Goa?",
        "Tell me about the history of the Konkani language",
        "गोंयची राजधानी खंयची?",
        "Is English or Konkani older?",
        "translate to english",  # nothing to translate
        'Translate "Hello there" to English',  # already English
        "हांव कोंकणींत उलयता",  # mentions Konkani, no request
    ],
)
def test_ordinary_questions_are_not_translations(message):
    assert detect_translation(message) is None


@pytest.mark.parametrize(
    "query, expected",
    [
        ("hello", False),
        ("thank you!", False),
        ("What is the weather in Panaji today?", True),
        ("latest news about Goa elections", True),
        ("Who is the current chief minister of Goa?", True),
        ("price of cashew per kg", True),
        ("What is 245 * 12?", None),
        ("245 * 12", False),
        ("Write a poem about the monsoon", False),
        ("What is the meaning of serendipity?", False),
        ("Explain photosynthesis simply", None),
    ],
)
def test_rules(query, expected):
    assert rule_decision(query) is expected


def test_router_model_decides_unclear_cases(settings):
    llm = MockLLM()
    llm.route_reply = "NO"
    assert asyncio.run(needs_search(llm, settings, "Explain photosynthesis simply")) is False
    llm.route_reply = "SEARCH"
    assert asyncio.run(needs_search(llm, settings, "Explain photosynthesis simply")) is True
    assert len(llm.classified) == 2
    # Clear cases never call the model.
    asyncio.run(needs_search(llm, settings, "weather in Margao today"))
    assert len(llm.classified) == 2


def test_router_failure_falls_back_to_searching(settings):
    class Down(MockLLM):
        async def classify(self, messages, model, max_tokens=4):
            raise TimeoutError

    assert asyncio.run(needs_search(Down(), settings, "Explain photosynthesis simply")) is True


def test_search_mode_overrides_the_router(settings):
    llm = MockLLM()
    llm.route_reply = "NO"
    assert asyncio.run(needs_search(llm, replace(settings, search_mode="always"), "hello")) is True
    assert asyncio.run(needs_search(llm, replace(settings, search_mode="never"), "news today")) is False


def test_translation_request_skips_search_and_reasoning(services):
    with client_for(services) as client:
        r = client.post(
            "/openai/v1/chat/completions",
            json={"messages": [{"role": "user", "content": 'Translate the given sentence to english "गोंयची राजधानी खंयची?"'}]},
        )
    events = parse_sse(r.text)
    names = [n for n, _ in events]
    assert "sources" not in names
    assert services.search.queries == []  # no web search
    assert services.llm.last_messages == []  # the reasoning model was never called
    assert services.translator.calls == [("kok2en", "गोंयची राजधानी खंयची?")]
    assert answer_text(events).strip() == "[EN] गोंयची राजधानी खंयची?"
    meta = next(d for n, d in events if n == "meta")
    assert meta["route"] == "translate" and meta["output_language"] == "en"
    assert events[-1][1] == "[DONE]"


def test_router_says_no_search_then_answer_has_no_sources(services):
    services.llm.route_reply = "NO"
    with client_for(services) as client:
        r = client.post("/openai/v1/chat/completions", json={"messages": [{"role": "user", "content": "Explain photosynthesis simply"}]})
    assert "sources" not in [n for n, _ in parse_sse(r.text)]
    assert services.search.queries == []
    assert "[KOK]" in answer_text(parse_sse(r.text))
