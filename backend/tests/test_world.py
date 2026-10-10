"""The generator (tasks A1 and A2) and the checker on a whole generated bank (A3)."""

import hashlib
import re
import sqlite3
from datetime import date

import pytest

from app.connector import Bank
from app.engine import timeline
from app.engine.checkers import CHECKERS, check_all, double_debit
from app.generator.contracts import PRODUCTS
from app.generator.schedules import build_schedule, monthly_payment
from app.generator.world import Settings, build_world

SIZE = 3000


@pytest.fixture(scope="module")
def world(tmp_path_factory):
    parent = tmp_path_factory.mktemp("worlds")
    build_world(parent, "w", Settings(seed=7, size=SIZE))
    return parent / "w"


@pytest.fixture(scope="module")
def bank(world):
    with Bank(world) as opened:
        yield opened


def rows(path, sql):
    db = sqlite3.connect(path)
    try:
        return db.execute(sql).fetchall()
    finally:
        db.close()


def fingerprint(folder):
    """One hash over every row of every table of both files."""
    digest = hashlib.sha256()
    for name in ("bank.db", "truth.db"):
        tables = [row[0] for row in rows(folder / name, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY 1")]
        for table in tables:
            digest.update(repr(sorted(rows(folder / name, f"SELECT * FROM {table}"), key=repr)).encode())
    return digest.hexdigest()


# --- A1: same seed, exact schedules, base rates ---------------------------


def test_the_same_seed_and_settings_give_the_same_world(tmp_path):
    for name in ("one", "two"):
        build_world(tmp_path / name, "w", Settings(seed=11, size=600))

    assert fingerprint(tmp_path / "one" / "w") == fingerprint(tmp_path / "two" / "w")


def test_another_seed_gives_another_world(tmp_path):
    build_world(tmp_path / "one", "w", Settings(seed=11, size=600))
    build_world(tmp_path / "two", "w", Settings(seed=12, size=600))

    assert fingerprint(tmp_path / "one" / "w") != fingerprint(tmp_path / "two" / "w")


def test_a_schedule_repays_exactly_the_principal():
    schedule = build_schedule(5_000_000, 2800, 12, date(2026, 1, 25), 25)

    assert sum(part for _, _, part, _, _ in schedule) == 5_000_000
    assert all(total == part + interest for _, _, part, interest, total in schedule)
    assert {total for _, _, _, _, total in schedule[:-1]} == {monthly_payment(5_000_000, 2800, 12)}
    assert [due.isoformat() for _, due, *_ in schedule[:2] + schedule[-1:]] == ["2026-02-25", "2026-03-25", "2027-01-25"]


@pytest.mark.parametrize("product", PRODUCTS, ids=lambda p: p.code)
def test_the_last_installment_absorbs_the_rounding_for_every_product(product):
    low, high, step = product.principal
    for principal in (low, low + step, high):
        for term in product.terms:
            schedule = build_schedule(principal, product.annual_bp, term, date(2025, 7, 5), 5)
            assert sum(part for _, _, part, _, _ in schedule) == principal
            assert all(part > 0 and interest > 0 for _, _, part, interest, _ in schedule)
            assert schedule[-1][4] <= schedule[0][4]


def test_every_generated_schedule_adds_up(world):
    wrong = rows(
        world / "bank.db",
        """SELECT c.id FROM contracts c JOIN schedule_items s ON s.contract_id = c.id
           GROUP BY c.id, s.version
           HAVING sum(s.principal_due) != c.principal OR count(*) != c.term_months
               OR min(s.principal_due) <= 0 OR sum(s.total_due != s.principal_due + s.interest_due) > 0""",
    )

    assert wrong == []
    assert rows(world / "bank.db", "SELECT count(*) FROM contracts") == [(SIZE,)]


def test_the_base_rates_are_near_their_targets(world):
    def share(sql):
        return rows(world / "bank.db", sql)[0][0]

    paynet = share("SELECT avg(channel = 'PAYNET') FROM payments")
    two_cards = share("SELECT avg(n > 1) FROM (SELECT count(*) AS n FROM cards GROUP BY customer_id)")
    changed = share("SELECT avg(schedule_version = 2) FROM contracts")
    biggest_fee_product = share(
        "SELECT max(n) * 1.0 / sum(n) FROM (SELECT count(*) AS n FROM contracts WHERE product_code != 'CONS' GROUP BY product_code)"
    )

    assert 0.12 <= paynet <= 0.18
    assert 0.21 <= two_cards <= 0.29
    assert 0.035 <= changed <= 0.065
    assert share("SELECT avg(product_code = 'MICRO') FROM contracts") <= 0.25
    assert biggest_fee_product < 1


def test_no_time_in_the_world_is_after_the_world_date(world):
    latest = rows(
        world / "bank.db",
        """SELECT max(t) FROM (SELECT max(created_at) AS t FROM debits UNION ALL
           SELECT max(posted_at) FROM payments UNION ALL SELECT max(charged_at) FROM charges
           UNION ALL SELECT max(reversed_at) FROM debits)""",
    )[0][0]

    assert latest < "2026-10-11"


def test_the_bank_holds_no_real_identifiers(world):
    columns = {
        column[1].lower()
        for (table,) in rows(world / "bank.db", "SELECT name FROM sqlite_master WHERE type='table'")
        for column in rows(world / "bank.db", f"PRAGMA table_info({table})")
    }
    phones = rows(world / "bank.db", "SELECT phone_masked FROM customers")
    cards = rows(world / "bank.db", "SELECT last4 FROM cards")

    assert not columns & {"passport", "pinfl", "card_number", "pan", "birth_date", "address"}
    assert all(re.fullmatch(r"\+998 \d\d \*\*\* \*\* \d\d", phone) for (phone,) in phones)
    assert all(re.fullmatch(r"\d{4}", last4) for (last4,) in cards)


def test_a_contract_text_names_its_own_numbers(world):
    contract_id, principal, text = rows(
        world / "bank.db", "SELECT id, principal, contract_text FROM contracts WHERE id = 'L-00001'"
    )[0]

    assert f"№ {contract_id}" in text
    assert f"{principal:,}".replace(",", " ") + " soʻm" in text
    assert "{" not in text and "}" not in text
    assert "LOAN_ISSUANCE" not in text


# --- A2: the mistakes, the traps and the answer key ------------------------


def test_all_four_mistakes_and_all_four_traps_are_in_the_answer_key(world):
    counts = dict(
        rows(world / "truth.db", "SELECT defect_type || '/' || is_trap, count(DISTINCT contract_id) FROM ground_truth GROUP BY 1")
    )

    for kind in ("DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE"):
        # 2% of 3,000 contracts is 60. The fee takes whole start dates, so it may go over.
        assert 50 <= counts[f"{kind}/0"] <= 90, kind
        assert counts[f"{kind}/1"] == 5, kind


def test_the_hidden_settings_are_only_in_the_answer_key(world):
    config = rows(world / "truth.db", "SELECT config_json FROM config")[0][0]
    bank_tables = {name for (name,) in rows(world / "bank.db", "SELECT name FROM sqlite_master WHERE type='table'")}

    assert '"hidden"' in config and "batch_nights" in config
    assert "ground_truth" not in bank_tables and "config" not in bank_tables
    assert rows(world / "bank.db", "SELECT count(*) FROM world WHERE status = 'ready'") == [(1,)]


def test_most_double_debits_come_from_one_batch_night(world):
    nights = rows(
        world / "bank.db",
        """SELECT count(*) FROM debits d JOIN debits f ON f.id = d.retry_of
           WHERE d.status = 'SUCCESS' AND f.status = 'SUCCESS' AND d.reversed_by IS NULL
           GROUP BY d.batch_run_id ORDER BY 1 DESC""",
    )

    assert nights[0][0] / sum(n for (n,) in nights) >= 0.6


def test_surprise_makes_hidden_choices_that_the_seed_repeats(tmp_path):
    build_world(tmp_path / "one", "w", Settings(seed=5, size=600, surprise=True))
    build_world(tmp_path / "two", "w", Settings(seed=5, size=600, surprise=True))
    planted = rows(tmp_path / "one" / "w" / "truth.db", "SELECT DISTINCT defect_type FROM ground_truth WHERE is_trap = 0")

    assert fingerprint(tmp_path / "one" / "w") == fingerprint(tmp_path / "two" / "w")
    assert 2 <= len(planted) <= 4


def test_a_mistake_that_is_not_chosen_is_not_planted(tmp_path):
    build_world(tmp_path, "w", Settings(seed=5, size=600, defects={"ILLEGAL_FEE": 0.03}))
    planted = rows(tmp_path / "w" / "truth.db", "SELECT DISTINCT defect_type FROM ground_truth WHERE is_trap = 0")

    assert planted == [("ILLEGAL_FEE",)]


def test_a_world_is_never_overwritten(world):
    with pytest.raises(FileExistsError):
        build_world(world.parent, "w", Settings(seed=7, size=600))


# --- A3: the connector, and the checker on the whole bank ------------------


def test_the_connector_cannot_write_to_the_bank(bank):
    with pytest.raises(sqlite3.OperationalError):
        bank._db.execute("UPDATE contracts SET principal = 0")
    with pytest.raises(sqlite3.OperationalError):
        bank._db.execute("INSERT INTO debits (id, contract_id, card_id, amount, created_at, status) VALUES ('x','x','x',1,'x','SUCCESS')")


def test_the_connector_quotes_a_clause_as_written(bank):
    ((number, text),) = bank.clauses("L-00001", ["4.2"])

    assert number == "4.2"
    assert text.startswith("Bank toʻlov kunida") and text.endswith("faqat bir marta yechib olinadi.")


def test_loading_one_contract_equals_loading_it_with_all_the_others(bank):
    everything = bank.load()
    one = bank.load(["L-00042"])["L-00042"]

    assert len(everything) == SIZE
    assert one.contract == everything["L-00042"].contract
    assert one.schedule == everything["L-00042"].schedule
    assert one.debits == everything["L-00042"].debits
    assert one.payments == everything["L-00042"].payments
    assert one.cards == everything["L-00042"].cards


def test_the_checker_finds_every_planted_double_debit_and_nothing_else(world, bank):
    planted = {
        (contract_id, n): amount
        for contract_id, n, amount in rows(
            world / "truth.db",
            "SELECT contract_id, installment_n, excess_amount FROM ground_truth WHERE defect_type = 'DOUBLE_DEBIT' AND is_trap = 0",
        )
    }
    traps = {
        (contract_id, n)
        for contract_id, n in rows(
            world / "truth.db",
            "SELECT contract_id, installment_n FROM ground_truth WHERE defect_type = 'DOUBLE_DEBIT' AND is_trap = 1",
        )
    }

    found, cleared = {}, {}
    for contract_id, data in bank.load().items():
        result = double_debit.check(timeline.build(data))
        for finding in result.findings:
            found[(contract_id, finding.installment_n)] = finding.amount_excess
        for item in result.cleared:
            cleared[(contract_id, item.installment_n)] = item.reason

    assert found == planted
    assert len(planted) >= 50
    assert all(cleared.get(trap) == "ARREARS_COVERED" for trap in traps)
    assert {"ARREARS_COVERED", "RETRY_AFTER_FAILURE", "ALREADY_REVERSED"} <= set(cleared.values())


# --- A4: all four checkers on the whole bank -------------------------------


@pytest.fixture(scope="module")
def checked(bank):
    """Every finding and cleared item of the whole bank: {type: {(contract, installment): ...}}."""
    found = {kind: {} for kind in CHECKERS}
    cleared = {kind: {} for kind in CHECKERS}
    for contract_id, data in bank.load().items():
        result = check_all(timeline.build(data))
        for finding in result.findings:
            # For an early debit the answer key holds the money taken early.
            found[finding.type][(contract_id, finding.installment_n)] = finding.amount_affected
        for item in result.cleared:
            cleared[item.type][(contract_id, item.installment_n)] = item.reason
    return found, cleared


@pytest.mark.parametrize(
    "kind, trap_reason",
    [
        ("DOUBLE_DEBIT", "ARREARS_COVERED"),
        ("EARLY_DEBIT", "EARLY_REPAYMENT_REQUESTED"),
        ("LATE_POSTING", "PAID_AFTER_DUE_DATE"),
        ("ILLEGAL_FEE", "FEE_IN_CONTRACT"),
    ],
)
def test_each_checker_finds_every_planted_mistake_and_clears_every_trap(world, checked, kind, trap_reason):
    found, cleared = checked
    key = rows(
        world / "truth.db",
        f"SELECT contract_id, installment_n, excess_amount, is_trap FROM ground_truth WHERE defect_type = '{kind}'",
    )
    planted = {(contract_id, n): amount for contract_id, n, amount, is_trap in key if not is_trap}
    traps = [(contract_id, n) for contract_id, n, _, is_trap in key if is_trap]

    assert found[kind] == planted
    assert len(planted) >= 50
    assert len(traps) == 5
    assert all(cleared[kind].get(trap) == trap_reason for trap in traps)
    assert not any(trap in found[kind] for trap in traps)
