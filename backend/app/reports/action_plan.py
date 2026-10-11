"""The plan of measures (Annex 5 of Rule 3030-12, columns TO VERIFY). Tasks A8 and B6.

A row is drafted for every mistake type that a person has confirmed on at least
one case. The draft's numbers come from the bank-wide scan, its measures from
the cause finder and the fix library. Deadlines and the responsible person are
left empty: only a person sets them. A row a person has saved is kept as saved.
"""

import sqlite3

from .. import schemas
from ..engine.checkers import double_debit, early_debit, illegal_fee, late_posting
from ..engine.wording import days, said, som, tr, words
from ..schemas import TO_VERIFY

TYPES = (double_debit.TYPE, early_debit.TYPE, late_posting.TYPE, illegal_fee.TYPE)

# A suggestion for a person to change; the bank's own unit names are not known.
UNITS = {
    double_debit.TYPE: ("Card processing", "Kartalarga xizmat koʻrsatish", "Процессинг карт"),
    early_debit.TYPE: ("Loan servicing", "Kreditlarga xizmat koʻrsatish", "Обслуживание кредитов"),
    late_posting.TYPE: ("Payments operations", "Toʻlov operatsiyalari", "Платёжные операции"),
    illegal_fee.TYPE: ("Products and tariffs", "Mahsulotlar va tariflar", "Продукты и тарифы"),
}
_COLUMNS = ("id", "finding_type", "deficiency", "measures", "deadline", "responsible_unit",
            "responsible_exec", "monitoring_deadline", "status")


def row_id(finding_type: str) -> str:
    return f"AP-{finding_type.replace('_', '-')}"


def confirmed_types(store: sqlite3.Connection) -> set[str]:
    """Mistake types found on a case whose verdict a person confirmed, or whose incident
    refund a person approved (D-040)."""
    rows = store.execute(
        """SELECT DISTINCT f.type FROM findings f
           JOIN decisions d ON d.case_id = f.case_id
           WHERE d.action = 'CONFIRM'
              OR (d.action = 'CORRECT' AND d.corrected_verdict = 'SUPPORTED')
           UNION SELECT finding_type FROM incidents WHERE approved_at IS NOT NULL"""
    )
    return {kind for (kind,) in rows}


def _cause(scan: schemas.ScanResult) -> str:
    """The cause sentence in the language being built."""
    words_of = scan.cause.sentence_t if scan.cause else None
    if words_of is None:
        return scan.cause.sentence if scan.cause else ""
    return tr(words_of.en, words_of.uz, words_of.ru)


def _fix(scan: schemas.ScanResult) -> str | None:
    if not scan.cause or not scan.cause.suggested_fix:
        return None
    words_of = scan.cause.suggested_fix_t
    return tr(words_of.en, words_of.uz, words_of.ru) if words_of else scan.cause.suggested_fix


def deficiency(scan: schemas.ScanResult) -> str:
    return said(lambda: _deficiency(scan))


def _deficiency(scan: schemas.ScanResult) -> str:
    customers, silent = scan.affected_customers, scan.silent
    who = tr(f"{customers} customer{'s' if customers != 1 else ''}, {silent} of them never complained",
             f"{customers} nafar mijoz, ulardan {silent} nafari hech qachon shikoyat qilmagan",
             f"клиентов: {customers}, из них никогда не жаловались: {silent}")
    excess, affected = som(scan.total_excess), som(scan.total_affected)
    early = days(scan.avg_days_early or 0)
    text = {
        double_debit.TYPE: tr(
            f"Loan installments were collected twice in one billing run: {who}. {excess} was taken that was not owed.",
            f"Kredit toʻlovlari bitta hisob-kitob jarayonida ikki marta yechilgan: {who}. Qarz boʻlmagan {excess} olingan.",
            f"Платежи по кредитам списаны дважды за один прогон: {who}. Списано {excess}, которые не причитались."),
        early_debit.TYPE: tr(
            f"Automatic debits were taken before the due date: {who}. {affected} was taken early, "
            f"on average {early} early.",
            f"Avtomatik yechimlar toʻlov muddatidan oldin amalga oshirilgan: {who}. {affected} muddatidan oldin "
            f"yechilgan, oʻrtacha {early} oldin.",
            f"Автосписания проведены раньше срока: {who}. Досрочно списано {affected}, в среднем на {early} раньше."),
        late_posting.TYPE: tr(
            f"Payments made in time were recorded after the due date and fined: {who}. "
            f"{excess} was charged in penalties.",
            f"Oʻz vaqtida qilingan toʻlovlar muddatdan keyin qayd etilib, jarima solingan: {who}. "
            f"Jami {excess} jarima olingan.",
            f"Вовремя внесённые платежи зачислены после срока, начислены штрафы: {who}. Штрафов начислено на {excess}."),
        illegal_fee.TYPE: tr(
            f"A fee that the contract does not list was charged: {who}. {excess} was charged in fees.",
            f"Shartnomada koʻrsatilmagan komissiya olingan: {who}. Jami {excess} komissiya olingan.",
            f"Взята комиссия, которой нет в договоре: {who}. Комиссий взято на {excess}."),
    }[scan.finding_type]
    if scan.cause and scan.cause.attributes:
        text += f" {_cause(scan)}"
    return text


