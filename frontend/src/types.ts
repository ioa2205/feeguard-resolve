// API shapes of PLAN Part 10, frozen in task M0.2.
//
// A hand-made mirror of the backend's `schemas.py`, which the backend publishes
// at /api/openapi.json. Change both together and record the change in
// docs/DECISIONS.md.
//
// - Money is whole soʻm (`Som`), never a fraction.
// - A date is "YYYY-MM-DD". A time is "YYYY-MM-DDTHH:MM:SS". Both are Tashkent
//   time with no offset. Show them as sent; never shift them to the viewer's zone.
// - A share (`support`, a rate) is a fraction: 0.93 means 93%.
// - Ids are opaque. Never take one apart.
// - A legal text nobody has verified yet carries the literal `TO_VERIFY`.

export const TO_VERIFY = 'TO VERIFY'
export const DEFAULT_WORLD_ID = 'default'
export const MAX_TEXT = 2000

export type Som = number
export type Day = string
export type Moment = string
export type Month = string // "YYYY-MM"

export type DefectType = 'DOUBLE_DEBIT' | 'EARLY_DEBIT' | 'LATE_POSTING' | 'ILLEGAL_FEE'
export type ClaimType = DefectType | 'OTHER'
export type Verdict = 'SUPPORTED' | 'NOT_SUPPORTED' | 'NEEDS_INFO' | 'OUT_OF_SCOPE'
export type ClearedReason =
  | 'ARREARS_COVERED'
  | 'RETRY_AFTER_FAILURE'
  | 'ALREADY_REVERSED'
  | 'EARLY_REPAYMENT_REQUESTED'
  | 'PAID_AFTER_DUE_DATE'
  | 'FEE_IN_CONTRACT'
export type Mode = 'llm' | 'rules'
export type Lang = 'uz_latn' | 'uz_cyrl' | 'ru' | 'mixed'
export type LetterLang = 'uz_latn' | 'uz_cyrl' | 'ru'
export type Actor = 'officer' | 'compliance' | 'jury'
export type DecisionAction = 'CONFIRM' | 'DISMISS' | 'CORRECT'
export type WorldStatus = 'building' | 'ready' | 'failed'
export type WorldSize = 5000 | 20000
export type CardNetwork = 'HUMO' | 'UZCARD'
export type DebitStatus = 'SUCCESS' | 'FAILED'
export type PaymentChannel = 'AUTO_DEBIT' | 'PAYNET' | 'CLICK' | 'BRANCH' | 'APP'
export type ChargeKind = 'PENALTY' | 'FEE'
export type ComplaintChannel = 'APP' | 'CALL_CENTER' | 'BRANCH' | 'WEB'
export type ComplaintSource = 'GENERATED' | 'JURY'
export type ComplaintStatus = 'NEW' | 'CHECKED' | 'CONFIRMED' | 'DISMISSED' | 'CORRECTED'
export type DraftSource = 'template' | 'llm'
export type PlanStatus = 'DRAFT' | 'APPROVED'
export type MessageKind = 'DEBIT' | 'DEBIT_FAILED' | 'REVERSAL' | 'PAYMENT' | 'PENALTY' | 'FEE'
export type EventKind = 'TAKEN' | 'RECORDED' | 'CHARGED'
export type EventDebitStatus = 'SUCCESS' | 'FAILED' | 'REVERSED'
export type RowTreatment = 'CORRECT' | 'WRONG' | 'CHECKED_CORRECT' | 'TAKEN_EARLY'

// --- Errors and health ---

export interface ErrorResponse {
  error: { code: string; message: string }
}

export interface Health {
  db: 'ok' | 'error'
  llm_mode: Mode
  model_name: string | null
}

// --- Demo banks ("worlds") ---

export interface WorldCreate {
  seed: number
  size: WorldSize
  /** Which mistakes to plant and the share of contracts for each (0.005 to 0.03). */
  defects: Partial<Record<DefectType, number>>
  complaint_rate?: number
  traps: number
  surprise?: boolean
}

