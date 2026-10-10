"""The plan of measures (Annex 5 of Rule 3030-12, columns TO VERIFY). Tasks A8 and B6.

A row is drafted for every mistake type that a person has confirmed on at least
one case. The draft's numbers come from the bank-wide scan, its measures from
the cause finder and the fix library. Deadlines and the responsible person are
left empty: only a person sets them. A row a person has saved is kept as saved.
"""

import sqlite3

from .. import schemas
from ..engine.checkers import double_debit, early_debit, illegal_fee, late_posting
from ..engine.wording import days, som
from ..schemas import TO_VERIFY

TYPES = (double_debit.TYPE, early_debit.TYPE, late_posting.TYPE, illegal_fee.TYPE)

# A suggestion for a person to change; the bank's own unit names are not known.
UNITS = {
    double_debit.TYPE: "Card processing",
    early_debit.TYPE: "Loan servicing",
    late_posting.TYPE: "Payments operations",
    illegal_fee.TYPE: "Products and tariffs",
}
_COLUMNS = ("id", "finding_type", "deficiency", "measures", "deadline", "responsible_unit",
            "responsible_exec", "monitoring_deadline", "status")


def row_id(finding_type: str) -> str:
    return f"AP-{finding_type.replace('_', '-')}"


def confirmed_types(store: sqlite3.Connection) -> set[str]:
    """Mistake types found on a case whose verdict a person confirmed."""
    rows = store.execute(
        """SELECT DISTINCT f.type FROM findings f
           JOIN decisions d ON d.case_id = f.case_id
           WHERE d.action = 'CONFIRM'
              OR (d.action = 'CORRECT' AND d.corrected_verdict = 'SUPPORTED')"""
    )
    return {kind for (kind,) in rows}


def deficiency(scan: schemas.ScanResult) -> str:
    customers = scan.affected_customers
    who = f"{customers} customer{'s' if customers != 1 else ''}, {scan.silent} of them never complained"
    text = {
        double_debit.TYPE: f"Loan installments were collected twice in one billing run: {who}. "
                           f"{som(scan.total_excess)} was taken that was not owed.",
        early_debit.TYPE: f"Automatic debits were taken before the due date: {who}. {som(scan.total_affected)} "
                          f"was taken early, on average {days(scan.avg_days_early or 0)} early.",
        late_posting.TYPE: f"Payments made in time were recorded after the due date and fined: {who}. "
                           f"{som(scan.total_excess)} was charged in penalties.",
        illegal_fee.TYPE: f"A fee that the contract does not list was charged: {who}. "
                          f"{som(scan.total_excess)} was charged in fees.",
    }[scan.finding_type]
    if scan.cause and scan.cause.attributes:
        text += f" {scan.cause.sentence}"
    return text


def measures(scan: schemas.ScanResult) -> str:
    customers = scan.affected_customers
    if scan.finding_type == early_debit.TYPE:
        first = f"Correct the automatic debit dates of the {customers} customers."
    else:
        first = f"Return {som(scan.total_excess)} to the {customers} customers, also to those who never complained."
    fix = scan.cause.suggested_fix if scan.cause else None
    return f"{first} {fix}" if fix else first


def draft(scan: schemas.ScanResult) -> schemas.ActionPlanRow:
    return schemas.ActionPlanRow(
        id=row_id(scan.finding_type), finding_type=scan.finding_type, deficiency=deficiency(scan),
        measures=measures(scan), deadline=None, responsible_unit=UNITS[scan.finding_type],
        responsible_exec="", monitoring_deadline=None, status="DRAFT",
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
