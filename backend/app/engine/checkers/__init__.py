"""The 4 checkers. Each is a pure function of one timeline and returns findings and cleared.

`findings` are real mistakes. `cleared` are things that look like the mistake
but are correct, each with a reason. The same function serves one complaint and
the bank-wide scan (PLAN Part 7.2).
"""

from dataclasses import dataclass

from ...connector import Charge, Debit, Installment, Payment


@dataclass(frozen=True, slots=True)
class Evidence:
    """The bank rows a reader can check, and the contract clauses to quote."""

    schedule_rows: tuple[Installment, ...] = ()
    debits: tuple[Debit, ...] = ()
    payments: tuple[Payment, ...] = ()
    charges: tuple[Charge, ...] = ()
    clauses: tuple[str, ...] = ()  # clause numbers, such as "4.2"


@dataclass(frozen=True, slots=True)
class Finding:
    type: str
    contract_id: str
    installment_n: int | None
    amount_excess: int  # money to give back
    amount_affected: int  # money involved
    days_early: int | None
    explanation: str
    evidence: Evidence


@dataclass(frozen=True, slots=True)
class Cleared:
    type: str
    reason: str
    contract_id: str
    installment_n: int | None
    explanation: str
    evidence: Evidence


@dataclass(frozen=True, slots=True)
class CheckResult:
    findings: tuple[Finding, ...] = ()
    cleared: tuple[Cleared, ...] = ()
