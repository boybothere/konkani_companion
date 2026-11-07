"""English mode, spoken-language selection and the /translate endpoint."""

from dataclasses import replace

from app.stt import whisper_language
from test_api import answer_text, client_for, parse_sse

WEBM = b"\x1a\x45\xdf\xa3" + b"0" * 100


def test_english_mode_streams_english_without_konkani_translation(services):
    with client_for(services) as client:
        r = client.post(
            "/openai/v1/chat/completions",
            json={
                "messages": [{"role": "user", "content": "What is the capital of Goa?"}],
                "language": "en",
                "output_language": "en",
            },
        )
    events = parse_sse(r.text)
    text = answer_text(events)
    assert "Panaji is the capital of Goa [1]." in text
    assert "[KOK]" not in text
    assert not any(direction == "en2kok" for direction, _ in services.translator.calls)
    meta = next(d for n, d in events if n == "meta")
    assert meta["output_language"] == "en"


def test_english_mode_still_understands_konkani_questions(services):
    with client_for(services) as client:
        r = client.post(
            "/openai/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "गोंयची राजधानी खंयची?"}], "output_language": "en"},
        )
    assert services.translator.calls[0] == ("kok2en", "गोंयची राजधानी खंयची?")
    assert [d for d, _ in services.translator.calls] == ["kok2en"]
    assert "[KOK]" not in answer_text(parse_sse(r.text))


def test_konkani_is_still_the_default_output(services):
    with client_for(services) as client:
        r = client.post("/openai/v1/chat/completions", json={"messages": [{"role": "user", "content": "Hi there, tell me about Goa"}]})
    assert "[KOK]" in answer_text(parse_sse(r.text))


def test_invalid_output_language_is_rejected(services):
    with client_for(services) as client:
        r = client.post(
            "/openai/v1/chat/completions",
            json={"messages": [{"role": "user", "content": "hi"}], "output_language": "fr"},
        )
    assert r.status_code == 422


def test_document_chat_english_mode(services):
    with client_for(services) as client:
        r = client.post(
            "/document-chat",
            json={"question": "What is this about?", "document_context": "Rain in Goa.", "output_language": "en"},
        )
    assert r.status_code == 200
    assert "[KOK]" not in answer_text(parse_sse(r.text))


def test_transcribe_passes_the_spoken_language(services):
    with client_for(services) as client:
        default = client.post("/transcribe", files={"file": ("a.webm", WEBM, "audio/webm")})
        english = client.post("/transcribe", files={"file": ("a.webm", WEBM, "audio/webm")}, data={"language": "en"})
        bad = client.post("/transcribe", files={"file": ("a.webm", WEBM, "audio/webm")}, data={"language": "fr"})
    assert default.json() == {"text": services.stt.text, "language": "kok"}
    assert english.json() == {"text": services.stt.english, "language": "en"}
    assert bad.status_code == 422
    assert services.stt.languages == ["kok", "en"]


def test_whisper_language_mapping():
    assert whisper_language("en", "hi") == "en"
    assert whisper_language("kok", "hi") == "hi"
    assert whisper_language(None, "hi") == "hi"
    assert whisper_language("auto", "hi") is None


def test_translate_auto_detects_direction(services):
    with client_for(services) as client:
        to_en = client.post("/translate", json={"text": "गोंयांत पावस पडटा."})
        to_kok = client.post("/translate", json={"text": "It is raining in Goa."})
    assert to_en.json() == {"translation": "[EN] गोंयांत पावस पडटा.", "direction": "kok2en"}
    assert to_kok.json() == {"translation": "[KOK] It is raining in Goa.", "direction": "en2kok"}


def test_translate_explicit_direction_and_long_text(services):
    with client_for(services) as client:
        forced = client.post("/translate", json={"text": "Hello", "direction": "en2kok"})
        long = client.post("/translate", json={"text": "word " * 3000})
        empty = client.post("/translate", json={"text": "   "})
        bad = client.post("/translate", json={"text": "Hello", "direction": "en2fr"})
    assert forced.json()["direction"] == "en2kok"
    assert long.status_code == 413
    assert empty.status_code == 400
    assert bad.status_code == 422


def test_translate_long_documents_are_chunked(services):
    text = "\n\n".join(f"Paragraph {i}. " + "Goa has many beaches. " * 30 for i in range(4))
    with client_for(services) as client:
        r = client.post("/translate", json={"text": text, "direction": "en2kok"})
    assert r.status_code == 200
    assert len(services.translator.calls) > 1
    assert r.json()["translation"].count("[KOK]") == len(services.translator.calls)


def test_translate_requires_api_key_when_configured(services):
    services.settings = replace(services.settings, backend_api_key="secret")
    with client_for(services) as client:
        denied = client.post("/translate", json={"text": "Hello"})
        allowed = client.post("/translate", json={"text": "Hello"}, headers={"X-API-Key": "secret"})
    assert denied.status_code == 401
    assert allowed.status_code == 200


def test_auto_voice_picks_english_or_konkani_never_other_scripts():
    from app.stt import pick_language

    assert pick_language({"en": 0.8, "hi": 0.1}, "hi") == "en"
    assert pick_language({"en": 0.2, "hi": 0.5, "mr": 0.2}, "hi") == "hi"
    # Konkani mistaken for Urdu/Marathi must still be written as Devanagari Konkani.
    assert pick_language({"ur": 0.6, "en": 0.3}, "hi") == "hi"
    assert pick_language({"mr": 0.45, "en": 0.4}, "hi") == "hi"
    assert pick_language({}, "hi") == "hi"


def test_transcribe_auto_is_accepted(services):
    with client_for(services) as client:
        r = client.post("/transcribe", files={"file": ("a.webm", WEBM, "audio/webm")}, data={"language": "auto"})
    assert r.status_code == 200 and r.json()["language"] == "auto"
    assert services.stt.languages == ["auto"]
