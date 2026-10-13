// The live story of the landing page (V2_PLAN W2, D-048): one checked complaint of the default
// demo bank and every loan with the same mistake, from `GET /api/landing`, which writes nothing.
// When the API does not answer in time, a copy of the same answer, saved by
// `scripts/landing_snapshot.py`, is shown, and the page says so.

import type { AuditEntry, CaseResult, Cause, LandingStory, TimelineEvent } from '../types'
import type { ChartData, ChartRow } from './chart'
import { minuteOf } from './chart'

export interface StoryRowView extends ChartRow {
  cards: string[]
  excess: number
}

export interface StoryView {
  source: 'live' | 'saved'
  savedAt: string | null
  complaintId: string
  name: string
  /** The customer's own words, untranslated. */
  text: string
  writtenAt: string
  readBy: CaseResult['understood']['mode']
  claimType: string
  period: string | null
  claimedExcess: number | null
  window: { from: string; to: string }
  contract: string
  installment: number
  dueDate: string
  owed: number
  events: TimelineEvent[]
  excess: number
  elapsedMs: number
  letter: { lang: string; text: string } | null
  rows: StoryRowView[]
  /** Minutes between the first debit and the one taken on top of it, when every loan shows the same gap. */
  gap: number | null
  customers: number
  contracts: number
  silent: number
  total: number
  cause: Cause | null
  trail: AuditEntry[]
  chainIntact: boolean
  loans: number
  chart: ChartData
}

const WAIT_MS = 6000

export async function loadStory(): Promise<StoryView> {
  const abort = new AbortController()
  const timer = window.setTimeout(() => abort.abort(), WAIT_MS)
  try {
    const response = await fetch('/api/landing', { headers: { Accept: 'application/json' }, signal: abort.signal })
    if (!response.ok) throw new Error(`landing ${response.status}`)
    return view((await response.json()) as LandingStory, 'live', null)
  } catch {
    const saved = (await import('./story-snapshot.json')).default as unknown as { made: string; story: LandingStory }
    return view(saved.story, 'saved', saved.made)
  } finally {
    window.clearTimeout(timer)
  }
}

function view(story: LandingStory, source: StoryView['source'], savedAt: string | null): StoryView {
  const c = story.case
  const finding = c.findings.find((item) => item.amount_excess > 0) ?? c.findings[0]
  const row = c.timelines.flatMap((timeline) => timeline.rows).find((item) => item.treatment === 'WRONG')
  if (!finding || !row) throw new Error('The landing story has no wrong installment')
  const sameDay = (event: TimelineEvent) => event.at.slice(0, 10) === row.due_date.slice(0, 10)
  const events = row.events.filter((event) => event.kind === 'TAKEN' || (event.kind === 'RECORDED' && sameDay(event)))
  const rows: StoryRowView[] = story.rows.map((item) => ({
    date: item.due_date ?? item.taken[0].slice(0, 10),
    run: item.batch_run_id ?? null,
    m: item.taken.map(minuteOf),
    contract: item.contract_id,
    name: item.customer_name,
    you: item.contract_id === finding.contract_id,
    cards: item.cards,
    excess: item.amount_excess,
  }))
  const gaps = new Set(rows.map((item) => item.m[item.m.length - 1] - item.m[0]))
  const cause = story.incident.cause
  return {
    source,
    savedAt,
    complaintId: c.complaint.complaint_id,
    name: c.complaint.customer_name,
    text: c.complaint.text,
    writtenAt: c.complaint.created_at,
    readBy: c.understood.mode,
    claimType: c.understood.claim_type,
    period: c.understood.period,
    claimedExcess: c.understood.claimed_excess,
    window: { from: c.window.date_from, to: c.window.date_to },
    contract: finding.contract_id,
    installment: row.n,
    dueDate: row.due_date,
    owed: row.owed,
    events,
    excess: c.total_excess,
    elapsedMs: c.elapsed_ms,
    letter: c.draft_reply ? { lang: c.draft_reply.lang, text: c.draft_reply.text } : null,
    rows,
    gap: gaps.size === 1 ? [...gaps][0] : null,
    customers: story.incident.customers,
    contracts: story.incident.contracts,
    silent: story.incident.silent,
    total: story.incident.total_excess,
    cause,
    trail: story.trail,
    chainIntact: story.chain_intact,
    loans: story.loans,
    chart: {
      rows,
      dueDate: row.due_date,
      owed: row.owed,
      events: events.map((event) => ({ kind: event.kind, at: event.at, amount: event.amount, card: event.card })),
      lift: cause?.attributes[0]?.lift ?? 0,
    },
  }
}