export interface WorldCreated {
  world_id: string
}

export interface World {
  world_id: string
  status: WorldStatus
  /** 0 to 100. */
  progress: number
  size: WorldSize
  seed: number
  as_of_date: Day
}

export interface WorldList {
  items: World[]
}

export interface PresetSource {
  name: string
  published: Day
  url: string
}

/** A mistake pattern from public news, rebuilt as a demo bank with fixed settings (task P1).
 * It names the pattern, never the bank in the news. */
export interface Preset {
  preset_id: string
  /** The demo bank that one click builds or opens. */
  world_id: string
  title: string
  what_happened: string
  mistake: DefectType
  seed: number
  size: WorldSize
  sources: PresetSource[]
}

export interface PresetList {
  items: Preset[]
}

// --- Bank rows, as shown in evidence ---

export interface ScheduleRow {
  contract_id: string
  version: number
  n: number
  due_date: Day
  principal_due: Som
  interest_due: Som
  total_due: Som
}

export interface DebitRow {
  id: string
  contract_id: string
  card_id: string
  /** Masked label, "HUMO ··4471". */
  card: string
  amount: Som
  created_at: Moment
  status: DebitStatus
  batch_run_id: string | null
  retry_of: string | null
  reversed_by: string | null
}

export interface PaymentRow {
  id: string
  contract_id: string
  amount: Som
  channel: PaymentChannel
  paid_at: Moment
  posted_at: Moment
  debit_id: string | null
}

export interface ChargeRow {
  id: string
  contract_id: string
  kind: ChargeKind
  code: string
  name: string
  amount: Som
  charged_at: Moment
  installment_n: number | null
}

export interface ContractClause {
  clause: string
  text: string
}

export interface Evidence {
  schedule_rows: ScheduleRow[]
  debits: DebitRow[]
  payments: PaymentRow[]
  charges: ChargeRow[]
  contract_clauses: ContractClause[]
}

export interface TamperRequest {
  contract_id: string
  action: 'extra_debit'
  amount: Som
  card_id: string
}

export interface TamperResult {
  debit: DebitRow
  audit_id: string
}

// --- Customers (Sandbox Bank) ---

export interface Customer {
  customer_id: string
  full_name: string
  region: string
  phone_masked: string
  preferred_lang: Lang
}

export interface CustomerList {
  items: Customer[]
  total: number
}

export interface Card {
  card_id: string
  network: CardNetwork
  /** Masked, "HUMO ··4471". */
  label: string
  is_primary: boolean
}

export interface ContractSummary {
  contract_id: string
  product_code: string
  product_name: string
  principal: Som
  monthly_payment: Som
  due_day: number
  start_date: Day
  term_months: number
}

/** One message the bank sent to the customer. The screen writes the sentence. */
export interface StatementMessage {
  at: Moment
  kind: MessageKind
  contract_id: string
  card: string | null
  channel: PaymentChannel | null
  charge_name: string | null
  amount: Som
}

export interface CustomerStatement {
  customer: Customer
  cards: Card[]
  contracts: ContractSummary[]
  /** Oldest first. */
  messages: StatementMessage[]
}

// --- Complaints ---

export interface ComplaintCreate {
  customer_id: string
  /** 1 to 2,000 characters. */
  text: string
}

export interface ComplaintCreated {
  complaint_id: string
}

export interface Complaint {
  complaint_id: string
  customer_id: string
  customer_name: string
  contract_id: string | null
  text: string
  lang: Lang
  channel: ComplaintChannel
  created_at: Moment
  source: ComplaintSource
  status: ComplaintStatus
  /** null until the answer deadline is verified. Show "To verify". */
  answer_due: Day | null
  verdict: Verdict | null
}

export interface ComplaintList {
  /** The one that must be answered first is on top. */
  items: Complaint[]
  total: number
}

// --- The ledger timeline (DESIGN section 6) ---

