"""API shapes of PLAN Part 10, frozen in task M0.2.

`frontend/src/types.ts` mirrors this file by hand. Change both together and
record the change in docs/DECISIONS.md.

Conventions:
- Money is whole soʻm (`Som`): a strict integer, never a float.
- A date is "YYYY-MM-DD". A time is "YYYY-MM-DDTHH:MM:SS". Both are Tashkent
  time and carry no offset, so a screen can never shift them.
- A share (`support`, a rate) is a fraction: 0.93 means 93%.
- Ids are opaque strings. Nothing may parse them.
- A legal text that nobody has verified yet carries the literal `TO_VERIFY`.
"""

from datetime import date
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, NaiveDatetime

TO_VERIFY = "TO VERIFY"
DEFAULT_WORLD_ID = "default"
MAX_TEXT = 2000

Som = Annotated[int, Field(strict=True, ge=0, le=1_000_000_000_000)]
Id = Annotated[str, Field(min_length=1, max_length=40)]
Month = Annotated[str, Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Quarter = Annotated[str, Field(pattern=r"^\d{4}-Q[1-4]$")]
Share = Annotated[float, Field(ge=0, le=1)]
Rate = Annotated[float, Field(ge=0.005, le=0.03)]
Count = Annotated[int, Field(ge=0)]
Sha256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Text = Annotated[str, Field(max_length=MAX_TEXT)]

DefectType = Literal["DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE"]
ClaimType = Literal["DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE", "OTHER"]
Verdict = Literal["SUPPORTED", "NOT_SUPPORTED", "NEEDS_INFO", "OUT_OF_SCOPE"]
ClearedReason = Literal[
    "ARREARS_COVERED",
    "RETRY_AFTER_FAILURE",
    "ALREADY_REVERSED",
    "EARLY_REPAYMENT_REQUESTED",
    "PAID_AFTER_DUE_DATE",
    "FEE_IN_CONTRACT",
]
Mode = Literal["llm", "rules"]
Lang = Literal["uz_latn", "uz_cyrl", "ru", "mixed"]
LetterLang = Literal["uz_latn", "uz_cyrl", "ru"]
Actor = Literal["officer", "compliance", "jury"]
DecisionAction = Literal["CONFIRM", "DISMISS", "CORRECT"]
WorldStatus = Literal["building", "ready", "failed"]
WorldSize = Literal[5000, 20000]
CardNetwork = Literal["HUMO", "UZCARD"]
DebitStatus = Literal["SUCCESS", "FAILED"]
PaymentChannel = Literal["AUTO_DEBIT", "PAYNET", "CLICK", "BRANCH", "APP"]
ChargeKind = Literal["PENALTY", "FEE"]
ComplaintChannel = Literal["APP", "CALL_CENTER", "BRANCH", "WEB"]
ComplaintSource = Literal["GENERATED", "JURY"]
ComplaintStatus = Literal["NEW", "CHECKED", "CONFIRMED", "DISMISSED", "CORRECTED"]
DraftSource = Literal["template", "llm"]
PlanStatus = Literal["DRAFT", "APPROVED"]
MessageKind = Literal["DEBIT", "DEBIT_FAILED", "REVERSAL", "PAYMENT", "PENALTY", "FEE"]
EventKind = Literal["TAKEN", "RECORDED", "CHARGED"]
EventDebitStatus = Literal["SUCCESS", "FAILED", "REVERSED"]
RowTreatment = Literal["CORRECT", "WRONG", "CHECKED_CORRECT", "TAKEN_EARLY"]

# Columns of GET /api/exports/refunds.csv, in this order.
REFUND_CSV_COLUMNS = (
    "contract_id",
    "customer_id",
    "customer_name",
    "region",
    "installment_n",
    "amount_excess",
    "complained",
)


class Shape(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Errors and health ---------------------------------------------------


class ErrorBody(Shape):
    code: str
    message: str


class ErrorResponse(Shape):
    error: ErrorBody


class Health(Shape):
    db: Literal["ok", "error"]
    llm_mode: Mode
    model_name: str | None


# --- Demo banks ("worlds") -----------------------------------------------


class WorldCreate(Shape):
    seed: int = Field(ge=0, le=2_147_483_647)
    size: WorldSize
    # Which mistakes to plant, and the share of contracts for each. A type that
    # is left out is not planted. Ignored when `surprise` is true.
    defects: dict[DefectType, Rate]
    complaint_rate: Share = 0.15
    traps: int = Field(ge=0, le=200)
    surprise: bool = False


class WorldCreated(Shape):
    world_id: Id


class World(Shape):
    """Never holds the hidden settings of a world."""

    world_id: Id
    status: WorldStatus
    progress: int = Field(ge=0, le=100)
    size: WorldSize
    seed: int
    as_of_date: date


class WorldList(Shape):
    items: list[World]


# --- Bank rows, as shown in evidence -------------------------------------


class ScheduleRow(Shape):
    contract_id: Id
    version: int
    n: int
    due_date: date
    principal_due: Som
    interest_due: Som
    total_due: Som


class DebitRow(Shape):
    id: Id
    contract_id: Id
    card_id: Id
    card: str  # masked label, "HUMO ··4471"
    amount: Som
    created_at: NaiveDatetime
    status: DebitStatus
    batch_run_id: str | None
    retry_of: Id | None
    reversed_by: Id | None


class PaymentRow(Shape):
    id: Id
    contract_id: Id
    amount: Som
    channel: PaymentChannel
    paid_at: NaiveDatetime
    posted_at: NaiveDatetime
    debit_id: Id | None


class ChargeRow(Shape):
    id: Id
    contract_id: Id
    kind: ChargeKind
    code: str
    name: str
    amount: Som
    charged_at: NaiveDatetime
    installment_n: int | None


class ContractClause(Shape):
    clause: str
    text: str


class Evidence(Shape):
    schedule_rows: list[ScheduleRow]
    debits: list[DebitRow]
    payments: list[PaymentRow]
    charges: list[ChargeRow]
    contract_clauses: list[ContractClause]


class TamperRequest(Shape):
    contract_id: Id
    action: Literal["extra_debit"]
    amount: Annotated[Som, Field(gt=0)]
    card_id: Id


class TamperResult(Shape):
    debit: DebitRow
    audit_id: Id


# --- Customers (Sandbox Bank) --------------------------------------------


class Customer(Shape):
    customer_id: Id
    full_name: str
    region: str
    phone_masked: str
    preferred_lang: Lang


class CustomerList(Shape):
    items: list[Customer]
    total: Count


class Card(Shape):
    card_id: Id
    network: CardNetwork
    label: str  # masked, "HUMO ··4471"
    is_primary: bool


class ContractSummary(Shape):
    contract_id: Id
    product_code: str
    product_name: str
    principal: Som
    monthly_payment: Som
    due_day: int = Field(ge=1, le=31)
    start_date: date
    term_months: int


class StatementMessage(Shape):
    """One message the bank sent to the customer. The screen writes the sentence."""

    at: NaiveDatetime
    kind: MessageKind
    contract_id: Id
    card: str | None
    channel: PaymentChannel | None
    charge_name: str | None
    amount: Som


class CustomerStatement(Shape):
    customer: Customer
    cards: list[Card]
    contracts: list[ContractSummary]
    messages: list[StatementMessage]  # oldest first


# --- Complaints ----------------------------------------------------------


class ComplaintCreate(Shape):
    customer_id: Id
    text: str = Field(min_length=1, max_length=MAX_TEXT)


class ComplaintCreated(Shape):
    complaint_id: Id


class Complaint(Shape):
    complaint_id: Id
    customer_id: Id
    customer_name: str
    contract_id: Id | None
    text: str
    lang: Lang
    channel: ComplaintChannel
    created_at: NaiveDatetime
    source: ComplaintSource
    status: ComplaintStatus
    # None until the answer deadline is verified (DECISIONS, legal fact b).
    answer_due: date | None
    verdict: Verdict | None


class ComplaintList(Shape):
    items: list[Complaint]  # the one that must be answered first is on top
    total: Count


# --- The ledger timeline (DESIGN section 6) ------------------------------


class TimelineEvent(Shape):
    kind: EventKind
    at: NaiveDatetime
    day_offset: int  # calendar days from the due date; negative means before it
    amount: Som | None
    card: str | None  # TAKEN
    debit_status: EventDebitStatus | None  # TAKEN
    channel: PaymentChannel | None  # RECORDED
    charge_kind: ChargeKind | None  # CHARGED
    charge_name: str | None  # CHARGED
    wrong: bool  # this event is the mistake; its mark is red
    source_id: Id  # the debit, payment or charge row behind it


class TimelineRow(Shape):
    """One installment. `sentence` comes without its prefix: the screen puts the
    name of the mistake, or "Checked, correct:", in front of it."""

    n: int
    due_date: date
    owed: Som
    events: list[TimelineEvent]
    treatment: RowTreatment
    finding_type: DefectType | None
    finding_id: Id | None
    cleared_reason: ClearedReason | None
    sentence: str | None
    not_owed: Som
    taken_early: Som
    days_early: int | None
    business_days_late: int | None


class OtherCharge(Shape):
    """A charge that belongs to no installment, such as a fee at the start."""

    charge_id: Id
    charged_at: NaiveDatetime
    kind: ChargeKind
    name: str
    amount: Som
    treatment: RowTreatment
    finding_id: Id | None
    cleared_reason: ClearedReason | None
    sentence: str | None
    not_owed: Som


class TimelineTotals(Shape):
    owed: Som
    taken: Som
    not_owed: Som
    taken_early: Som


class ContractTimeline(Shape):
    contract_id: Id
    product_code: str
    product_name: str
    principal: Som
    monthly_payment: Som
    due_day: int = Field(ge=1, le=31)
    start_date: date
    term_months: int
    schedule_version: int
    schedule_changed_on: date | None
    early_repayment_requested_on: date | None
    rows: list[TimelineRow]
    other_charges: list[OtherCharge]
    totals: TimelineTotals


# --- Cases ---------------------------------------------------------------


class Understood(Shape):
    claim_type: ClaimType
    claimed_excess: Som | None
    period: Month | None
    mode: Mode


class Finding(Shape):
    finding_id: Id
    type: DefectType
    contract_id: Id
    installment_n: int | None
    amount_excess: Som  # money to give back; 0 for an early debit
    amount_affected: Som  # money involved
    days_early: int | None
    explanation: str
    legal_basis: str | None  # a verified citation, TO_VERIFY, or None when no law is involved
    evidence: Evidence


class Cleared(Shape):
    type: DefectType
    reason: ClearedReason
    contract_id: Id
    installment_n: int | None
    explanation: str
    evidence: Evidence


class DraftReply(Shape):
    lang: LetterLang
    text: str
    source: DraftSource


class DecisionRequest(Shape):
    action: DecisionAction
    note: Text = ""
    corrected_verdict: Verdict | None = None  # CORRECT only
    corrected_excess: Som | None = None  # CORRECT only


class Decision(Shape):
    case_id: Id
    action: DecisionAction
    note: str
    actor: Actor
    at: NaiveDatetime
    corrected_verdict: Verdict | None
    corrected_excess: Som | None
    audit_id: Id


class CheckedWindow(Shape):
    date_from: date
    date_to: date


class CaseResult(Shape):
    case_id: Id
    complaint: Complaint
    understood: Understood
    verdict: Verdict
    claim_match: bool | None  # None when the verdict is not SUPPORTED
    verdict_reason: str  # the "why" sentence under the verdict stamp
    window: CheckedWindow
    findings: list[Finding]
    cleared: list[Cleared]
    total_excess: Som
    total_affected: Som
    timelines: list[ContractTimeline]
    draft_reply: DraftReply | None
    decision: Decision | None
    audit_id: Id
    elapsed_ms: Count


# --- Scan ("Find others") ------------------------------------------------


class CauseAttribute(Shape):
    name: str
    value: str
    support: Share
    lift: float = Field(ge=0)


class Cause(Shape):
    attributes: list[CauseAttribute]
    sentence: str
    suggested_fix: str | None


class ScanItem(Shape):
    contract_id: Id
    customer_id: Id
    customer_name: str
    region: str
    installment_n: int | None
    amount_excess: Som
    amount_affected: Som
    days_early: int | None
    complained: bool
    complaint_id: Id | None


class ScanResult(Shape):
    finding_type: DefectType
    affected_contracts: Count
    affected_customers: Count
    total_excess: Som
    total_affected: Som
    systemic: bool  # more than one customer is affected
    complained: Count  # customers
    silent: Count  # customers
    avg_days_early: int | None  # early debit only
    cause: Cause | None  # None when there are too few cases to name a cause
    items: list[ScanItem]
    elapsed_ms: Count


# --- Reports -------------------------------------------------------------


class ActionPlanRow(Shape):
    id: Id
    finding_type: DefectType
    deficiency: str
    measures: str
    deadline: date | None  # set by a person, never by FeeGuard
    responsible_unit: str
    responsible_exec: str
    monitoring_deadline: date | None  # set by a person, never by FeeGuard
    status: PlanStatus


class ActionPlan(Shape):
    items: list[ActionPlanRow]
    # Where the column list comes from. TO_VERIFY until legal fact c is checked.
    format_basis: str


class ActionPlanUpdate(Shape):
    """PUT replaces every field a person can edit."""

    deficiency: Text
    measures: Text
    deadline: date | None
    responsible_unit: Text
    responsible_exec: Text
    monitoring_deadline: date | None
    status: PlanStatus


class CountRow(Shape):
    key: str
    count: Count


class RecurringIssue(Shape):
    finding_type: DefectType
    affected_contracts: Count
    affected_customers: Count
    total_excess: Som
    total_affected: Som
    cause_sentence: str | None


class QuarterlyReport(Shape):
    quarter: Quarter
    date_from: date
    date_to: date
    complaints_total: Count
    by_type: list[CountRow]
    by_region: list[CountRow]
    by_channel: list[CountRow]
    by_verdict: list[CountRow]
    recurring: list[RecurringIssue]
    measures: list[ActionPlanRow]


# --- Scoring (Sandbox Bank) ----------------------------------------------


class ScoreRow(Shape):
    """One mistake type. For an early debit the two amounts are money taken early."""

    type: DefectType
    planted: Count
    found: Count
    missed: Count
    false_alarms: Count
    amount_planted: Som
    amount_found: Som
    traps_planted: Count
    traps_flagged: Count


class LanguageScore(Shape):
    mode: Mode
    n: Count
    type_correct: Count
    amount_correct: Count


class Timings(Shape):
    world_build_ms: Count | None
    investigate_ms: Count | None
    scan_ms: Count | None


class Scoreboard(Shape):
    world_id: Id
    seed: int
    size: WorldSize
    per_type: list[ScoreRow]
    language_test: list[LanguageScore]  # empty until task B7 has measured it
    timings: Timings
    elapsed_ms: Count


class AnswerKeyRow(Shape):
    id: Id
    defect_type: DefectType
    contract_id: Id
    installment_n: int | None
    excess_amount: Som
    cause_tag: str
    is_trap: bool


class AnswerKeyCount(Shape):
    defect_type: DefectType
    is_trap: bool
    count: Count
    amount: Som


class Reveal(Shape):
    world_id: Id
    seed: int
    settings: dict[str, Any]  # the hidden settings of the world
    counts: list[AnswerKeyCount]
    items: list[AnswerKeyRow]
    total: Count


# --- Audit log -----------------------------------------------------------


class AuditEntry(Shape):
    id: Id
    at: NaiveDatetime
    actor: Actor
    action: str
    payload: dict[str, Any]
    prev_hash: Sha256
    hash: Sha256


class AuditLog(Shape):
    chain_intact: bool
    broken_at: Id | None  # the first entry whose hash does not fit
    entries: list[AuditEntry]  # newest first
    total: Count
