"""Annuity schedules in whole soʻm. The last installment absorbs the rounding. Task A1.

All arithmetic is on integers and decimals, never floats, so the same contract
gives the same schedule on every machine.
"""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache

# One schedule row: (n, due_date, principal_due, interest_due, total_due).
Row = tuple[int, date, int, int, int]


@lru_cache(maxsize=None)
def _annuity_factor(annual_bp: int, term: int) -> Decimal:
    monthly = Decimal(annual_bp) / Decimal(120_000)
    return monthly / (1 - (1 + monthly) ** -term)


def monthly_payment(principal: int, annual_bp: int, term: int) -> int:
    """The level payment, rounded up to the next 1 000 soʻm."""
    exact = Decimal(principal) * _annuity_factor(annual_bp, term)
    whole = int(exact.to_integral_value(rounding=ROUND_HALF_UP))
    return -(-whole // 1000) * 1000


def due_date(start: date, n: int, due_day: int) -> date:
    """The due date of installment n: n months after the start, on the due day."""
    months = start.year * 12 + start.month - 1 + n
    return date(months // 12, months % 12 + 1, due_day)


def build_schedule(principal: int, annual_bp: int, term: int, start: date, due_day: int) -> list[Row]:
    payment = monthly_payment(principal, annual_bp, term)
    balance = principal
    rows: list[Row] = []
    for n in range(1, term + 1):
        interest = (balance * annual_bp + 60_000) // 120_000
        part = balance if n == term else payment - interest
        if part <= 0:
            raise ValueError(f"installment {n} repays nothing: {principal=} {annual_bp=} {term=}")
        rows.append((n, due_date(start, n, due_day), part, interest, part + interest))
        balance -= part
    return rows


def move_due_day(rows: list[Row], start: date, from_n: int, new_due_day: int) -> list[Row]:
    """A changed schedule: the same amounts, a new due day from installment `from_n` on."""
    return [
        row if row[0] < from_n else (row[0], due_date(start, row[0], new_due_day), *row[2:])
        for row in rows
    ]
