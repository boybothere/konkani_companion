from app.text_utils import (
    StreamSegmenter,
    chunk_text,
    detect_input_language,
    join_segments,
    prepare_for_translation,
    restore_after_translation,
    word_count,
)


def test_detects_script_not_toggle():
    assert detect_input_language("गोंयचो मुख्यमंत्री कोण?", hint="en") == "kok"
    assert detect_input_language("Who is the CM of Goa?", hint="kok") == "en"
    assert detect_input_language("1234", hint="kok") == "kok"


def test_chunk_text_respects_word_limit_and_sentences():
    sentence = "This is a sentence with eight words in it."
    text = " ".join([sentence] * 10)  # 90 words on one line
    segments = chunk_text(text, max_words=20)
    assert all(word_count(s.text) <= 20 for s in segments)
    assert all(s.text.endswith(".") for s in segments)
    assert join_segments(segments, [s.text for s in segments]) == text


def test_chunk_text_keeps_paragraphs_and_lines():
    text = "First paragraph.\n\n- item one\n- item two"
    segments = chunk_text(text, max_words=250)
    assert join_segments(segments, [s.text for s in segments]) == text


def test_hard_split_for_sentence_without_punctuation():
    text = " ".join(["word"] * 55)
    segments = chunk_text(text, max_words=20)
    assert [word_count(s.text) for s in segments] == [20, 20, 15]


def test_stream_segmenter_reassembles_stream():
    answer = "Line one is here.\n\nLine two follows. It has two sentences.\n- a list item"
    segmenter = StreamSegmenter(max_words=250)
    out = []
    for i in range(0, len(answer), 3):
        out.extend(segmenter.feed(answer[i : i + 3]))
    out.extend(segmenter.flush())
    assert "".join(s.text + s.sep for s in out) == answer


def test_stream_segmenter_emits_before_newline_when_line_is_long():
    segmenter = StreamSegmenter(max_words=10)
    emitted = list(segmenter.feed("One two three four five six. Seven eight nine ten eleven twelve"))
    assert emitted and emitted[0].text == "One two three four five six."


def test_list_prefix_and_citations_survive_translation():
    prepared = prepare_for_translation("- **Panaji** is the capital [1].")
    assert prepared.prefix == "- "
    assert prepared.body == "Panaji is the capital [1]."
    assert restore_after_translation(prepared, "पणजी राजधानी") == "- पणजी राजधानी [1]"
    assert restore_after_translation(prepared, "पणजी [1] राजधानी") == "- पणजी [1] राजधानी"
