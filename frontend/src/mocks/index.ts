// Sample data for running the screens without the backend (`npm run dev:mocks`).
//
// These numbers are invented. A screen that shows them must say "Sample data"
// (DESIGN section 10), and none of them may reach EVAL.md or a slide.
//
// `python scripts/check_contract.py` (repository root) checks every file here
// against the backend's shapes. Add a new mock to its list too.

import type {
  ActionPlan,
  ActionPlanUpdate,
  AuditLog,
  CaseResult,
  CheckRun,
  CheckRunList,
  ComplaintCreate,
  ComplaintCreated,
  ComplaintList,
  CustomerList,
  CustomerStatement,
  Decision,
  DecisionRequest,
  DraftReply,
  ErrorResponse,
  Health,
  IncidentDetail,
  IncidentList,
  PresetList,
  QuarterlyReport,
  Reveal,
  ScanResult,
  Scoreboard,
  TamperRequest,
  TamperResult,
  World,
  WorldCreate,
  WorldCreated,
  WorldList,
} from '../types'

import actionPlan from './action-plan.json'
import audit from './audit.json'
import caseNotSupported from './case-not-supported.json'
import caseSupported from './case-supported.json'
import checkRun from './check-run.json'
import checks from './checks.json'
import complaintCreated from './complaint-created.json'
import complaints from './complaints.json'
import customers from './customers.json'
import decision from './decision.json'
import draftReply from './draft-reply.json'
import error from './error.json'
import health from './health.json'
import incidentDetail from './incident-detail.json'
import incidents from './incidents.json'
import presets from './presets.json'
import quarterly from './quarterly.json'
import reqActionPlanUpdate from './req-action-plan-update.json'
import reqComplaintCreate from './req-complaint-create.json'
import reqDecision from './req-decision.json'
import reqTamper from './req-tamper.json'
import reqWorldCreate from './req-world-create.json'
import reveal from './reveal.json'
import scan from './scan.json'
import scoreboard from './scoreboard.json'
import statement from './statement.json'
import tamperResult from './tamper-result.json'
import world from './world.json'
import worldCreated from './world-created.json'
import worlds from './worlds.json'

// An imported JSON file loses its literal types: "SUPPORTED" becomes `string`.
// So each mock is checked against a loosened copy of its type. That still
// catches a missing field, a wrong name and a number where text belongs.
type Loose<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer Item)[]
        ? Loose<Item>[]
        : T extends object
          ? { [Key in keyof T]: Loose<T[Key]> }
          : T

function typed<T>(value: Loose<T>): T {
  return value as unknown as T
}

export const mocks = {
  actionPlan: typed<ActionPlan>(actionPlan),
  audit: typed<AuditLog>(audit),
  caseNotSupported: typed<CaseResult>(caseNotSupported),
  caseSupported: typed<CaseResult>(caseSupported),
  checkRun: typed<CheckRun>(checkRun),
  checks: typed<CheckRunList>(checks),
  complaintCreated: typed<ComplaintCreated>(complaintCreated),
  complaints: typed<ComplaintList>(complaints),
  customers: typed<CustomerList>(customers),
  decision: typed<Decision>(decision),
  draftReply: typed<DraftReply>(draftReply),
  error: typed<ErrorResponse>(error),
  health: typed<Health>(health),
  incidentDetail: typed<IncidentDetail>(incidentDetail),
  incidents: typed<IncidentList>(incidents),
  presets: typed<PresetList>(presets),
  quarterly: typed<QuarterlyReport>(quarterly),
  reqActionPlanUpdate: typed<ActionPlanUpdate>(reqActionPlanUpdate),
  reqComplaintCreate: typed<ComplaintCreate>(reqComplaintCreate),
  reqDecision: typed<DecisionRequest>(reqDecision),
  reqTamper: typed<TamperRequest>(reqTamper),
  reqWorldCreate: typed<WorldCreate>(reqWorldCreate),
  reveal: typed<Reveal>(reveal),
  scan: typed<ScanResult>(scan),
  scoreboard: typed<Scoreboard>(scoreboard),
  statement: typed<CustomerStatement>(statement),
  tamperResult: typed<TamperResult>(tamperResult),
  world: typed<World>(world),
  worldCreated: typed<WorldCreated>(worldCreated),
  worlds: typed<WorldList>(worlds),
}
