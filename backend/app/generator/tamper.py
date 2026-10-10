"""A debit added by hand from the Jury panel (PLAN Part 9, screen 6). Task A10.

Sandbox Bank code. It writes the debit into bank.db, as a second successful
debit in the loan's latest ordinary billing run, and adds it to the answer key
as a double debit put there by hand. So the next check finds it, and the
Scoreboard counts it as planted, not as a false alarm. FeeGuard is told nothing.

No clock: the debit is dated three minutes after the debit it repeats.
"""

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

from .defects import DOUBLE_DEBIT, TRUTH_DB

BANK_DB = "bank.db"
CAUSE_BY_HAND = "added_by_hand"
AFTER = timedelta(minutes=3)


class Refused(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def _next_id(bank: sqlite3.Connection, table: str, prefix: str, width: int) -> str:
    (count,) = bank.execute(f"SELECT count(*) FROM {table}").fetchone()
    number = count + 1
    while bank.execute(f"SELECT 1 FROM {table} WHERE id = ?", (f"{prefix}{number:0{width}d}",)).fetchone():
        number += 1
    return f"{prefix}{number:0{width}d}"


def _latest_ordinary_run(bank: sqlite3.Connection, contract_id: str) -> tuple[str, str, str, int] | None:
    """(batch run id, debit id, debit time, installment n) of the latest billing run on a due date
    that took exactly one installment with one successful debit."""
    rows = bank.execute(
        """SELECT d.batch_run_id, min(d.id), max(d.created_at), s.n
           FROM debits d
           JOIN contracts c ON c.id = d.contract_id
           JOIN schedule_items s ON s.contract_id = c.id AND s.version = c.schedule_version
                AND s.due_date = substr(d.created_at, 1, 10)
           WHERE d.contract_id = ? AND d.batch_run_id IS NOT NULL
           GROUP BY d.batch_run_id
           HAVING count(*) = 1 AND min(d.status) = 'SUCCESS' AND min(d.reversed_by IS NULL)
              AND min(d.amount) = min(s.total_due)
           ORDER BY max(d.created_at) DESC LIMIT 1""",
        (contract_id,),
    ).fetchone()
    return tuple(rows) if rows else None


def add_debit(world_dir: Path, contract_id: str, card_id: str, amount: int) -> dict:
    """Adds the debit and returns it as a row. Raises Refused with the reason in plain words."""
    world_dir = Path(world_dir)
    bank = sqlite3.connect(world_dir / BANK_DB, timeout=10)
    try:
        with bank:
            owner = bank.execute("SELECT customer_id FROM contracts WHERE id = ?", (contract_id,)).fetchone()
            if not owner:
                raise Refused(404, "NOT_FOUND", "The bank has no loan with this number.")
            card = bank.execute("SELECT customer_id, network, last4 FROM cards WHERE id = ?", (card_id,)).fetchone()
            if not card or card[0] != owner[0]:
                raise Refused(400, "WRONG_CARD", "This card does not belong to the customer of this loan.")
            run = _latest_ordinary_run(bank, contract_id)
            if not run:
                raise Refused(409, "NO_BILLING_RUN", "This loan has no ordinary billing run to add a debit to. "
                                                     "Pick a loan that is paid by automatic debit.")
            batch_run_id, first_id, last_at, installment_n = run
            created_at = (datetime.fromisoformat(last_at) + AFTER).isoformat()
            debit_id = _next_id(bank, "debits", "D-", 7)
            bank.execute(
                "INSERT INTO debits VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, NULL, NULL)",
                (debit_id, contract_id, card_id, amount, created_at, batch_run_id, first_id),
            )
            bank.execute(
                "INSERT INTO payments VALUES (?, ?, ?, 'AUTO_DEBIT', ?, ?, ?)",
                (_next_id(bank, "payments", "P-", 7), contract_id, amount, created_at, created_at, debit_id),
            )
    finally:
        bank.close()

    truth = sqlite3.connect(world_dir / TRUTH_DB, timeout=10)
    try:
        with truth:
            (count,) = truth.execute("SELECT count(*) FROM ground_truth").fetchone()
            truth.execute(
                "INSERT INTO ground_truth VALUES (?, ?, ?, ?, ?, ?, 0)",
                (f"K-{count + 1:05d}", DOUBLE_DEBIT, contract_id, installment_n, amount, CAUSE_BY_HAND),
            )
    finally:
        truth.close()
    return {
        "id": debit_id, "contract_id": contract_id, "card_id": card_id, "card": f"{card[1]} ··{card[2]}",
        "amount": amount, "created_at": created_at, "status": "SUCCESS", "batch_run_id": batch_run_id,
        "retry_of": first_id, "reversed_by": None,
    }
