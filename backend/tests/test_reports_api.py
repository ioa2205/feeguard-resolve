"""The plan of measures and the quarterly analysis through the API. Task A8. Fake data only."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import db
from app.engine import scan
from app.generator.world import Settings, build_world
from app.schemas import ActionPlan, QuarterlyReport


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, "default", Settings(seed=8, size=1500, complaint_rate=0.3))
    return parent / "default"


@pytest.fixture()
def client(world, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(world.parent))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    scan.forget("default")
    from app.main import app

    return TestClient(app)


def victim(world, claim_type):
    return rows(
        world / "truth.db",
        "SELECT complaint_id FROM complaint_key WHERE kind = 'VICTIM' AND claim_type = ? AND also_planted = 0 ORDER BY 1",
        (claim_type,),
    )[0][0]


def test_the_plan_is_drafted_only_for_confirmed_mistakes_and_a_person_fills_the_rest(client, world):
    before = ActionPlan.model_validate(client.get("/api/reports/action-plan").json())
    complaint_id = victim(world, "DOUBLE_DEBIT")
    client.post(f"/api/cases/{complaint_id}/investigate")
    client.post(f"/api/cases/{complaint_id}/decision", json={"action": "CONFIRM"})
    after = ActionPlan.model_validate(client.get("/api/reports/action-plan").json())
    row = next(item for item in after.items if item.finding_type == "DOUBLE_DEBIT")

    assert before.items == [] and before.format_basis == "TO VERIFY"
    assert row.status == "DRAFT" and row.deadline is None and row.monitoring_deadline is None and row.responsible_exec == ""
    assert "collected twice" in row.deficiency and "never complained" in row.deficiency
    assert row.measures.startswith("Return ")


def test_a_saved_row_comes_back_as_saved_and_is_in_the_audit_log(client, world):
    complaint_id = victim(world, "LATE_POSTING")
    client.post(f"/api/cases/{complaint_id}/investigate")
    client.post(f"/api/cases/{complaint_id}/decision", json={"action": "CONFIRM"})
    edited = {
        "deficiency": "Payments through one channel were recorded a day late.",
        "measures": "Record by the day of payment.", "deadline": "2026-11-30",
        "responsible_unit": "Payments operations", "responsible_exec": "A. Karimov (fake)",
        "monitoring_deadline": "2026-12-31", "status": "APPROVED",
    }

    saved = client.put("/api/reports/action-plan/AP-LATE-POSTING", json=edited, headers={"X-Actor": "compliance"})
    shown = next(item for item in client.get("/api/reports/action-plan").json()["items"] if item["id"] == "AP-LATE-POSTING")
    with closing(db.open_feeguard("default")) as store:
        last = store.execute("SELECT actor, action FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()

    assert saved.status_code == 200
    assert shown == {"id": "AP-LATE-POSTING", "finding_type": "LATE_POSTING", **edited}
    assert last == ("compliance", "PLAN_ROW_SAVED")


def test_a_row_that_is_not_in_the_plan_cannot_be_saved(client):
    body = {"deficiency": "x", "measures": "y", "deadline": None, "responsible_unit": "", "responsible_exec": "",
            "monitoring_deadline": None, "status": "DRAFT"}

    assert client.put("/api/reports/action-plan/AP-NOTHING", json=body).status_code == 404
    assert client.put("/api/reports/action-plan/AP-ILLEGAL-FEE", json=body).status_code == 404  # nobody confirmed one


def test_the_quarterly_report_counts_every_complaint_of_the_quarter_once(client, world):
    report = QuarterlyReport.model_validate(client.get("/api/reports/quarterly").json())
    in_quarter = rows(
        world / "bank.db",
        "SELECT count(*) FROM complaints WHERE created_at >= '2026-07-01' AND created_at < '2026-10-01'",
    )[0][0]

    assert (report.quarter, str(report.date_from), str(report.date_to)) == ("2026-Q3", "2026-07-01", "2026-09-30")
    assert report.complaints_total == in_quarter > 0
    for counted in (report.by_type, report.by_region, report.by_channel, report.by_verdict):
        assert sum(row.count for row in counted) == in_quarter
    assert {issue.finding_type for issue in report.recurring} == {"DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE"}
    assert all(issue.affected_customers > 1 for issue in report.recurring)
