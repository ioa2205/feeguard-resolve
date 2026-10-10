"""A debit added by hand (task A10) and the audit log with its hash chain (task A11). Fake data only."""

import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app import db
from app.engine import scan
from app.generator.world import Settings, build_world
from app.schemas import AuditLog, CaseResult, TamperResult

WORLD = "w-41"
IN_WORLD = {"X-World-Id": WORLD}


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, WORLD, Settings(seed=41, size=5000))
    return parent / WORLD


@pytest.fixture()
def client(world, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(world.parent))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    scan.forget(WORLD)
    from app.main import app

    return TestClient(app)


def clean_loan(world):
    """A loan paid by automatic debit, with no mistake planted, its customer and one of the customer's cards."""
    wronged = {row[0] for row in rows(world / "truth.db", "SELECT contract_id FROM ground_truth")}
    for contract_id, customer_id in rows(
        world / "bank.db",
        "SELECT DISTINCT d.contract_id, c.customer_id FROM debits d JOIN contracts c ON c.id = d.contract_id ORDER BY 1",
    ):
        if contract_id not in wronged:
            card = rows(world / "bank.db", "SELECT id FROM cards WHERE customer_id = ? ORDER BY id", (customer_id,))[0][0]
            return contract_id, customer_id, card
    raise AssertionError("no clean loan")


def double_debit_row(client):
    return next(row for row in client.get(f"/api/eval/{WORLD}").json()["per_type"] if row["type"] == "DOUBLE_DEBIT")


# --- A10 --------------------------------------------------------------------


def test_an_added_debit_is_found_on_the_next_check_and_counted_as_planted(client, world):
    contract_id, customer_id, card_id = clean_loan(world)
    before = double_debit_row(client)

    response = client.post(f"/api/worlds/{WORLD}/tamper", headers={"X-Actor": "jury"},
                           json={"contract_id": contract_id, "action": "extra_debit", "amount": 123_000, "card_id": card_id})
    added = TamperResult.model_validate(response.json())
    complaint_id = client.post("/api/complaints", headers=IN_WORLD, json={
        "customer_id": customer_id, "text": "Kartamdan kredit puli ikki marta yechildi, pulimni qaytaring",
    }).json()["complaint_id"]
    case = CaseResult.model_validate(client.post(f"/api/cases/{complaint_id}/investigate", headers=IN_WORLD).json())
    after = double_debit_row(client)

    assert response.status_code == 200
    assert added.debit.amount == 123_000 and added.debit.status == "SUCCESS" and added.debit.retry_of
    assert case.verdict == "SUPPORTED" and case.claim_match is True
    assert [(f.type, f.contract_id, f.amount_excess) for f in case.findings] == [("DOUBLE_DEBIT", contract_id, 123_000)]
    assert added.debit.id in {debit.id for debit in case.findings[0].evidence.debits}
    assert (after["planted"], after["found"], after["false_alarms"]) == (before["planted"] + 1, before["found"] + 1, 0)


def test_the_default_demo_bank_cannot_be_changed(client):
    response = client.post("/api/worlds/default/tamper",
                           json={"contract_id": "L-000001", "action": "extra_debit", "amount": 1000, "card_id": "CD-1"})

    assert response.status_code == 409 and response.json()["error"]["code"] == "DEFAULT_BANK"


def test_a_debit_is_refused_with_a_reason_a_person_can_act_on(client, world):
    contract_id, _, _ = clean_loan(world)
    other_card = rows(world / "bank.db", "SELECT id FROM cards WHERE customer_id != (SELECT customer_id FROM contracts WHERE id = ?) LIMIT 1", (contract_id,))[0][0]
    by_hand = rows(world / "bank.db", "SELECT c.id, (SELECT id FROM cards WHERE customer_id = c.customer_id LIMIT 1) FROM contracts c WHERE c.id NOT IN (SELECT contract_id FROM debits) LIMIT 1")[0]
    body = {"action": "extra_debit", "amount": 5000}

    wrong_card = client.post(f"/api/worlds/{WORLD}/tamper", json={**body, "contract_id": contract_id, "card_id": other_card})
    no_loan = client.post(f"/api/worlds/{WORLD}/tamper", json={**body, "contract_id": "L-NOPE", "card_id": other_card})
    no_run = client.post(f"/api/worlds/{WORLD}/tamper", json={**body, "contract_id": by_hand[0], "card_id": by_hand[1]})
    no_money = client.post(f"/api/worlds/{WORLD}/tamper", json={**body, "amount": 0, "contract_id": contract_id, "card_id": other_card})

    assert (wrong_card.status_code, wrong_card.json()["error"]["code"]) == (400, "WRONG_CARD")
    assert no_loan.status_code == 404
    assert (no_run.status_code, no_run.json()["error"]["code"]) == (409, "NO_BILLING_RUN")
    assert no_money.status_code == 400


# --- A11 --------------------------------------------------------------------


def test_the_audit_log_shows_every_action_newest_first_with_an_intact_chain(client):
    log = AuditLog.model_validate(client.get("/api/audit", headers=IN_WORLD).json())
    page = client.get("/api/audit?limit=2&offset=1", headers=IN_WORLD).json()

    actions = [entry.action for entry in log.entries]
    assert log.chain_intact is True and log.broken_at is None
    assert actions[:3] == ["COMPLAINT_CHECKED", "COMPLAINT_RECEIVED", "DEBIT_ADDED_BY_HAND"]
    assert log.entries[-1].actor == "jury" and log.total == len(log.entries)
    assert [entry["id"] for entry in page["entries"]] == [entry.id for entry in log.entries[1:3]]
    assert all(newer.prev_hash == older.hash for newer, older in zip(log.entries, log.entries[1:]))


def test_editing_one_row_breaks_the_chain_from_that_row_on(client):
    with closing(db.open_feeguard(WORLD)) as store:
        first = store.execute("SELECT min(id) FROM audit_log").fetchone()[0]
        store.execute("UPDATE audit_log SET payload_json = '{\"amount\": 1}' WHERE id = ?", (first,))
        store.commit()

    log = AuditLog.model_validate(client.get("/api/audit", headers=IN_WORLD).json())

    assert log.chain_intact is False
    assert log.broken_at == f"A-{first}"


def test_entries_written_at_the_same_moment_still_form_one_chain(tmp_path, monkeypatch):
    import threading

    from app import audit

    monkeypatch.setenv("WORLDS_DIR", str(tmp_path))
    (tmp_path / "w").mkdir()
    start = threading.Barrier(8)

    def write(number):
        start.wait()
        for turn in range(15):
            with closing(db.open_feeguard("w")) as store, store:
                audit.append(store, "officer", "COMPLAINT_CHECKED", {"writer": number, "turn": turn})

    threads = [threading.Thread(target=write, args=(number,)) for number in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    with closing(db.open_feeguard("w")) as store:
        assert store.execute("SELECT count(*) FROM audit_log").fetchone()[0] == 120
        assert audit.first_broken(store) is None
