"""One complaint: all 4 checkers, then the verdict table (PLAN Part 7.3). Task A5.

The data decides, not the reading of the complaint. All four checks run on
every contract of the customer. The reading only chooses the period and names
the claim that the result is compared with.
"""

from dataclasses import dataclass
from datetime import date, timedelta

from .. import schemas
from ..ai import parse_complaint
from ..connector import Bank, Charge, Complaint, Debit, Payment
from . import timeline as timelines
from .checkers import CheckResult, Cleared, Evidence, Finding, check_all
from .checkers import double_debit, early_debit, illegal_fee, late_posting
from .wording import charge_name, day

CLAIM_TYPES = (double_debit.TYPE, early_debit.TYPE, late_posting.TYPE, illegal_fee.TYPE)
MISTAKE_NAMES = {
    double_debit.TYPE: "taken twice", early_debit.TYPE: "taken early",
    late_posting.TYPE: "recorded late, then fined", illegal_fee.TYPE: "fee not allowed",
}
MONTHS_WITHOUT_PERIOD = 3


# --- The verdict, a pure function -----------------------------------------


@dataclass(frozen=True, slots=True)
class Outcome:
    verdict: str
    claim_match: bool | None
    reason: str
    window: tuple[date, date]
    findings: tuple[Finding, ...]  # inside the window; those of the claimed type first
    cleared: tuple[Cleared, ...]  # inside the window