def measures(scan: schemas.ScanResult) -> str:
    return said(lambda: _measures(scan))


def _measures(scan: schemas.ScanResult) -> str:
    customers, excess = scan.affected_customers, som(scan.total_excess)
    if scan.finding_type == early_debit.TYPE:
        first = tr(f"Correct the automatic debit dates of the {customers} customers.",
                   f"{customers} nafar mijozning avtomatik yechish sanalarini tuzating.",
                   f"Исправить даты автосписаний у {customers} клиентов.")
    else:
        first = tr(f"Return {excess} to the {customers} customers, also to those who never complained.",
                   f"{customers} nafar mijozga {excess} qaytaring, shikoyat qilmaganlarga ham.",
                   f"Вернуть {excess} клиентам ({customers}), в том числе тем, кто не жаловался.")
    fix = _fix(scan)
    return f"{first} {fix}" if fix else first


def draft(scan: schemas.ScanResult) -> schemas.ActionPlanRow:
    found, todo, unit = deficiency(scan), measures(scan), said(lambda: tr(*UNITS[scan.finding_type]))
    return schemas.ActionPlanRow(
        id=row_id(scan.finding_type), finding_type=scan.finding_type, deficiency=found,
        measures=todo, deadline=None, responsible_unit=unit,
        responsible_exec="", monitoring_deadline=None, status="DRAFT",
        deficiency_t=words(found), measures_t=words(todo), responsible_unit_t=words(unit),
    )


def saved_rows(store: sqlite3.Connection) -> dict[str, schemas.ActionPlanRow]:
    rows = store.execute(f"SELECT {', '.join(_COLUMNS)} FROM action_plans")
    return {row[0]: schemas.ActionPlanRow(**dict(zip(_COLUMNS, row))) for row in rows}


def plan(store: sqlite3.Connection, scan_of) -> schemas.ActionPlan:
    """Saved rows, and a draft for each confirmed mistake type that has none yet.
    `scan_of(finding_type)` runs the bank-wide scan."""
    saved = saved_rows(store)
    confirmed = confirmed_types(store)
    items = []
    for kind in TYPES:
        if row_id(kind) in saved:
            items.append(saved[row_id(kind)])
        elif kind in confirmed:
            items.append(draft(scan_of(kind)))
    return schemas.ActionPlan(items=items, format_basis=TO_VERIFY)


def finding_type_of(plan_id: str) -> str | None:
    return next((kind for kind in TYPES if row_id(kind) == plan_id), None)


def save(store: sqlite3.Connection, plan_id: str, finding_type: str, update: schemas.ActionPlanUpdate) -> schemas.ActionPlanRow:
    row = schemas.ActionPlanRow(id=plan_id, finding_type=finding_type, **update.model_dump())
    values = row.model_dump(mode="json")
    store.execute(
        f"INSERT OR REPLACE INTO action_plans ({', '.join(_COLUMNS)}) VALUES ({', '.join('?' * len(_COLUMNS))})",
        tuple(values[name] for name in _COLUMNS),
    )
    return row
