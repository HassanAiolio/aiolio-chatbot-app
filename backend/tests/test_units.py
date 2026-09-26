import pytest

import documents
import llm
from ratelimit import RateLimiter


def msg(role, n):
    return {"role": role, "content": "x" * n}


def test_trim_keeps_everything_when_it_fits():
    history = [msg("user", 10), msg("assistant", 10), msg("user", 10)]
    kept, dropped = llm.trim_history(history, 10_000)
    assert kept == history and dropped == 0


def test_trim_drops_oldest_and_starts_with_user():
    history = [msg("user", 3500), msg("assistant", 3500), msg("user", 3500), msg("assistant", 3500), msg("user", 35)]
    kept, dropped = llm.trim_history(history, 1_100)
    assert kept[0]["role"] == "user"
    assert kept[-1] == history[-1]
    assert dropped == len(history) - len(kept) >= 3


def test_trim_cuts_a_single_oversized_message():
    kept, dropped = llm.trim_history([msg("user", 100_000)], 1_000)
    assert len(kept) == 1 and dropped == 0
    assert len(kept[0]["content"]) < 4_000
    assert kept[0]["content"].startswith("…")


def test_model_catalog_labels_unknown_models():
    info = llm._describe("vendor/some-new-model", "Vendor", 32768)
    assert info.label == "Some New Model"
    assert info.reasoning is False


def test_rate_limiter_windows():
    limiter = RateLimiter("t", [(2, 60), (3, 3600)])
    limiter.check("a", now=0)
    limiter.check("a", now=1)
    with pytest.raises(Exception):
        limiter.check("a", now=2)
    limiter.check("a", now=70)  # minute window has passed
    with pytest.raises(Exception):
        limiter.check("a", now=140)  # hourly window is full


def test_chunk_text_respects_size_and_overlaps():
    text = "\n\n".join("sentence " * 60 for _ in range(10))
    chunks = documents.chunk_text(text, size=1_000, overlap=100)
    assert len(chunks) > 3
    assert all(len(c) <= 1_150 for c in chunks)
    assert chunks[1].startswith("sentence")


def test_extract_text_normalises_whitespace():
    text = documents.extract_text("a.txt", b"Hello  \r\n\r\n\r\n\r\nWorld\x00")
    assert text == "Hello\n\nWorld"


def test_extract_text_rejects_unknown_extension():
    with pytest.raises(documents.DocumentError):
        documents.extract_text("photo.jpg", b"...")