export interface TimelineEvent {
  kind: EventKind
  at: Moment
  /** Calendar days from the due date. Negative means before it. */
  day_offset: number
  amount: Som | null
  /** TAKEN only. */
  card: string | null
  /** TAKEN only. */
  debit_status: EventDebitStatus | null
  /** RECORDED only. */
  channel: PaymentChannel | null
  /** CHARGED only. */
  charge_kind: ChargeKind | null
  /** CHARGED only. */
  charge_name: string | null
  /** This event is the mistake. Its mark is red. */
  wrong: boolean
  /** The debit, payment or charge row behind it. */
  source_id: string
}

/**
 * One installment. `sentence` comes without its prefix: the screen puts the name
 * of the mistake, or "Checked, correct:", in front of it.
 */
export interface TimelineRow {
  n: number
  due_date: Day
  owed: Som
  events: TimelineEvent[]
  treatment: RowTreatment
  finding_type: DefectType | null
  finding_id: string | null
  cleared_reason: ClearedReason | null
  sentence: string | null
  not_owed: Som
  taken_early: Som
  days_early: number | null
  business_days_late: number | null
}

/** A charge that belongs to no installment, such as a fee at the start. */
export interface OtherCharge {
  charge_id: string
  charged_at: Moment
  kind: ChargeKind
  name: string
  amount: Som
  treatment: RowTreatment
  finding_id: string | null
  cleared_reason: ClearedReason | null
  sentence: string | null
  not_owed: Som
}

export interface TimelineTotals {
  owed: Som
  taken: Som
  not_owed: Som
  taken_early: Som
}

export interface ContractTimeline {
  contract_id: string
  product_code: string
  product_name: string
  principal: Som
  monthly_payment: Som
  due_day: number
  start_date: Day
  term_months: number
  schedule_version: number
  schedule_changed_on: Day | null
  early_repayment_requested_on: Day | null
  rows: TimelineRow[]
  other_charges: OtherCharge[]
  totals: TimelineTotals
}

// --- Cases ---

export interface Understood {
  claim_type: ClaimType
  claimed_excess: Som | null
  period: Month | null
  mode: Mode
}

export interface Finding {
  finding_id: string
  type: DefectType
  contract_id: string
  installment_n: number | null
  /** Money to give back. 0 for an early debit. */
  amount_excess: Som
  /** Money involved. */
  amount_affected: Som
  days_early: number | null
  explanation: string
  /** A verified citation, `TO_VERIFY`, or null when no law is involved. */
  legal_basis: string | null
  evidence: Evidence
}

export interface Cleared {
  type: DefectType
  reason: ClearedReason
  contract_id: string
  installment_n: number | null
  explanation: string
  evidence: Evidence
}

export interface DraftReply {
  lang: LetterLang
  text: string
  source: DraftSource
}

export interface DecisionRequest {
  action: DecisionAction
  note?: string
  /** CORRECT only. */
  corrected_verdict?: Verdict | null
  /** CORRECT only. */
  corrected_excess?: Som | null
}

export interface Decision {
  case_id: string
  action: DecisionAction
  note: string
  actor: Actor
  at: Moment
  corrected_verdict: Verdict | null
  corrected_excess: Som | null
  audit_id: string
}

export interface CheckedWindow {
  date_from: Day
  date_to: Day
}

export interface CaseResult {
  case_id: string
  complaint: Complaint
  understood: Understood
  verdict: Verdict
  /** null when the verdict is not SUPPORTED. */
  claim_match: boolean | null
  /** The "why" sentence under the verdict stamp. */
  verdict_reason: string
  window: CheckedWindow
  findings: Finding[]
  cleared: Cleared[]
  total_excess: Som
  total_affected: Som
  timelines: ContractTimeline[]
  draft_reply: DraftReply | null
  decision: Decision | null
  audit_id: string
  elapsed_ms: number
}

// --- Scan ("Find others") ---

