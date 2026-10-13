"""The landing page's story through the API (V2_PLAN W2, D-048): one checked complaint of the
default demo bank, and everyone else the same mistake hit. Reading it must write nothing."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app.engine import scan
from app.generator.world import Settings, build_world
from app.schemas import LandingStory, ScanResult


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, "default", Settings(seed=7, size=1200, complaint_rate=0.3))
    return parent / "default"


@pytest.fixture()
def client(world, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(world.parent))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    scan.forget("default")
    from app.main import app

    return TestClient(app)


def double_debit_complaint(world) -> str:
    """A complaint from a customer whose payment was really taken twice (the answer key; tests may read it)."""
    with closing(sqlite3.connect(world / "truth.db")) as truth:
        (complaint_id,) = truth.execute(
            "SELECT complaint_id FROM complaint_key WHERE kind = 'VICTIM' AND claim_type = 'DOUBLE_DEBIT' AND also_planted = 0 ORDER BY 1"
        ).fetchone()
    return complaint_id


def audit_total(client) -> int:
    return client.get("/api/audit?limit=1").json()["total"]


def test_the_landing_story_is_404_until_its_complaint_is_checked(client, monkeypatch):
    monkeypatch.setattr("app.main.LANDING_CASE", "C-9999")

    response = client.get("/api/landing")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_the_landing_story_is_the_checked_case_and_everyone_with_its_mistake(client, world, monkeypatch):
    complaint_id = double_debit_complaint(world)
    client.post("/api/complaints", json={"customer_id": "CU-00001", "text": "x", "lang": "en"})  # unrelated noise
    checked = client.post(f"/api/cases/{complaint_id}/investigate").json()
    monkeypatch.setattr("app.main.LANDING_CASE", complaint_id)
    finding = next(f for f in checked["findings"] if f["type"] == "DOUBLE_DEBIT")

    story = LandingStory.model_validate(client.get("/api/landing").json())
    scanned = ScanResult.model_validate(client.post(f"/api/findings/{finding['finding_id']}/scan").json())

    assert story.case.case_id == complaint_id
    assert story.incident.finding_type == "DOUBLE_DEBIT"
    assert {row.contract_id for row in story.rows} == {item.contract_id for item in scanned.items}
    assert any(row.contract_id == finding["contract_id"] for row in story.rows)
    for row in story.rows:
        assert len(row.taken) >= 2 and row.taken == sorted(row.taken)
        assert len(row.cards) == len(row.taken)
    assert sum(row.amount_excess for row in story.rows) == story.incident.total_excess
    assert story.loans == 1200


def test_the_landing_trail_is_a_piece_of_the_hash_chain_from_the_complaint(client, world, monkeypatch):
    complaint_id = double_debit_complaint(world)
    client.post(f"/api/cases/{complaint_id}/investigate")
    monkeypatch.setattr("app.main.LANDING_CASE", complaint_id)

    story = LandingStory.model_validate(client.get("/api/landing").json())

    assert story.chain_intact
    assert 1 <= len(story.trail) <= 4
    assert story.trail[0].action in {"COMPLAINT_RECEIVED", "COMPLAINT_CHECKED"}
    for before, after in zip(story.trail, story.trail[1:]):
        assert after.prev_hash == before.hash


def test_reading_the_landing_story_writes_nothing(client, world, monkeypatch):
    complaint_id = double_debit_complaint(world)
    client.post(f"/api/cases/{complaint_id}/investigate")
    monkeypatch.setattr("app.main.LANDING_CASE", complaint_id)
    before = audit_total(client)

    for _ in range(3):
        assert client.get("/api/landing").status_code == 200

    assert audit_total(client) == before
