"""Early debit checker (PLAN Part 7.2). Task A4.

Rule: an automatic debit took money before the due date of the earliest unpaid
installment, and the customer had not asked for early repayment. The money was
owed, only later, so nothing is to return: `amount_excess` is 0 and
`amount_affected` is the money taken early.
"""

from ..timeline import Run, Timeline
from ..wording import clock, day, days, som
from . import CheckResult, Cleared, Evidence, Finding

TYPE = "EARLY_DEBIT"
EARLY_REPAYMENT_REQUESTED = "EARLY_REPAYMENT_REQUESTED"

NOT_BEFORE_DUE_CLAUSE = "4.4"
NEW_SCHEDULE_CLAUSE = "4.6"


def check(timeline: Timeline) -> CheckResult:
    findings: list[Finding] = []
    cleared: list[Cleared] = []
    contract = timeline.data.contract

    for run in timeline.runs:
        if not run.early or run.collected == 0:
            continue
        installment = timeline.row(run.rows[0]).installment
        taken_on = run.at.date()
        asked_on = contract.early_repayment_requested_on
        if asked_on and asked_on <= taken_on:
            cleared.append(
                Cleared(
                    TYPE, EARLY_REPAYMENT_REQUESTED, contract.id, installment.n,
                    f"The customer asked for early repayment on {day(asked_on)}.",
                    _evidence(timeline, run, (NOT_BEFORE_DUE_CLAUSE,)),
                )
            )
            continue

        days_early = (installment.due_date - taken_on).days
        # What a second debit took beyond the installment is a double debit, not this.
        taken_early = min(run.collected, run.owed)
        changed_on = contract.schedule_changed_on
        moved = bool(changed_on and changed_on <= taken_on)
        findings.append(
            Finding(
                TYPE, contract.id, installment.n,
                amount_excess=0, amount_affected=taken_early, days_early=days_early,
                explanation=_explain(timeline, run, taken_early, days_early, moved),
                evidence=_evidence(
                    timeline, run, (NOT_BEFORE_DUE_CLAUSE, NEW_SCHEDULE_CLAUSE) if moved else (NOT_BEFORE_DUE_CLAUSE,)
                ),
            )
        )
    return CheckResult(tuple(findings), tuple(cleared))


def _explain(timeline: Timeline, run: Run, taken_early: int, days_early: int, moved: bool) -> str:
    cards = timeline.data.cards
    installment = timeline.row(run.rows[0]).installment
    first = next(debit for debit in run.debits if debit.kept)
    card = cards[first.card_id].network if first.card_id in cards else "card"
    sentence = (
        f"{som(installment.total_due)} was due on {day(installment.due_date)}. "
        f"{som(taken_early)} was taken on {day(run.at.date())} ({card} {clock(first.created_at)}), "
        f"{days(days_early)} early. The customer had not asked for early repayment."
    )
    if moved:
        changed_on = timeline.data.contract.schedule_changed_on
        sentence += f" The payment schedule was changed on {day(changed_on)}, and the debit still came before the new date."
    return sentence


def _evidence(timeline: Timeline, run: Run, clauses: tuple[str, ...]) -> Evidence:
    debit_ids = {debit.id for debit in run.debits}
    return Evidence(
        schedule_rows=tuple(timeline.row(n).installment for n in run.rows),
        debits=run.debits,
        payments=tuple(p for p in timeline.data.payments if p.debit_id in debit_ids),
        clauses=clauses,
    )
