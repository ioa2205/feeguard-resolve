"""Illegal fee checker (PLAN Part 7.2). Task A4.

Rule: a fee was charged that the contract does not list, or that is on the
"not allowed by law" list. The excess is the fee.

A law entry is used only when a person has verified its source (DECISIONS
D-023). Until then a fee is flagged only when the contract does not list it,
which the data can prove, and the unverified basis is shown as "TO VERIFY".
"""

import json
from pathlib import Path

from ..timeline import Timeline
from ..wording import day, said, som, tr
from . import CheckResult, Cleared, Evidence, Finding

TYPE = "ILLEGAL_FEE"
FEE_IN_CONTRACT = "FEE_IN_CONTRACT"
FEE = "FEE"

FEES_CLAUSE = "3.1"
NO_OTHER_FEES_CLAUSE = "3.2"

FEE_NAMES = {
    "LOAN_ISSUANCE": ("loan issuance fee", "kredit rasmiylashtirish komissiyasi", "комиссия за выдачу кредита"),
    "CARD_REISSUE": ("card reissue fee", "kartani qayta chiqarish komissiyasi", "комиссия за перевыпуск карты"),
}

_LAW_FILE = Path(__file__).resolve().parents[3] / "data" / "law_rules.json"


def load_law(path: Path = _LAW_FILE) -> dict[str, dict]:
    """Fee codes named in law_rules.json: code -> entry."""
    with path.open(encoding="utf-8") as file:
        return {entry["code"]: entry for entry in json.load(file)["fees_not_allowed"]}


_LAW = load_law()


def fee_name(code: str) -> str:
    names = FEE_NAMES.get(code)
    return tr(*names) if names else code.replace("_", " ").lower()


def check(timeline: Timeline, law: dict[str, dict] | None = None) -> CheckResult:
    law = _LAW if law is None else law
    findings: list[Finding] = []
    cleared: list[Cleared] = []
    contract = timeline.data.contract

    fees = [charge for charge in timeline.data.charges if charge.kind == FEE]
    for charge in sorted(fees, key=lambda c: (c.charged_at, c.id)):
        entry = law.get(charge.code)
        forbidden = bool(entry and entry.get("verified"))
        listed = charge.code in contract.allowed_fees
        installment = timeline.row(charge.installment_n) if charge.installment_n is not None else None
        evidence = Evidence(
            schedule_rows=(installment.installment,) if installment else (),
            charges=(charge,),
            clauses=(FEES_CLAUSE,) if listed and not forbidden else (FEES_CLAUSE, NO_OTHER_FEES_CLAUSE),
        )
        if listed and not forbidden:
            cleared.append(
                Cleared(TYPE, FEE_IN_CONTRACT, contract.id, charge.installment_n,
                        said(lambda: tr(f"This fee is listed in clause {FEES_CLAUSE} of the contract.",
                                        f"Bu komissiya shartnomaning {FEES_CLAUSE}-bandida koʻrsatilgan.",
                                        f"Эта комиссия указана в пункте {FEES_CLAUSE} договора.")), evidence)
            )
            continue

        findings.append(
            Finding(
                TYPE, contract.id, charge.installment_n,
                amount_excess=charge.amount, amount_affected=charge.amount, days_early=None,
                explanation=said(lambda: _explain(charge, listed)),
                evidence=evidence,
                # Shown with the finding. Unverified text stays "TO VERIFY" and decides nothing.
                legal_basis=entry["legal_basis"] if entry else None,
            )
        )
    return CheckResult(tuple(findings), tuple(cleared))


def _explain(charge, listed: bool) -> str:
    name, amount, on = fee_name(charge.code), som(charge.amount), day(charge.charged_at.date())
    if listed:
        reason = tr("The contract lists this fee, but the law does not allow it.",
                    "Shartnomada bu komissiya koʻrsatilgan, ammo qonun unga ruxsat bermaydi.",
                    "Комиссия указана в договоре, но закон её не допускает.")
    else:
        reason = tr("The contract does not list this fee.", "Shartnomada bu komissiya koʻrsatilmagan.",
                    "В договоре эта комиссия не указана.")
    return tr(f"A {name} of {amount} was charged on {on}. {reason}",
              f"{on} kuni {amount} miqdorida {name} olingan. {reason}",
              f"{on} удержана {name} в размере {amount}. {reason}")