export interface CauseAttribute {
  name: string
  value: string
  support: number
  lift: number
}

export interface Cause {
  attributes: CauseAttribute[]
  sentence: string
  suggested_fix: string | null
}

export interface ScanItem {
  contract_id: string
  customer_id: string
  customer_name: string
  region: string
  installment_n: number | null
  amount_excess: Som
  amount_affected: Som
  days_early: number | null
  complained: boolean
  complaint_id: string | null
}

export interface ScanResult {
  finding_type: DefectType
  affected_contracts: number
  affected_customers: number
  total_excess: Som
  total_affected: Som
  /** More than one customer is affected. */
  systemic: boolean
  /** Customers. */
  complained: number
  /** Customers. */
  silent: number
  /** Early debit only. */
  avg_days_early: number | null
  /** null when there are too few cases to name a cause. */
  cause: Cause | null
  items: ScanItem[]
  elapsed_ms: number
}

// --- Reports ---

export interface ActionPlanRow {
  id: string
  finding_type: DefectType
  deficiency: string
  measures: string
  /** Set by a person, never by FeeGuard. */
  deadline: Day | null
  responsible_unit: string
  responsible_exec: string
  /** Set by a person, never by FeeGuard. */
  monitoring_deadline: Day | null
  status: PlanStatus
}

export interface ActionPlan {
  items: ActionPlanRow[]
  /** Where the column list comes from. `TO_VERIFY` until it is checked. */
  format_basis: string
}

/** PUT replaces every field a person can edit. */
export type ActionPlanUpdate = Omit<ActionPlanRow, 'id' | 'finding_type'>

export interface CountRow {
  key: string
  count: number
}

export interface RecurringIssue {
  finding_type: DefectType
  affected_contracts: number
  affected_customers: number
  total_excess: Som
  total_affected: Som
  cause_sentence: string | null
}

export interface QuarterlyReport {
  /** "2026-Q3". */
  quarter: string
  date_from: Day
  date_to: Day
  complaints_total: number
  by_type: CountRow[]
  by_region: CountRow[]
  by_channel: CountRow[]
  by_verdict: CountRow[]
  recurring: RecurringIssue[]
  measures: ActionPlanRow[]
}

// --- Scoring (Sandbox Bank) ---

/** One mistake type. For an early debit the two amounts are money taken early. */
export interface ScoreRow {
  type: DefectType
  planted: number
  found: number
  missed: number
  false_alarms: number
  amount_planted: Som
  amount_found: Som
  traps_planted: number
  traps_flagged: number
}

export interface LanguageScore {
  mode: Mode
  n: number
  type_correct: number
  amount_correct: number
}

export interface Timings {
  world_build_ms: number | null
  investigate_ms: number | null
  scan_ms: number | null
}

export interface Scoreboard {
  world_id: string
  seed: number
  size: WorldSize
  per_type: ScoreRow[]
  /** Empty until the language test has been measured. */
  language_test: LanguageScore[]
  timings: Timings
  elapsed_ms: number
}

export interface AnswerKeyRow {
  id: string
  defect_type: DefectType
  contract_id: string
  installment_n: number | null
  excess_amount: Som
  cause_tag: string
  is_trap: boolean
}

export interface AnswerKeyCount {
  defect_type: DefectType
  is_trap: boolean
  count: number
  amount: Som
}

export interface Reveal {
  world_id: string
  seed: number
  /** The hidden settings of the demo bank. */
  settings: Record<string, unknown>
  counts: AnswerKeyCount[]
  items: AnswerKeyRow[]
  total: number
}

// --- Audit log ---

export interface AuditEntry {
  id: string
  at: Moment
  actor: Actor
  action: string
  payload: Record<string, unknown>
  prev_hash: string
  hash: string
}

export interface AuditLog {
  chain_intact: boolean
  /** The first entry whose hash does not fit. */
  broken_at: string | null
  /** Newest first. */
  entries: AuditEntry[]
  total: number
}
