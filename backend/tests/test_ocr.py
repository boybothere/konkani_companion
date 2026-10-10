from app.ocr import detect_kind
from app.security import audio_suffix


def test_detect_kind_uses_magic_bytes():
    assert detect_kind(b"%PDF-1.4 ...") == "pdf"
    assert detect_kind(b"\x89PNG\r\n\x1a\n....") == "image"
    assert detect_kind(b"\xff\xd8\xff\xe0....") == "image"
    assert detect_kind(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image"
    assert detect_kind(b"MZ\x90\x00") is None


def test_audio_suffix():
    assert audio_suffix(b"\x1a\x45\xdf\xa3....") == ".webm"
    assert audio_suffix(b"OggS....") == ".ogg"
    assert audio_suffix(b"RIFF\x00\x00\x00\x00WAVE") == ".wav"
    assert audio_suffix(b"hello") is None
