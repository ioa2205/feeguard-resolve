"""Double debit checker (PLAN Part 7.2). Task A3.

Rule: in one billing run, the successful debits that were not returned took
more than was owed at that time. The excess is what they took beyond it.
"""

from ...connector import FAILED, SUCCESS
from ..timeline import Run, Timeline
from ..wording import clock, count, day, month, som
from . import CheckResult, Cleared, Evidence, Finding

TYPE = "DOUBLE_DEBIT"
ARREARS_COVERED = "ARREARS_COVERED"
RETRY_AFTER_FAILURE = "RETRY_AFTER_FAILURE"
ALREADY_REVERSED = "ALREADY_REVERSED"

PAID_ONCE_CLAUSE = "4.2"
OVERDUE_CLAUSE = "4.3"


def check(timeline: Timeline) -> CheckResult:
    findings: list[Finding] = []
    cleared: list[Cleared] = []
    contract_id = timeline.data.contract.id

    for run in timeline.runs:
        kept = [debit for debit in run.debits if debit.kept]
        returned = [debit for debit in run.debits if debit.status == SUCCESS and not debit.kept]
        failed = [debit for debit in run.debits if debit.status == FAILED]
        installment_n = run.rows[-1] if run.rows else None

        if run.excess > 0:
            findings.append(
                Finding(
                    TYPE, contract_id, installment_n,
                    amount_excess=run.excess, amount_affected=run.excess, days_early=None,
                    explanation=_explain(timeline, run),
                    evidence=_evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
        elif len(kept) >= 2 and run.overdue:
            overdue = timeline.row(run.overdue[0]).installment
            cleared.append(
                Cleared(
                    TYPE, ARREARS_COVERED, contract_id, installment_n,
                    f"The second debit paid the overdue installment of {month(overdue.due_date)}.",
                    _evidence(timeline, run, OVERDUE_CLAUSE),
                )
            )
        elif returned:
            cleared.append(
                Cleared(
                    TYPE, ALREADY_REVERSED, contract_id, installment_n,
                    f"The duplicate debit was returned on {day(returned[0].reversed_at)}.",
                    _evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
        elif failed and len(kept) == 1:
            cleared.append(
                Cleared(
                    TYPE, RETRY_AFTER_FAILURE, contract_id, installment_n,
                    "The first debit failed. Only one debit succeeded.",
                    _evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
    return CheckResult(tuple(findings), tuple(cleared))


def _explain(timeline: Timeline, run: Run) -> str:
    cards = timeline.data.cards
    kept = [debit for debit in run.debits if debit.kept]

    if not run.rows:
        owed = f"Nothing was owed on {day(run.at.date())}: the loan has no unpaid installment."
    elif len(run.rows) == 1:
        due = timeline.row(run.rows[0]).installment.due_date
        owed = f"{som(run.owed)} was due on {day(due)}."
    else:
        owed = f"{som(run.owed)} was owed on {day(run.at.date())}, for {len(run.rows)} installments."

    taken_list = ", ".join(
        f"{cards[debit.card_id].network if debit.card_id in cards else 'card'} {clock(debit.created_at)}"
        for debit in kept
    )
    if len(kept) == 1:
        taken = f"One debit took {som(run.collected)} ({taken_list})."
    elif len({debit.amount for debit in kept}) == 1:
        taken = f"{count(len(kept))} successful debits of {som(kept[0].amount)} were taken ({taken_list})."
    else:
        taken = f"{count(len(kept))} successful debits took {som(run.collected)} in total ({taken_list})."

    if len(kept) == 1:
        return f"{owed} {taken} {som(run.excess)} of it was not owed."
    returned = "Neither was returned." if len(kept) == 2 else "None was returned."
    return f"{owed} {taken} {returned}"


def _evidence(timeline: Timeline, run: Run, clause: str) -> Evidence:
    debit_ids = {debit.id for debit in run.debits}
    return Evidence(
        schedule_rows=tuple(timeline.row(n).installment for n in run.rows),
        debits=run.debits,
        payments=tuple(p for p in timeline.data.payments if p.debit_id in debit_ids),
        clauses=(clause,),
    )
