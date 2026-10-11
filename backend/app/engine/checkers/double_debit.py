"""Double debit checker (PLAN Part 7.2). Task A3.

Rule: in one billing run, the successful debits that were not returned took
more than was owed at that time. The excess is what they took beyond it.
"""

from ...connector import FAILED, SUCCESS
from ..timeline import Run, Timeline
from ..wording import clock, count, day, month, plural_ru, said, som, tr
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
                    explanation=said(lambda: _explain(timeline, run)),
                    evidence=_evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
        elif len(kept) >= 2 and run.overdue:
            overdue = timeline.row(run.overdue[0]).installment
            cleared.append(
                Cleared(
                    TYPE, ARREARS_COVERED, contract_id, installment_n,
                    said(lambda: tr(
                        f"The second debit paid the overdue installment of {month(overdue.due_date)}.",
                        f"Ikkinchi yechim {month(overdue.due_date)} uchun muddati oʻtgan toʻlovni qopladi.",
                        f"Второе списание погасило просроченный платёж за {month(overdue.due_date)}",  # ends in "г."
                    )),
                    _evidence(timeline, run, OVERDUE_CLAUSE),
                )
            )
        elif returned:
            cleared.append(
                Cleared(
                    TYPE, ALREADY_REVERSED, contract_id, installment_n,
                    said(lambda: tr(
                        f"The duplicate debit was returned on {day(returned[0].reversed_at)}.",
                        f"Takroriy yechim {day(returned[0].reversed_at)} kuni qaytarildi.",
                        f"Повторное списание было возвращено {day(returned[0].reversed_at)}",
                    )),
                    _evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
        elif failed and len(kept) == 1:
            cleared.append(
                Cleared(
                    TYPE, RETRY_AFTER_FAILURE, contract_id, installment_n,
                    said(lambda: tr(
                        "The first debit failed. Only one debit succeeded.",
                        "Birinchi yechim amalga oshmadi. Faqat bitta yechim muvaffaqiyatli boʻldi.",
                        "Первое списание не прошло. Успешным было только одно.",
                    )),
                    _evidence(timeline, run, PAID_ONCE_CLAUSE),
                )
            )
    return CheckResult(tuple(findings), tuple(cleared))


def _explain(timeline: Timeline, run: Run) -> str:
    cards = timeline.data.cards
    kept = [debit for debit in run.debits if debit.kept]

    on = day(run.at.date())
    if not run.rows:
        owed = tr(f"Nothing was owed on {on}: the loan has no unpaid installment.",
                  f"{on} kuni hech narsa toʻlanishi kerak emas edi: kreditda toʻlanmagan toʻlov yoʻq.",
                  f"На {on} ничего не причиталось: у кредита нет неоплаченных платежей.")
    elif len(run.rows) == 1:
        due = day(timeline.row(run.rows[0]).installment.due_date)
        owed = tr(f"{som(run.owed)} was due on {due}.", f"{due} kuni {som(run.owed)} toʻlanishi kerak edi.",
                  f"К оплате {due} было {som(run.owed)}.")
    else:
        n = len(run.rows)
        owed = tr(f"{som(run.owed)} was owed on {on}, for {n} installments.",
                  f"{on} kuni {n} ta toʻlov uchun {som(run.owed)} qarz edi.",
                  f"На {on} долг составлял {som(run.owed)} за {n} {plural_ru(n, 'платёж', 'платежа', 'платежей')}.")

    card = tr("card", "karta", "карта")
    taken_list = ", ".join(
        f"{cards[debit.card_id].network if debit.card_id in cards else card} {clock(debit.created_at)}"
        for debit in kept
    )
    n = len(kept)
    times_ru = plural_ru(n, "раз", "раза", "раз")
    if n == 1:
        taken = tr(f"One debit took {som(run.collected)} ({taken_list}).",
                   f"Bir marta {som(run.collected)} yechildi ({taken_list}).",
                   f"Списано один раз: {som(run.collected)} ({taken_list}).")
    elif len({debit.amount for debit in kept}) == 1:
        taken = tr(f"{count(n)} successful debits of {som(kept[0].amount)} were taken ({taken_list}).",
                   f"{n} marta {som(kept[0].amount)}dan muvaffaqiyatli yechildi ({taken_list}).",
                   f"Успешно списано {n} {times_ru} по {som(kept[0].amount)} ({taken_list}).")
    else:
        taken = tr(f"{count(n)} successful debits took {som(run.collected)} in total ({taken_list}).",
                   f"{n} marta muvaffaqiyatli yechildi, jami {som(run.collected)} ({taken_list}).",
                   f"Успешно списано {n} {times_ru}, всего {som(run.collected)} ({taken_list}).")

    if n == 1:
        not_owed = tr(f"{som(run.excess)} of it was not owed.", f"Shundan {som(run.excess)} toʻlanishi kerak emas edi.",
                      f"Из них {som(run.excess)} не причиталось.")
        return f"{owed} {taken} {not_owed}"
    returned = tr("Neither was returned." if n == 2 else "None was returned.", "Hech biri qaytarilmadi.",
                  "Ни одно не было возвращено.")
    return f"{owed} {taken} {returned}"


def _evidence(timeline: Timeline, run: Run, clause: str) -> Evidence:
    debit_ids = {debit.id for debit in run.debits}
    return Evidence(
        schedule_rows=tuple(timeline.row(n).installment for n in run.rows),
        debits=run.debits,
        payments=tuple(p for p in timeline.data.payments if p.debit_id in debit_ids),
        clauses=(clause,),
    )
