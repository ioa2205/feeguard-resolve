// The only place that talks to the backend. Every path of PLAN Part 10 is here.

import { mocks } from './mocks'
import { DEFAULT_WORLD_ID } from './types'
import type {
  ActionPlan,
  ActionPlanRow,
  ActionPlanUpdate,
  Actor,
  AuditLog,
  CaseResult,
  ComplaintCreate,
  ComplaintCreated,
  ComplaintList,
  ComplaintStatus,
  CustomerList,
  CustomerStatement,
  Decision,
  DecisionRequest,
  DefectType,
  DraftReply,
  ErrorResponse,
  Health,
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
} from './types'

/** True when the screens show sample data and not the engine's result. Say so on screen. */
export const usingSampleData =
  import.meta.env.VITE_USE_MOCKS === '1' || import.meta.env.MODE === 'mocks'

let worldId = DEFAULT_WORLD_ID
let actor: Actor = 'officer'

export function setWorld(id: string): void {
  worldId = id
}

export function setActor(next: Actor): void {
  actor = next
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers: {
        'X-World-Id': worldId,
        'X-Actor': actor,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'NO_ANSWER', 'The server did not answer. Check the connection and try again.')
  }
  if (!response.ok) {
    const error = await response
      .json()
      .then((data: ErrorResponse) => data.error)
      .catch(() => null)
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      error?.message ?? `The server answered with code ${response.status}.`,
    )
  }
  return response
}

async function call<T>(method: string, path: string, sample: T, body?: unknown): Promise<T> {
  if (usingSampleData) return structuredClone(sample)
  return (await send(method, path, body)).json() as Promise<T>
}

const id = encodeURIComponent

function sampleCase(caseId: string): CaseResult {
  return caseId === mocks.caseNotSupported.case_id ? mocks.caseNotSupported : mocks.caseSupported
}

export const api = {
  health: () => call<Health>('GET', '/api/health', mocks.health),

  // Sandbox Bank
  createWorld: (body: WorldCreate) =>
    call<WorldCreated>('POST', '/api/worlds', mocks.worldCreated, body),
  worlds: () => call<WorldList>('GET', '/api/worlds', mocks.worlds),
  world: (world: string) => call<World>('GET', `/api/worlds/${id(world)}`, mocks.world),
  tamper: (world: string, body: TamperRequest) =>
    call<TamperResult>('POST', `/api/worlds/${id(world)}/tamper`, mocks.tamperResult, body),
  customers: (search = '') =>
    call<CustomerList>('GET', `/api/customers?search=${id(search)}`, mocks.customers),
  statement: (customerId: string) =>
    call<CustomerStatement>('GET', `/api/customers/${id(customerId)}/statement`, mocks.statement),
  createComplaint: (body: ComplaintCreate) =>
    call<ComplaintCreated>('POST', '/api/complaints', mocks.complaintCreated, body),
  scoreboard: (world: string) => call<Scoreboard>('GET', `/api/eval/${id(world)}`, mocks.scoreboard),
  reveal: (world: string) => call<Reveal>('GET', `/api/eval/${id(world)}/reveal`, mocks.reveal),

  // FeeGuard
  complaints: (status?: ComplaintStatus) =>
    call<ComplaintList>('GET', `/api/complaints${status ? `?status=${status}` : ''}`, mocks.complaints),
  investigate: (complaintId: string) =>
    call<CaseResult>('POST', `/api/cases/${id(complaintId)}/investigate`, sampleCase(complaintId)),
  getCase: (caseId: string) => call<CaseResult>('GET', `/api/cases/${id(caseId)}`, sampleCase(caseId)),
  decide: (caseId: string, body: DecisionRequest) =>
    call<Decision>('POST', `/api/cases/${id(caseId)}/decision`, mocks.decision, body),
  improveDraft: (caseId: string) =>
    call<DraftReply>('POST', `/api/cases/${id(caseId)}/improve-draft`, mocks.draftReply),
  scan: (findingId: string) =>
    call<ScanResult>('POST', `/api/findings/${id(findingId)}/scan`, mocks.scan),
  actionPlan: () => call<ActionPlan>('GET', '/api/reports/action-plan', mocks.actionPlan),
  updateActionPlan: (planId: string, body: ActionPlanUpdate) =>
    call<ActionPlanRow>('PUT', `/api/reports/action-plan/${id(planId)}`, mocks.actionPlan.items[0], body),
  quarterly: () => call<QuarterlyReport>('GET', '/api/reports/quarterly', mocks.quarterly),
  audit: () => call<AuditLog>('GET', '/api/audit', mocks.audit),

  /** A file, not JSON. A plain link cannot carry the demo bank header, so it is fetched. */
  refundsCsv: async (findingType: DefectType): Promise<Blob> => {
    if (usingSampleData) {
      const rows = mocks.scan.items.map((item) =>
        [
          item.contract_id,
          item.customer_id,
          item.customer_name,
          item.region,
          item.installment_n ?? '',
          item.amount_excess,
          item.complained,
        ].join(','),
      )
      const head = 'contract_id,customer_id,customer_name,region,installment_n,amount_excess,complained'
      return new Blob([[head, ...rows].join('\n')], { type: 'text/csv' })
    }
    return (await send('GET', `/api/exports/refunds.csv?finding_type=${findingType}`)).blob()
  },
}
