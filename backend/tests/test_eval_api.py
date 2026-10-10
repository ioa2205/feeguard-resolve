"""Scoreboard and Reveal (Proof 1). Task A9. Fake data only. A test may read the answer key."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import db
from app.engine import scan
from app.engine.checkers import Evidence, Finding
from app.engine.scan import BankFindings
from app.eval.scoreboard import score
from app.generator.world import Settings, build_world, record_build
from app.schemas import Reveal, Scoreboard


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, "default", Settings(seed=9, size=5000))
    record_build(parent / "default", 3.21)
    return parent / "default"


@pytest.fixture()
def client(world, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(world.parent))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    scan.forget("default")
    from app.main import app

    return TestClient(app)


def finding(kind, contract_id, n, amount):
    return Finding(kind, contract_id, n, amount, amount, None, "", Evidence())


def found(*findings):
    by_type = {kind: tuple(f for f in findings if f.type == kind) for kind in ("DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE")}
    return BankFindings(by_type, {}, 0.0, {}, {})


def test_found_missed_false_alarms_and_flagged_traps_are_counted_per_loan_and_installment():
    key = [
        ("K-1", "DOUBLE_DEBIT", "L-1", 3, 500_000, "cause", 0),  # found
        ("K-2", "DOUBLE_DEBIT", "L-2", 4, 700_000, "cause", 0),  # missed
        ("K-3", "DOUBLE_DEBIT", "L-3", 5, 0, "arrears_covered", 1),  # trap, flagged by mistake
        ("K-4", "DOUBLE_DEBIT", "L-4", 6, 0, "arrears_covered", 1),  # trap, cleared
    ]
    rows_ = {row.type: row for row in score(key, found(
        finding("DOUBLE_DEBIT", "L-1", 3, 500_000),
        finding("DOUBLE_DEBIT", "L-3", 5, 300_000),
        finding("DOUBLE_DEBIT", "L-9", 1, 100_000),  # nothing planted there
    ))}

    dd = rows_["DOUBLE_DEBIT"]
    assert (dd.planted, dd.found, dd.missed, dd.false_alarms) == (2, 1, 1, 2)
    assert (dd.traps_planted, dd.traps_flagged) == (2, 1)
    assert (dd.amount_planted, dd.amount_found) == (1_200_000, 500_000)
    assert rows_["ILLEGAL_FEE"].planted == rows_["ILLEGAL_FEE"].found == 0


def test_for_an_early_debit_the_amount_is_the_money_taken_early():
    key = [("K-1", "EARLY_DEBIT", "L-1", 7, 600_000, "cause", 0)]
    early = Finding("EARLY_DEBIT", "L-1", 7, 0, 600_000, 5, "", Evidence())

    row = next(row for row in score(key, found(early)) if row.type == "EARLY_DEBIT")

    assert (row.found, row.amount_planted, row.amount_found) == (1, 600_000, 600_000)


def test_the_scoreboard_of_a_generated_bank_finds_every_planted_mistake_and_no_trap(client, world):
    response = client.get("/api/eval/default")
    board = Scoreboard.model_validate(response.json())
    planted = dict(rows(world / "truth.db", "SELECT defect_type, count(*) FROM ground_truth WHERE is_trap = 0 GROUP BY 1"))

    assert response.status_code == 200
    assert (board.seed, board.size) == (9, 5000)
    for row in board.per_type:
        assert row.planted == planted[row.type] > 0
        assert (row.found, row.missed, row.false_alarms, row.traps_flagged) == (row.planted, 0, 0, 0)
        assert row.amount_found == row.amount_planted > 0
        assert row.traps_planted == 5
    assert board.timings.world_build_ms == 3210


def test_the_timings_are_the_median_of_what_was_measured_on_this_bank(client, world):
    complaint_id = rows(world / "truth.db", "SELECT complaint_id FROM complaint_key WHERE kind = 'VICTIM' ORDER BY 1")[0][0]
    case = client.post(f"/api/cases/{complaint_id}/investigate").json()
    searched = client.post(f"/api/findings/{case['findings'][0]['finding_id']}/scan").json()

    timings = client.get("/api/eval/default").json()["timings"]

    assert timings["investigate_ms"] == case["elapsed_ms"]
    assert timings["scan_ms"] == searched["elapsed_ms"]


def test_reveal_shows_the_whole_answer_key_with_the_hidden_settings_and_is_logged(client, world):
    response = client.get("/api/eval/default/reveal", headers={"X-Actor": "jury"})
    shown = Reveal.model_validate(response.json())
    total = rows(world / "truth.db", "SELECT count(*) FROM ground_truth")[0][0]
    with closing(db.open_feeguard("default")) as store:
        last = store.execute("SELECT actor, action FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()

    assert shown.total == len(shown.items) == total
    assert sum(count.count for count in shown.counts) == total
    assert "hidden" in shown.settings and shown.settings["seed"] == 9
    assert last == ("jury", "ANSWER_KEY_SHOWN")


def test_an_unknown_demo_bank_has_no_scoreboard(client):
    assert client.get("/api/eval/nothing-here").status_code == 404
    assert client.get("/api/eval/nothing-here/reveal").status_code == 404