def window_for(period: str | None, received: date) -> tuple[date, date]:
    """The stated month with one month on each side. With no month: the three whole months
    before the month of the complaint, and that month up to the complaint. Whole months,
    so a payment early in a month is not cut off by a few days."""
    if period:
        month = int(period[:4]) * 12 + int(period[5:]) - 1
        first = date((month - 1) // 12, (month - 1) % 12 + 1, 1)
        last = date((month + 2) // 12, (month + 2) % 12 + 1, 1) - timedelta(days=1)
        return first, last
    month = received.year * 12 + received.month - 1 - MONTHS_WITHOUT_PERIOD
    return date(month // 12, month % 12 + 1, 1), received


def _inside(item: Finding | Cleared, window: tuple[date, date]) -> bool:
    evidence = item.evidence
    if not evidence.schedule_rows and not evidence.debits:
        return True  # a fee that belongs to no installment has no month: always checked
    first, last = window
    days = [row.due_date for row in evidence.schedule_rows]
    days += [debit.created_at.date() for debit in evidence.debits]
    days += [charge.charged_at.date() for charge in evidence.charges]
    return any(first <= one <= last for one in days)


def decide(claim_type: str, period: str | None, received: date, checked: list[CheckResult]) -> Outcome:
    """The verdict table of PLAN Part 7.3."""
    window = window_for(period, received)
    findings = [f for result in checked for f in result.findings if _inside(f, window)]
    cleared = [c for result in checked for c in result.cleared if _inside(c, window)]
    findings.sort(key=lambda f: f.type != claim_type)  # stable: the claimed type first
    cleared.sort(key=lambda c: c.type != claim_type)
    between = f"between {day(window[0])} and {day(window[1])}"

    if findings:
        match = findings[0].type == claim_type
        more = f" {len(findings) - 1} more {'mistake was' if len(findings) == 2 else 'mistakes were'} found." if len(findings) > 1 else ""
        reason = findings[0].explanation + more
        if not match:
            reason = f"The records show a different mistake than the customer described: {MISTAKE_NAMES[findings[0].type]}. " + reason
        return Outcome("SUPPORTED", match, reason, window, tuple(findings), tuple(cleared))

    if claim_type not in CLAIM_TYPES:
        reason = (
            "The complaint is not about a payment taken twice, a payment taken early, a penalty or a fee. "
            f"The four checks found no mistake {between}."
        )
        return Outcome("OUT_OF_SCOPE", None, reason, window, (), tuple(cleared))

    same = [item for item in cleared if item.type == claim_type]
    if same:
        return Outcome("NOT_SUPPORTED", None, same[0].explanation, window, (), tuple(cleared))
    if period:
        reason = f"No debit, penalty or fee matching the claim was found {between}."
        return Outcome("NOT_SUPPORTED", None, reason, window, (), tuple(cleared))
    reason = (
        f"No mistake was found {between}, and the complaint names no month. "
        "Ask the customer for the month, the card or the amount."
    )
    return Outcome("NEEDS_INFO", None, reason, window, (), tuple(cleared))


# --- From the engine's records to the shapes of the API --------------------


def debit_row(debit: Debit, cards: dict) -> schemas.DebitRow:
    card = cards.get(debit.card_id)
    return schemas.DebitRow(
        id=debit.id, contract_id=debit.contract_id, card_id=debit.card_id,
        card=card.label if card else "card", amount=debit.amount, created_at=debit.created_at,
        status=debit.status, batch_run_id=debit.batch_run_id, retry_of=debit.retry_of,
        reversed_by=debit.reversed_by,
    )


def payment_row(payment: Payment) -> schemas.PaymentRow:
    return schemas.PaymentRow(
        id=payment.id, contract_id=payment.contract_id, amount=payment.amount, channel=payment.channel,
        paid_at=payment.paid_at, posted_at=payment.posted_at, debit_id=payment.debit_id,
    )


def charge_row(charge: Charge) -> schemas.ChargeRow:
    return schemas.ChargeRow(
        id=charge.id, contract_id=charge.contract_id, kind=charge.kind, code=charge.code,
        name=charge_name(charge.code), amount=charge.amount, charged_at=charge.charged_at,
        installment_n=charge.installment_n,
    )


def _evidence(bank: Bank, contract_id: str, evidence: Evidence, cards: dict) -> schemas.Evidence:
    return schemas.Evidence(
        schedule_rows=[
            schemas.ScheduleRow(
                contract_id=row.contract_id, version=row.version, n=row.n, due_date=row.due_date,
                principal_due=row.principal_due, interest_due=row.interest_due, total_due=row.total_due,
            )
            for row in evidence.schedule_rows
        ],
        debits=[debit_row(debit, cards) for debit in evidence.debits],
        payments=[payment_row(payment) for payment in evidence.payments],
        charges=[charge_row(charge) for charge in evidence.charges],
        contract_clauses=[
            schemas.ContractClause(clause=number, text=text) for number, text in bank.clauses(contract_id, evidence.clauses)
        ],
    )


def _wrong_ids(finding: Finding) -> set[str]:
    """The bank rows that are the mistake itself. Their marks are red on the ledger."""
    evidence = finding.evidence
    kept = [debit for debit in evidence.debits if debit.kept]
    if finding.type == double_debit.TYPE:
        wrong, left = set(), finding.amount_excess
        for debit in reversed(kept):  # the last debits are the ones that took too much
            if left <= 0:
                break
            wrong.add(debit.id)
            left -= debit.amount
        return wrong
    if finding.type == early_debit.TYPE:
        return {debit.id for debit in kept}
    if finding.type == late_posting.TYPE:
        due = evidence.schedule_rows[0].due_date
        late = {payment.id for payment in evidence.payments if payment.posted_at.date() > due}
        return late | {charge.id for charge in evidence.charges}
    return {charge.id for charge in evidence.charges}


def _timeline(timeline: timelines.Timeline, outcome: Outcome, finding_ids: dict[int, str]) -> schemas.ContractTimeline | None:
    """The ledger of one contract (DESIGN section 6): the installments of the window."""
    contract = timeline.data.contract
    cards = timeline.data.cards
    findings = [f for f in outcome.findings if f.contract_id == contract.id]
    cleared = [c for c in outcome.cleared if c.contract_id == contract.id]
    wrong = set().union(*(_wrong_ids(f) for f in findings)) if findings else set()
    first, last = outcome.window
    flagged = {item.installment_n for item in findings + cleared}

    rows, shown = [], set()
    for row in timeline.rows:
        installment = row.installment
        events = []
        for debit in row.debits:
            if debit.id in shown:
                continue  # a debit that paid two installments is shown with the first
            shown.add(debit.id)
            events.append(schemas.TimelineEvent(
                kind="TAKEN", at=debit.created_at, day_offset=(debit.created_at.date() - installment.due_date).days,
                amount=debit.amount, card=cards[debit.card_id].label if debit.card_id in cards else "card",
                debit_status="FAILED" if debit.status == "FAILED" else ("SUCCESS" if debit.kept else "REVERSED"),
                channel=None, charge_kind=None, charge_name=None, wrong=debit.id in wrong, source_id=debit.id,
            ))
        for payment, part in row.payments:
            events.append(schemas.TimelineEvent(
                kind="RECORDED", at=payment.posted_at, day_offset=(payment.posted_at.date() - installment.due_date).days,
                amount=part, card=None, debit_status=None, channel=payment.channel, charge_kind=None,
                charge_name=None, wrong=payment.id in wrong, source_id=payment.id,
            ))
        for charge in row.charges:
            events.append(schemas.TimelineEvent(
                kind="CHARGED", at=charge.charged_at, day_offset=(charge.charged_at.date() - installment.due_date).days,
                amount=charge.amount, card=None, debit_status=None, channel=None, charge_kind=charge.kind,
                charge_name=charge_name(charge.code), wrong=charge.id in wrong, source_id=charge.id,
            ))
        if not (first <= installment.due_date <= last or installment.n in flagged):
            continue

        mine = [f for f in findings if f.installment_n == installment.n]
        mine.sort(key=lambda f: f.type == early_debit.TYPE)  # money to return comes first
        checked = [c for c in cleared if c.installment_n == installment.n]
        top = mine[0] if mine else None
        early = next((f for f in mine if f.type == early_debit.TYPE), None)
        late = next((f for f in mine if f.type == late_posting.TYPE), None)
        if top:
            treatment = "TAKEN_EARLY" if top.type == early_debit.TYPE else "WRONG"
        else:
            treatment = "CHECKED_CORRECT" if checked else "CORRECT"
        rows.append(schemas.TimelineRow(
            n=installment.n, due_date=installment.due_date, owed=installment.total_due, events=events,
            treatment=treatment,
            finding_type=top.type if top else None,
            finding_id=finding_ids[id(top)] if top else None,
            cleared_reason=checked[0].reason if checked and not top else None,
            sentence=top.explanation if top else (checked[0].explanation if checked else None),
            not_owed=sum(f.amount_excess for f in mine),
            taken_early=early.amount_affected if early else 0,
            days_early=early.days_early if early else None,
            business_days_late=(
                late_posting.business_days_between(installment.due_date, row.posted_at.date())
                if late and row.posted_at else None
            ),
        ))

    other = []
    for charge in timeline.other_charges:
        finding = next((f for f in findings if charge in f.evidence.charges), None)
        cleared_item = next((c for c in cleared if charge in c.evidence.charges), None)
        other.append(schemas.OtherCharge(
            charge_id=charge.id, charged_at=charge.charged_at, kind=charge.kind, name=charge_name(charge.code),
            amount=charge.amount,
            treatment="WRONG" if finding else ("CHECKED_CORRECT" if cleared_item else "CORRECT"),
            finding_id=finding_ids[id(finding)] if finding else None,
            cleared_reason=cleared_item.reason if cleared_item and not finding else None,
            sentence=finding.explanation if finding else (cleared_item.explanation if cleared_item else None),
            not_owed=finding.amount_excess if finding else 0,
        ))
    if not rows and not other:
        return None

    taken = sum(
        event.amount for row in rows for event in row.events
        if (event.kind == "TAKEN" and event.debit_status == "SUCCESS")
        or (event.kind == "RECORDED" and event.channel != "AUTO_DEBIT")
    )
    schedule = timeline.data.schedule
    return schemas.ContractTimeline(
        contract_id=contract.id, product_code=contract.product_code, product_name=contract.product_name,
        principal=contract.principal, monthly_payment=schedule[0].total_due if schedule else 0,
        due_day=contract.due_day, start_date=contract.start_date, term_months=contract.term_months,
        schedule_version=contract.schedule_version, schedule_changed_on=contract.schedule_changed_on,
        early_repayment_requested_on=contract.early_repayment_requested_on,
        rows=rows, other_charges=other,
        totals=schemas.TimelineTotals(
            owed=sum(row.owed for row in rows), taken=taken,
            not_owed=sum(row.not_owed for row in rows) + sum(charge.not_owed for charge in other),
            taken_early=sum(row.taken_early for row in rows),
        ),
    )


def finding_id(complaint_id: str, number: int) -> str:
    """F-0042-1 for the first finding of complaint C-0042. Stable when a complaint is checked again."""
    return f"F-{complaint_id.removeprefix('C-')}-{number}"


def investigate(bank: Bank, complaint: Complaint) -> schemas.CaseResult:
    """Checks one complaint against the bank's records. Writes nothing; `audit_id`,
    `elapsed_ms` and `decision` are filled in by the caller."""
    received = complaint.created_at.date()
    reading = parse_complaint.parse(complaint.text, received)
    built = [timelines.build(data) for data in bank.load(bank.contract_ids_of(complaint.customer_id)).values()]
    outcome = decide(reading.claim_type, reading.period, received, [check_all(timeline) for timeline in built])

    cards = {timeline.data.contract.id: timeline.data.cards for timeline in built}
    finding_ids = {id(f): finding_id(complaint.id, number) for number, f in enumerate(outcome.findings, start=1)}
    return schemas.CaseResult(
        case_id=complaint.id,
        complaint=schemas.Complaint(
            complaint_id=complaint.id, customer_id=complaint.customer_id, customer_name=complaint.customer_name,
            contract_id=complaint.contract_id, text=complaint.text, lang=complaint.lang, channel=complaint.channel,
            created_at=complaint.created_at, source=complaint.source, status="CHECKED",
            answer_due=None,  # the deadline is not verified yet (DECISIONS, legal fact b)
            verdict=outcome.verdict,
        ),
        understood=schemas.Understood(
            claim_type=reading.claim_type, claimed_excess=reading.claimed_excess, period=reading.period,
            mode=reading.mode,
        ),
        verdict=outcome.verdict,
        claim_match=outcome.claim_match,
        verdict_reason=outcome.reason,
        window=schemas.CheckedWindow(date_from=outcome.window[0], date_to=outcome.window[1]),
        findings=[
            schemas.Finding(
                finding_id=finding_ids[id(f)], type=f.type, contract_id=f.contract_id,
                installment_n=f.installment_n, amount_excess=f.amount_excess, amount_affected=f.amount_affected,
                days_early=f.days_early, explanation=f.explanation, legal_basis=f.legal_basis,
                evidence=_evidence(bank, f.contract_id, f.evidence, cards[f.contract_id]),
            )
            for f in outcome.findings
        ],
        cleared=[
            schemas.Cleared(
                type=c.type, reason=c.reason, contract_id=c.contract_id, installment_n=c.installment_n,
                explanation=c.explanation, evidence=_evidence(bank, c.contract_id, c.evidence, cards[c.contract_id]),
            )
            for c in outcome.cleared
        ],
        total_excess=sum(f.amount_excess for f in outcome.findings),
        total_affected=sum(f.amount_affected for f in outcome.findings),
        timelines=[shape for shape in (_timeline(timeline, outcome, finding_ids) for timeline in built) if shape],
        draft_reply=None,  # task B6 writes the letter
        decision=None,
        audit_id="-",
        elapsed_ms=0,
    )
