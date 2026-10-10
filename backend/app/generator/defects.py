"""Plants the 4 mistakes and the 4 trap types and writes the ground_truth table. Task A2.

Each mistake has a believable cause (PLAN Part 6). The cause is what the cause
finder must later discover without seeing this file's output.
"""

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from random import Random

from .contracts import AUTO, PRODUCTS, Contract

DOUBLE_DEBIT, EARLY_DEBIT, LATE_POSTING, ILLEGAL_FEE = (
    "DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE",
)
TYPES = (DOUBLE_DEBIT, EARLY_DEBIT, LATE_POSTING, ILLEGAL_FEE)

CAUSES = {
    DOUBLE_DEBIT: "batch_retry_second_card",
    EARLY_DEBIT: "old_schedule_after_change",
    LATE_POSTING: "late_posting_paynet",
    ILLEGAL_FEE: "issuance_fee_after_tariff_update",
}
# A trap looks like the mistake but is correct.
TRAP_CAUSES = {
    DOUBLE_DEBIT: "arrears_covered",
    EARLY_DEBIT: "early_repayment_requested",
    LATE_POSTING: "paid_late",
    ILLEGAL_FEE: "fee_in_contract",
}
LATE_CHANNEL = "PAYNET"
DEFAULT_FEE_PRODUCT = "MICRO"

TRUTH_DB = "truth.db"
TRUTH_TABLES = """
CREATE TABLE ground_truth (
    id TEXT PRIMARY KEY, defect_type TEXT NOT NULL, contract_id TEXT NOT NULL,
    installment_n INTEGER, excess_amount INTEGER NOT NULL, cause_tag TEXT NOT NULL,
    is_trap INTEGER NOT NULL
);
CREATE TABLE config (key TEXT PRIMARY KEY, config_json TEXT NOT NULL);
CREATE TABLE complaint_key (
    complaint_id TEXT PRIMARY KEY, kind TEXT NOT NULL, claim_type TEXT NOT NULL, contract_id TEXT,
    installment_n INTEGER, expected_verdict TEXT NOT NULL, also_planted INTEGER NOT NULL
);
"""

# One answer-key row: (defect_type, contract_id, installment_n, excess_amount, cause_tag, is_trap).
TruthRow = tuple[str, str, int | None, int, str, int]


@dataclass
class Plan:
    """Which installments and contracts get a mistake, decided before any event is made."""

    installments: dict[tuple[int, int], str] = field(default_factory=dict)
    fee_contracts: set[int] = field(default_factory=set)
    fee_product: str | None = None
    hidden: dict = field(default_factory=dict)  # the details that go into the answer key


def resolve_rates(defects: dict[str, float], surprise: bool, rng: Random) -> dict[str, float]:
    """The share of contracts for each mistake. "Surprise me" makes hidden, seeded choices."""
    if not surprise:
        return {kind: defects[kind] for kind in TYPES if kind in defects}
    chosen = rng.sample(TYPES, rng.randrange(2, 5))
    return {kind: rng.randrange(5, 31) / 1000 for kind in TYPES if kind in chosen}


def last_full_quarter(as_of: date) -> tuple[date, date]:
    first_month = (as_of.month - 1) // 3 * 3 + 1
    end = date(as_of.year, first_month, 1) - timedelta(days=1)
    return date(end.year, end.month - 2, 1), end


def plan_defects(contracts: list[Contract], rates: dict[str, float], surprise: bool, rng: Random, as_of: date) -> Plan:
    plan = Plan()
    size = len(contracts)
    if DOUBLE_DEBIT in rates:
        _plan_double_debit(plan, contracts, round(rates[DOUBLE_DEBIT] * size), rng, as_of)
    if EARLY_DEBIT in rates:
        _plan_early_debit(plan, contracts, round(rates[EARLY_DEBIT] * size), rng)
    if LATE_POSTING in rates:
        _plan_late_posting(plan, contracts, round(rates[LATE_POSTING] * size), rng, as_of)
    if ILLEGAL_FEE in rates:
        _plan_illegal_fee(plan, contracts, round(rates[ILLEGAL_FEE] * size), surprise, rng)
    return plan


