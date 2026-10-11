"""Late posting checker (PLAN Part 7.2). Task A4.

Rule: the money for an installment arrived on or before its due date, the bank
recorded it on the loan after the due date, and a penalty was charged for that
installment. The excess is the penalty.
"""

from datetime import date, timedelta

from ..timeline import Row, Timeline
from ..wording import business_days, day, said, som, tr
from . import CheckResult, Cleared, Evidence, Finding

TYPE = "LATE_POSTING"
PAID_AFTER_DUE_DATE = "PAID_AFTER_DUE_DATE"
PENALTY = "PENALTY"

PAID_DAY_COUNTS_CLAUSE = "4.5"
PENALTY_CLAUSE = "5.1"
NO_PENALTY_IN_TIME_CLAUSE = "5.2"

CHANNEL_NAMES = {
    "AUTO_DEBIT": ("automatic debit", "avtomatik yechim", "автосписание"),
    "PAYNET": ("Paynet", "Paynet", "Paynet"),
    "CLICK": ("Click", "Click", "Click"),
    "BRANCH": ("a bank branch", "bank filiali", "отделение банка"),
    "APP": ("the bank app", "bank ilovasi", "приложение банка"),
}


def channel_name(code: str) -> str:
    return tr(*CHANNEL_NAMES.get(code, ("another channel", "boshqa kanal", "другой канал")))


def business_days_between(start: date, end: date) -> int:
    """Business days after `start`, up to and including `end`. Saturday and Sunday do not count."""
    total, current = 0, start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            total += 1
    return total


def check(timeline: Timeline) -> CheckResult:
    findings: list[Finding] = []
    cleared: list[Cleared] = []
    contract_id = timeline.data.contract.id

    for row in timeline.rows:
        penalties = tuple(charge for charge in row.charges if charge.kind == PENALTY)
        if not penalties:
            continue
        due = row.installment.due_date
        fined = sum(charge.amount for charge in penalties)

        if row.paid_at is None or row.paid_at.date() > due:
            arrived = said(lambda: tr(
                f"The payment arrived on {day(row.paid_at.date())}, after the due date.",
                f"Toʻlov {day(row.paid_at.date())} kuni, muddatdan keyin kelgan.",
                f"Платёж поступил {day(row.paid_at.date())}, после срока.",
            ) if row.paid_at else tr(
                f"No full payment had arrived by the due date, {day(due)}.",
                f"Toʻlov muddatigacha ({day(due)}) toʻliq toʻlov kelmagan.",
                f"К сроку оплаты, {day(due)}, полный платёж не поступил.",
            ))
            cleared.append(
                Cleared(TYPE, PAID_AFTER_DUE_DATE, contract_id, row.installment.n, arrived,
                        _evidence(row, penalties, (PENALTY_CLAUSE,)))
            )
        elif row.posted_at.date() > due:
            late = business_days_between(due, row.posted_at.date())
            channels = {payment.channel for payment, _ in row.payments}
            only = next(iter(channels)) if len(channels) == 1 else None
            findings.append(
                Finding(
                    TYPE, contract_id, row.installment.n,
                    amount_excess=fined, amount_affected=fined, days_early=None,
                    explanation=said(lambda: _explain(row, due, late, only, fined)),
                    evidence=_evidence(row, penalties, (PAID_DAY_COUNTS_CLAUSE, NO_PENALTY_IN_TIME_CLAUSE)),
                )
            )
    return CheckResult(tuple(findings), tuple(cleared))


def _explain(row: Row, due: date, late: int, channel: str | None, fined: int) -> str:
    owed, paid, posted = som(row.installment.total_due), day(row.paid_at.date()), day(row.posted_at.date())
    if channel:
        through = tr(f" through {channel_name(channel)}", f" {channel_name(channel)} orqali", f" через {channel_name(channel)}")
    else:
        through = ""
    return tr(
        f"{owed} was due on {day(due)}. The customer paid it{through} on {paid}, in time. The bank recorded it on "
        f"{posted}, {business_days(late)} late, and charged a penalty of {som(fined)}.",
        f"{day(due)} kuni {owed} toʻlanishi kerak edi. Mijoz uni {paid} kuni{through}, oʻz vaqtida toʻlagan. Bank "
        f"toʻlovni {posted} kuni, {business_days(late)} kechikib qayd etgan va {som(fined)} jarima olgan.",
        f"К оплате {day(due)} было {owed}. Клиент оплатил{through} {paid}, вовремя. Банк зачислил платёж {posted}, "
        f"с опозданием на {business_days(late)}, и начислил штраф {som(fined)}.",
    )


def _evidence(row: Row, penalties: tuple, clauses: tuple[str, ...]) -> Evidence:
    return Evidence(
        schedule_rows=(row.installment,),
        debits=tuple(row.debits),
        payments=tuple(payment for payment, _ in row.payments),
        charges=penalties,
        clauses=clauses,
    )
