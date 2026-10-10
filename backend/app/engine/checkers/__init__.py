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
    legal_basis: str | None = None  # a verified citation, "TO VERIFY", or None when no law is involved


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


from . import double_debit, early_debit, illegal_fee, late_posting  # noqa: E402  (they need the classes above)

# The one implementation of each check, by mistake type.
CHECKERS = {
    double_debit.TYPE: double_debit.check,
    early_debit.TYPE: early_debit.check,
    late_posting.TYPE: late_posting.check,
    illegal_fee.TYPE: illegal_fee.check,
}


def check_all(timeline) -> CheckResult:
    """All 4 checks on one contract."""
    results = [check(timeline) for check in CHECKERS.values()]
    return CheckResult(
        tuple(finding for result in results for finding in result.findings),
        tuple(item for result in results for item in result.cleared),
    )