def _plan_double_debit(plan: Plan, contracts: list[Contract], target: int, rng: Random, as_of: date) -> None:
    """On one batch night, and a little on a second one, the debit was retried on the
    customer's second card although the first card had already paid."""
    quarter_start, quarter_end = last_full_quarter(as_of)
    by_night: dict[date, list[tuple[int, int]]] = {}
    for c in contracts:
        if c.mode != AUTO or len(c.customer.cards) < 2 or c.schedule_v1 or c.early_n:
            continue
        for n, due, *_ in c.schedule:
            if quarter_start <= due <= quarter_end:
                by_night.setdefault(due, []).append((c.idx, n))
    nights = sorted(by_night)
    if not nights or target == 0:
        return
    main_night = rng.choice(nights)
    main = rng.sample(by_night[main_night], min(round(target * 0.93), len(by_night[main_night]) * 9 // 10))
    taken = {idx for idx, _ in main}
    second: list[tuple[int, int]] = []
    other_nights = [night for night in nights if night != main_night]
    second_night = rng.choice(other_nights) if other_nights else None
    if second_night:
        free = [slot for slot in by_night[second_night] if slot[0] not in taken]
        # The main night keeps at least 60% of the cases, so the cause stays findable.
        second = rng.sample(free, min(target - len(main), len(main) * 6 // 10, len(free)))
    for slot in main + second:
        plan.installments[slot] = DOUBLE_DEBIT
    plan.hidden[DOUBLE_DEBIT] = {
        "cause": CAUSES[DOUBLE_DEBIT],
        "batch_nights": [main_night.isoformat()] + ([second_night.isoformat()] if second else []),
    }


def _plan_early_debit(plan: Plan, contracts: list[Contract], target: int, rng: Random) -> None:
    """After a schedule change the automatic debit kept using the old due dates."""
    changed = [c for c in contracts if c.schedule_v1]
    for c in rng.sample(changed, min(target, len(changed))):
        for n in range(c.change_from_n, c.term + 1):
            plan.installments[(c.idx, n)] = EARLY_DEBIT
    plan.hidden[EARLY_DEBIT] = {"cause": CAUSES[EARLY_DEBIT]}


def _plan_late_posting(plan: Plan, contracts: list[Contract], target: int, rng: Random, as_of: date) -> None:
    """Payments through one channel on the due date were recorded on the next business
    day, and a penalty was charged."""
    first, last = as_of - timedelta(days=120), as_of - timedelta(days=5)
    eligible = []
    for c in contracts:
        if c.mode == LATE_CHANNEL:
            recent = [n for n, due, *_ in c.schedule if first <= due <= last]
            if recent:
                eligible.append((c.idx, recent))
    for idx, recent in rng.sample(eligible, min(target, len(eligible))):
        picks = rng.sample(recent, 2) if len(recent) > 1 and rng.random() < 0.2 else [rng.choice(recent)]
        for n in picks:
            plan.installments[(idx, n)] = LATE_POSTING
    plan.hidden[LATE_POSTING] = {"cause": CAUSES[LATE_POSTING], "channel": LATE_CHANNEL}


def _plan_illegal_fee(plan: Plan, contracts: list[Contract], target: int, surprise: bool, rng: Random) -> None:
    """After a tariff update one product charged a one-time issuance fee that its
    contract does not list. Every contract of that product from the update on has it."""
    small = sorted(p.code for p in PRODUCTS if p.weight <= 25)
    product = rng.choice(small) if surprise else DEFAULT_FEE_PRODUCT
    by_start: dict[date, list[Contract]] = {}
    for c in contracts:
        if c.product.code == product:
            by_start.setdefault(c.start, []).append(c)
    updated_on = None
    for start in sorted(by_start, reverse=True):
        if len(plan.fee_contracts) >= target:
            break
        updated_on = start
        for c in by_start[start]:
            c.tariff_version = 2
            plan.fee_contracts.add(c.idx)
    if updated_on:
        plan.fee_product = product
        plan.hidden[ILLEGAL_FEE] = {
            "cause": CAUSES[ILLEGAL_FEE],
            "product": product,
            "tariff_updated_on": updated_on.isoformat(),
        }


def pick_traps(lookalikes: dict[str, list[tuple[str, int | None]]], count: int, rng: Random) -> list[TruthRow]:
    """Chooses the look-alike cases that will get a false complaint, spread over the 4 types."""
    rows: list[TruthRow] = []
    for position, kind in enumerate(TYPES):
        quota = count // len(TYPES) + (1 if position < count % len(TYPES) else 0)
        for contract_id, n in rng.sample(lookalikes[kind], min(quota, len(lookalikes[kind]))):
            rows.append((kind, contract_id, n, 0, TRAP_CAUSES[kind], 1))
    return rows


def write_truth(folder: Path, planted: list[TruthRow], traps: list[TruthRow], config: dict,
                complaint_key: list[tuple] = ()) -> None:
    db = sqlite3.connect(folder / TRUTH_DB)
    try:
        db.executescript(TRUTH_TABLES)
        db.executemany("INSERT INTO complaint_key VALUES (?, ?, ?, ?, ?, ?, ?)", complaint_key)
        db.executemany(
            "INSERT INTO ground_truth VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(f"K-{number:05d}", *row) for number, row in enumerate(planted + traps, start=1)],
        )
        db.execute("INSERT INTO config VALUES ('settings', ?)", (json.dumps(config, sort_keys=True),))
        db.commit()
    finally:
        db.close()
