"""The Gemini path of app/ai/llm.py (DECISIONS.md D-037), against a fake Gemini. Fake names only."""

import json
from datetime import date

import httpx
import pytest

from app.ai import llm
from app.ai.parse_complaint import parse

FAKE_KEY = "test-key-not-real"
COMPLAINT = "HUMO kartamdan avgustda kredit uchun pul ikki marta yechildi"


@pytest.fixture()
def gemini(monkeypatch):
    """A fake Gemini. Set `replies` to the texts it answers with; `seen` keeps every request."""

    class Fake:
        replies: list = []
        seen: list[httpx.Request] = []

        def handle(self, request: httpx.Request) -> httpx.Response:
            self.seen.append(request)
            if request.method == "GET":
                return httpx.Response(200, json={"name": "models/gemini-test"})
            reply = self.replies.pop(0)
            if isinstance(reply, int):
                return httpx.Response(reply, json={"error": {"code": reply}})
            return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": reply}]}}]})

    fake = Fake()
    monkeypatch.setenv("GEMINI_API_KEY", FAKE_KEY)
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test")
    monkeypatch.delenv("LLM_URL", raising=False)
    monkeypatch.setattr(llm, "transport", httpx.MockTransport(fake.handle))
    monkeypatch.setattr(llm, "_status", None)
    return fake


def answer(claim_type="DOUBLE_DEBIT", period="2026-08", card="HUMO") -> str:
    return json.dumps({"claim_type": claim_type, "period": period, "card": card})


def test_the_complaint_is_read_by_gemini_and_the_key_stays_out_of_the_address(gemini):
    gemini.replies = [answer()]
    reading = parse(COMPLAINT, date(2026, 9, 1))
    assert (reading.mode, reading.claim_type, reading.period, reading.card_hint) == ("llm", "DOUBLE_DEBIT", "2026-08", "HUMO")
    request = gemini.seen[0]
    assert request.url.host == "generativelanguage.googleapis.com"
    assert request.url.path == "/v1beta/models/gemini-test:generateContent"
    assert request.headers["x-goog-api-key"] == FAKE_KEY
    assert FAKE_KEY not in str(request.url)
    sent = json.loads(request.content)
    assert sent["generationConfig"]["responseMimeType"] == "application/json"
    assert sent["generationConfig"]["temperature"] == 0


def test_a_wrong_form_is_asked_once_more(gemini):
    gemini.replies = ["not json", answer(claim_type="EARLY_DEBIT")]
    reading = parse(COMPLAINT, date(2026, 9, 1))
    assert (reading.mode, reading.claim_type) == ("llm", "EARLY_DEBIT")


@pytest.mark.parametrize("failure", [500, 429])
def test_when_gemini_fails_the_rules_read_the_complaint(gemini, failure):
    gemini.replies = [failure, failure]
    reading = parse(COMPLAINT, date(2026, 9, 1))
    assert (reading.mode, reading.claim_type) == ("rules", "DOUBLE_DEBIT")


def test_an_answer_outside_the_form_is_not_used(gemini):
    gemini.replies = [json.dumps({"claim_type": "REFUND_ME", "period": None, "card": None})] * 2
    assert parse(COMPLAINT, date(2026, 9, 1)).mode == "rules"


def test_health_names_the_gemini_model(gemini):
    assert llm.status() == ("llm", "gemini-test")
