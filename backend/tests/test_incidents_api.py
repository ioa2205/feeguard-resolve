"""Checks of the whole bank (D-039) and incidents (D-040) through the API. Fake data only."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app.engine import scan
from app.generator.world import Settings, build_world
from app.schemas import AuditLog, CaseResult, CheckRun, CheckRunList, CustomerStatement, Incident, IncidentDetail, IncidentList

WORLD = "w-53"
IN_WORLD = {"X-World-Id": WORLD}
DD = "INC-DOUBLE-DEBIT"


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, WORLD, Settings(seed=53, size=3000))
    return parent / WORLD


@pytest.fixture(scope="module")
def client(world):
    patch = pytest.MonkeyPatch()
    patch.setenv("WORLDS_DIR", str(world.parent))
    patch.setenv("SCAN_WARM_UP", "0")
    patch.setenv("RATE_LIMIT", "off")
    scan.forget(WORLD)
    from app.main import app

    yield TestClient(app)
    patch.undo()


def as_(actor):
    return {**IN_WORLD, "X-Actor": actor}


def test_the_first_use_reads_every_loan_once_and_opens_an_incident_per_mistake(client):
    listed = IncidentList.model_validate(client.get("/api/incidents", headers=IN_WORLD).json())
    history = CheckRunList.model_validate(client.get("/api/checks", headers=IN_WORLD).json())

    assert {item.incident_id for item in listed.items} == {
        "INC-DOUBLE-DEBIT", "INC-EARLY-DEBIT", "INC-LATE-POSTING", "INC-ILLEGAL-FEE"}
    assert all(item.status == "OPEN" and item.customers >= 2 for item in listed.items)
    assert all(item.complained + item.silent == item.customers for item in listed.items)
    (first,) = history.items
    assert (first.trigger, first.scope, first.loans_read, first.loans_total) == ("FIRST_USE", "ALL", 3000, 3000)
    assert len(first.incidents_opened) == 4


def test_the_check_by_hand_reads_only_what_changed(client):
    run = CheckRun.model_validate(client.post("/api/checks/run", headers=as_("officer")).json())
    assert (run.trigger, run.scope, run.loans_read, run.new_findings) == ("BY_HAND", "CHANGED", 0, 0)


def test_a_debit_added_by_hand_is_read_alone_and_grows_the_incident(client, world):
    before = Incident.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json()["incident"])
    wronged = {row[0] for row in rows(world / "truth.db", "SELECT contract_id FROM ground_truth")}
    contract_id, customer_id = next(
        pair for pair in rows(world / "bank.db", "SELECT DISTINCT d.contract_id, c.customer_id FROM debits d "
                                                 "JOIN contracts c ON c.id = d.contract_id ORDER BY 1")
        if pair[0] not in wronged
    )
    card = rows(world / "bank.db", "SELECT id FROM cards WHERE customer_id = ? ORDER BY id", (customer_id,))[0][0]

    added = client.post(f"/api/worlds/{WORLD}/tamper", headers=as_("jury"),
                        json={"contract_id": contract_id, "action": "extra_debit", "amount": 99_000, "card_id": card})
    history = CheckRunList.model_validate(client.get("/api/checks", headers=IN_WORLD).json())
    after = Incident.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json()["incident"])

    assert added.status_code == 200
    newest = history.items[0]
    assert (newest.trigger, newest.scope, newest.loans_read, newest.new_findings) == ("AFTER_CHANGE", "CHANGED", 1, 1)
    assert newest.incidents_grown == [DD]
    assert after.customers == before.customers + 1
    assert after.total_excess == before.total_excess + 99_000


def test_a_complaint_about_a_known_incident_is_linked_without_a_new_search(client):
    detail = IncidentDetail.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json())
    customer = next(person for person in detail.customers if not person.complained)
    complaint_id = client.post("/api/complaints", headers=IN_WORLD, json={
        "customer_id": customer.customer_id, "text": "Kartamdan kredit puli ikki marta yechildi, pulimni qaytaring",
    }).json()["complaint_id"]
    case = CaseResult.model_validate(client.post(f"/api/cases/{complaint_id}/investigate", headers=IN_WORLD).json())
    stored = CaseResult.model_validate(client.get(f"/api/cases/{case.case_id}", headers=IN_WORLD).json())

    assert case.verdict == "SUPPORTED"
    (link,) = case.incidents
    assert (link.incident_id, link.known_before, link.customers) == (DD, True, detail.incident.customers)
    assert stored.incidents[0].known_before is True


def test_four_eyes_then_every_affected_customer_gets_a_message_in_their_language(client, world):
    proposed = client.post(f"/api/incidents/{DD}/propose", headers=as_("jury"))
    same_person = client.post(f"/api/incidents/{DD}/approve", headers=as_("jury"))
    officer = client.post(f"/api/incidents/{DD}/approve", headers=as_("officer"))
    early_send = client.post(f"/api/incidents/{DD}/notify", headers=as_("officer"))
    approved = client.post(f"/api/incidents/{DD}/approve", headers=as_("compliance"))
    sent = Incident.model_validate(client.post(f"/api/incidents/{DD}/notify", headers=as_("officer")).json())
    again = client.post(f"/api/incidents/{DD}/notify", headers=as_("officer"))

    assert Incident.model_validate(proposed.json()).status == "PROPOSED"
    assert (same_person.status_code, same_person.json()["error"]["code"]) == (409, "FOUR_EYES")
    assert (officer.status_code, officer.json()["error"]["code"]) == (409, "WRONG_ROLE")
    assert (early_send.status_code, early_send.json()["error"]["code"]) == (409, "NOTHING_TO_SEND")
    assert Incident.model_validate(approved.json()).status == "APPROVED"
    assert sent.status == "NOTIFIED" and sent.notified_customers == sent.customers and sent.waiting_customers == 0
    assert again.status_code == 409

    detail = IncidentDetail.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json())
    silent = next(person for person in detail.customers if not person.complained)
    statement = CustomerStatement.model_validate(
        client.get(f"/api/customers/{silent.customer_id}/statement", headers=IN_WORLD).json())
    notice = [message for message in statement.messages if message.kind == "NOTICE"]
    lang = rows(world / "bank.db", "SELECT preferred_lang FROM customers WHERE id = ?", (silent.customer_id,))[0][0]

    assert len(notice) == 1 and notice[0].finding_type == "DOUBLE_DEBIT" and notice[0].amount == silent.amount_excess
    assert notice[0].text_lang == (lang if lang != "mixed" else "uz_latn")
    assert silent.customer_name in notice[0].text


def test_an_approved_incident_drafts_its_plan_row_and_the_audit_chain_holds(client):
    plan = client.get("/api/reports/action-plan", headers=IN_WORLD).json()
    log = AuditLog.model_validate(client.get("/api/audit", headers=IN_WORLD).json())
    actions = {entry.action for entry in log.entries}

    assert "AP-DOUBLE-DEBIT" in {row["id"] for row in plan["items"]}
    assert log.chain_intact
    assert {"CHECK_RUN_BY_HAND", "REFUND_PROPOSED", "REFUND_APPROVED", "CUSTOMERS_NOTIFIED"} <= actions


def card_of(world, customer_id):
    return rows(world / "bank.db", "SELECT id FROM cards WHERE customer_id = ? ORDER BY id", (customer_id,))[0][0]


def notices(client, customer_id):
    statement = CustomerStatement.model_validate(client.get(f"/api/customers/{customer_id}/statement", headers=IN_WORLD).json())
    return [message for message in statement.messages if message.kind == "NOTICE"]


def full_round(client):
    for step, actor in (("propose", "officer"), ("approve", "compliance"), ("notify", "officer")):
        response = client.post(f"/api/incidents/{DD}/{step}", headers=as_(actor))
        assert response.status_code == 200, response.json()
    return Incident.model_validate(response.json())


def test_a_customer_owed_more_after_the_message_waits_again_and_is_told_only_the_difference(client, world):
    detail = IncidentDetail.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json())
    person = next(p for p in detail.customers if p.notified)
    loan = next(c for c in person.contracts
                if rows(world / "bank.db", "SELECT 1 FROM debits WHERE contract_id = ? AND batch_run_id IS NOT NULL", (c,)))
    told_before = notices(client, person.customer_id)

    client.post(f"/api/worlds/{WORLD}/tamper", headers=as_("jury"), json={
        "contract_id": loan, "action": "extra_debit", "amount": 55_000, "card_id": card_of(world, person.customer_id)})
    waiting = Incident.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json()["incident"])
    done = full_round(client)
    told_after = notices(client, person.customer_id)

    assert (waiting.status, waiting.waiting_customers) == ("OPEN", 1)
    assert done.status == "NOTIFIED" and done.waiting_customers == 0
    assert len(told_after) == len(told_before) + 1 and told_after[-1].amount == 55_000


def test_a_customer_found_after_the_approval_gets_a_proposal_of_their_own(client, world):
    detail = IncidentDetail.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json())
    inside = {p.customer_id for p in detail.customers}
    wronged = {row[0] for row in rows(world / "truth.db", "SELECT contract_id FROM ground_truth")}
    loan, customer = next(
        pair for pair in rows(world / "bank.db", "SELECT DISTINCT d.contract_id, c.customer_id FROM debits d "
                                                 "JOIN contracts c ON c.id = d.contract_id WHERE d.batch_run_id IS NOT NULL ORDER BY 1 DESC")
        if pair[0] not in wronged and pair[1] not in inside
    )
    client.post(f"/api/worlds/{WORLD}/tamper", headers=as_("jury"), json={
        "contract_id": loan, "action": "extra_debit", "amount": 61_000, "card_id": card_of(world, customer)})
    proposed = Incident.model_validate(client.post(f"/api/incidents/{DD}/propose", headers=as_("officer")).json())
    twice = client.post(f"/api/incidents/{DD}/propose", headers=as_("officer"))
    listed = IncidentDetail.model_validate(client.get(f"/api/incidents/{DD}", headers=IN_WORLD).json())

    assert (proposed.status, proposed.waiting_customers) == ("PROPOSED", 1)
    assert (twice.status_code, twice.json()["error"]["code"]) == (409, "ALREADY_PROPOSED")
    assert [p.customer_id for p in listed.customers if not p.approved] == [customer]
    approved = client.post(f"/api/incidents/{DD}/approve", headers=as_("compliance")).json()
    sent = client.post(f"/api/incidents/{DD}/notify", headers=as_("officer")).json()
    assert approved["status"] == "APPROVED" and sent["status"] == "NOTIFIED"
    assert [message.amount for message in notices(client, customer)] == [61_000]


def test_an_incident_opened_by_the_complaints_own_check_is_not_known_before(tmp_path, monkeypatch):
    build_world(tmp_path, "w-59", Settings(seed=59, size=3000))
    monkeypatch.setenv("WORLDS_DIR", str(tmp_path))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    scan.forget("w-59")
    from app.main import app

    fresh = TestClient(app)
    headers = {"X-World-Id": "w-59"}
    contract_id = rows(tmp_path / "w-59" / "truth.db",
                       "SELECT contract_id FROM ground_truth WHERE defect_type = 'DOUBLE_DEBIT' AND is_trap = 0 ORDER BY 1")[0][0]
    customer_id = rows(tmp_path / "w-59" / "bank.db", "SELECT customer_id FROM contracts WHERE id = ?", (contract_id,))[0][0]
    complaint_id = fresh.post("/api/complaints", headers=headers, json={
        "customer_id": customer_id, "text": "Kartamdan kredit puli ikki marta yechildi"}).json()["complaint_id"]
    case = CaseResult.model_validate(fresh.post(f"/api/cases/{complaint_id}/investigate", headers=headers).json())
    history = CheckRunList.model_validate(fresh.get("/api/checks", headers=headers).json())

    assert case.verdict == "SUPPORTED"
    assert DD in {link.incident_id for link in case.incidents}
    assert {link.finding_type for link in case.incidents} == {finding.type for finding in case.findings}
    assert not any(link.known_before for link in case.incidents)
    assert [run.trigger for run in history.items] == ["FIRST_USE"]
