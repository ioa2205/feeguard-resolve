"""Limits on the public API (PLAN Part 22). Task SEC1. Fake data only."""

import json
import os
import time

import pytest

from app import security
from app.generator import world


@pytest.fixture()
def limited(client, monkeypatch):
    monkeypatch.setenv("RATE_LIMIT", "on")
    monkeypatch.setitem(security.LIMITS, "write", 3)
    monkeypatch.setitem(security.LIMITS, "read", 5)
    security.limiter.reset()
    yield client
    security.limiter.reset()


def test_an_address_that_sends_too_much_gets_429_and_health_stays_open(limited):
    writes = [limited.post("/api/complaints", json={"customer_id": "CU-1", "text": "x"}).status_code for _ in range(4)]
    reads = [limited.get("/api/worlds").status_code for _ in range(6)]
    refused = limited.get("/api/worlds")

    assert writes[:3] != [429] * 3 and writes[3] == 429
    assert reads[:5] == [200] * 5 and reads[5] == 429
    assert refused.json()["error"]["code"] == "TOO_MANY_REQUESTS"
    assert limited.get("/api/health").status_code == 200


def test_a_request_body_over_64_kb_is_refused_before_it_is_read(client):
    response = client.post("/api/complaints", content=b"{" + b" " * (security.MAX_BODY + 1) + b"}",
                           headers={"content-type": "application/json"})

    assert response.status_code == 400 and response.json()["error"]["code"] == "TOO_LARGE"


def test_a_complaint_or_a_note_over_2000_characters_is_refused(client):
    assert client.post("/api/complaints", json={"customer_id": "CU-1", "text": "a" * 2001}).status_code == 400
    assert client.post("/api/cases/C-1/decision", json={"action": "DISMISS", "note": "a" * 2001}).status_code == 400


def test_behind_caddy_the_last_forwarded_address_counts_and_a_forged_one_does_not():
    assert security.client_address("172.18.0.3", "6.6.6.6, 203.0.113.9") == "203.0.113.9"
    assert security.client_address("127.0.0.1", "203.0.113.9") == "203.0.113.9"
    assert security.client_address("8.8.4.4", "6.6.6.6") == "8.8.4.4"  # not from Caddy: header ignored
    assert security.client_address("172.18.0.3", None) == "172.18.0.3"


def test_the_window_forgets_requests_older_than_a_minute(monkeypatch):
    limiter = security.Limiter()
    monkeypatch.setitem(security.LIMITS, "write", 2)

    assert limiter.allow("a", "write", 0.0) and limiter.allow("a", "write", 1.0)
    assert not limiter.allow("a", "write", 2.0)
    assert limiter.allow("b", "write", 2.0)  # another address has its own count
    assert limiter.allow("a", "write", 61.5)


def _bank(parent, name, built):
    folder = parent / name
    folder.mkdir()
    (folder / "bank.db").write_bytes(b"")
    (folder / world.BUILD_RECORD).write_text(json.dumps({"build_ms": 1}), encoding="utf-8")
    os.utime(folder / world.BUILD_RECORD, (built, built))


def test_at_most_ten_demo_banks_are_kept_the_oldest_go_and_the_default_stays(tmp_path):
    now = time.time()
    _bank(tmp_path, "default", now - 10_000)  # the oldest of all
    for number in range(10):
        _bank(tmp_path, f"w-{number}", now - 1000 + number)

    removed = world.prune(tmp_path, world.MAX_WORLDS - 1)

    assert removed == ["w-0", "w-1"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["default"] + [f"w-{n}" for n in range(2, 10)]
