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
MessageKind = Literal["DEBIT", "DEBIT_FAILED", "REVERSAL", "PAYMENT", "PENALTY", "FEE", "NOTICE"]
# How a check of the bank was started, and how much it read (DECISIONS D-039).
CheckTrigger = Literal["START", "FIRST_USE", "DAILY", "AFTER_CHANGE", "BY_HAND"]
CheckScope = Literal["ALL", "CHANGED"]
IncidentStatus = Literal["OPEN", "PROPOSED", "APPROVED", "NOTIFIED"]
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


class Words(Shape):
    """One sentence FeeGuard wrote, in the three languages of the screens (D-041).
    The plain field next to it holds the English one."""

    en: str
    uz: str
    ru: str


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


class PresetSource(Shape):
    name: str
    published: date
    url: str


class Preset(Shape):
    """A mistake pattern from public news, rebuilt as a demo bank with fixed settings (task P1).
    It names the pattern, never the bank in the news."""

    preset_id: Id
    world_id: Id  # the demo bank that one click builds or opens
    title: str
    what_happened: str
    mistake: DefectType
    seed: int
    size: WorldSize
    sources: list[PresetSource]


class PresetList(Shape):
    items: list[Preset]


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
    """One message the bank sent to the customer. The screen writes the sentence,
    except for a NOTICE: FeeGuard wrote it in the customer's language (D-040)."""

    at: NaiveDatetime
    kind: MessageKind
    contract_id: Id
    card: str | None
    channel: PaymentChannel | None
    charge_name: str | None
    amount: Som
    finding_type: DefectType | None = None  # NOTICE only
    text: str | None = None  # NOTICE only
    text_lang: LetterLang | None = None  # NOTICE only


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
    # What FeeGuard's check found to return, in soʻm; None until the complaint is checked.
    # A person's correction is not in it: the case holds that.
    to_return: Som | None = None


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
    sentence_t: Words | None = None
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
    sentence_t: Words | None = None
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
    explanation_t: Words | None = None
    legal_basis: str | None  # a verified citation, TO_VERIFY, or None when no law is involved
    evidence: Evidence


class Cleared(Shape):
    type: DefectType
    reason: ClearedReason
    contract_id: Id
    installment_n: int | None
    explanation: str
    explanation_t: Words | None = None
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
    verdict_reason_t: Words | None = None
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
    # The incident each mistake type of this case belongs to (D-040). Empty when the
    # mistake is isolated, or while the first check of the bank is still running.
    incidents: list["IncidentLink"] = []


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
    sentence_t: Words | None = None
    suggested_fix_t: Words | None = None


class ScanDebit(Shape):
    """One debit behind a finding, for the timeline of every affected loan (D-045)."""

    at: NaiveDatetime
    card: str  # masked label, "HUMO ··4471"
    amount: Som
    status: DebitStatus
    returned: bool
    batch_run_id: str | None = None  # the billing run that took it


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
    due_date: date | None = None  # the installment's due date (D-045)
    debits: list[ScanDebit] = Field(default_factory=list)  # oldest first (D-045)


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


# --- Checks of the whole bank and incidents (D-039, D-040) ---------------


class CheckRun(Shape):
    """One check of the bank: the full pass, or only the loans that changed since the last one."""

    run_id: Id
    at: NaiveDatetime
    trigger: CheckTrigger
    scope: CheckScope
    loans_read: Count
    loans_total: Count
    new_findings: Count
    gone_findings: Count
    elapsed_ms: Count
    incidents_opened: list[Id]
    incidents_grown: list[Id]


class CheckRunList(Shape):
    items: list[CheckRun]  # newest first
    daily_at: str | None  # "02:30" Tashkent time; None when the daily check is off
    total: Count


class Incident(Shape):
    """One mistake that hit two or more customers: found once by a check, decided once,
    and every affected customer told, also those who never complained."""

    incident_id: Id
    finding_type: DefectType
    status: IncidentStatus
    opened_at: NaiveDatetime
    opened_by_run: Id
    opened_by: CheckTrigger
    customers: Count
    contracts: Count
    complained: Count  # customers
    silent: Count  # customers
    total_excess: Som
    total_affected: Som
    cause: Cause | None
    complaints_checked: Count  # checked complaints that found this mistake
    proposed_by: Actor | None
    proposed_at: NaiveDatetime | None
    approved_by: Actor | None
    approved_at: NaiveDatetime | None
    approved_customers: Count
    notified_customers: Count
    waiting_customers: Count  # affected, not yet in an approved refund


class IncidentList(Shape):
    items: list[Incident]


class IncidentCustomer(Shape):
    customer_id: Id
    customer_name: str
    region: str
    contracts: list[Id]
    amount_excess: Som
    amount_affected: Som
    complained: bool
    complaint_id: Id | None
    approved: bool
    notified: bool


class IncidentDetail(Shape):
    incident: Incident
    customers: list[IncidentCustomer]


class IncidentLink(Shape):
    """What a case shows about the incident its mistake belongs to."""

    incident_id: Id
    finding_type: DefectType
    status: IncidentStatus
    known_before: bool  # the incident was open before this complaint was checked
    opened_at: NaiveDatetime
    opened_by: CheckTrigger
    customers: Count
    silent: Count
    total_excess: Som
    cause_sentence: str | None
    cause_sentence_t: Words | None = None


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
    # A draft only: what FeeGuard wrote, in the three languages. A saved row keeps the person's words.
    deficiency_t: Words | None = None
    measures_t: Words | None = None
    responsible_unit_t: Words | None = None


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
    cause_sentence_t: Words | None = None


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


class StoryRow(Shape):
    """One loan of the landing page's strip: the debits kept from one installment, oldest first."""

    contract_id: Id
    customer_name: str
    complained: bool
    due_date: date | None
    amount_excess: Som
    taken: list[NaiveDatetime]
    cards: list[str]  # masked labels, "HUMO ··4471", one per debit
    batch_run_id: str | None = None  # the billing run that took the first one


class LandingStory(Shape):
    """The one case the landing page tells (V2_PLAN W2), on the default demo bank, and everyone
    else the same mistake hit. Reading it writes nothing, not even to the audit log (D-048)."""

    case: CaseResult
    rows: list[StoryRow]
    incident: Incident
    trail: list[AuditEntry]  # the log from the moment the complaint was received, oldest first
    chain_intact: bool
    loans: Count  # loans in the demo bank


class AuditLog(Shape):
    chain_intact: bool
    broken_at: Id | None  # the first entry whose hash does not fit
    entries: list[AuditEntry]  # newest first
    total: Count


CaseResult.model_rebuild()
