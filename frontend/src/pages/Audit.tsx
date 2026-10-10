import { useState } from 'react'

import { api } from '../api'
import { Mark } from '../components/Marks'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { count, formatDateTime, formatSom } from '../format'
import { useLoad } from '../hooks'
import { useSession } from '../session'
import type { AuditEntry, AuditLog, DefectType, Verdict } from '../types'
import { ACTING_AS, MISTAKE, VERDICT } from '../words'

// The Audit log (DESIGN section 7.4): a register table of time, who, what. Above it a
// stamp: "Chain intact", or in ink with an exclamation mark, "Chain broken at entry N".

const PAGE = 100

const WHAT: Record<string, string> = {
  COMPLAINT_RECEIVED: 'Complaint received',
  COMPLAINT_CHECKED: 'Complaint checked',
  VERDICT_CONFIRMED: 'Verdict confirmed',
  VERDICT_DISMISSED: 'Verdict dismissed',
  VERDICT_CORRECTED: 'Verdict corrected',
  OTHERS_SEARCHED: 'Others searched',
  REFUND_LIST_DOWNLOADED: 'Refund list downloaded',
  PLAN_ROW_SAVED: 'Fix plan row saved',
  LETTER_REWORDING_ASKED: 'Letter rewording asked',
  DEMO_BANK_BUILT: 'Demo bank built',
  DEBIT_ADDED_BY_HAND: 'Debit added by hand',
  ANSWER_KEY_SHOWN: 'Answer key shown',
}

const text = (value: unknown) => String(value ?? '')
const money = (value: unknown) => (typeof value === 'number' ? formatSom(value) : text(value))
const verdict = (value: unknown) => VERDICT[value as Verdict] ?? text(value)
const mistake = (value: unknown) => MISTAKE[value as DefectType] ?? text(value)

/** The entry's facts in a short sentence. An action the screen does not know shows its fields. */
function details(entry: AuditEntry): string {
  const p = entry.payload
  switch (entry.action) {
    case 'COMPLAINT_RECEIVED':
      return `Complaint ${text(p.complaint_id)} from customer ${text(p.customer_id)}.`
    case 'COMPLAINT_CHECKED':
      return `Complaint ${text(p.complaint_id)}: ${verdict(p.verdict).toLowerCase()}, to return ${money(p.to_return)}.`
    case 'VERDICT_CONFIRMED':
    case 'VERDICT_DISMISSED':
    case 'VERDICT_CORRECTED':
      return `Complaint ${text(p.case_id)}, verdict ${verdict(p.verdict).toLowerCase()}${
        p.corrected_verdict ? `, corrected to ${verdict(p.corrected_verdict).toLowerCase()}` : ''
      }${p.note ? `. Note: ${text(p.note)}` : ''}.`
    case 'OTHERS_SEARCHED':
      return `${mistake(p.finding_type)}: ${text(p.customers)} customers, ${text(p.never_complained)} never complained, to return ${money(p.to_return)}.`
    case 'REFUND_LIST_DOWNLOADED':
      return `${mistake(p.finding_type)}, to return ${money(p.to_return)}.`
    case 'PLAN_ROW_SAVED':
      return `Row ${text(p.plan_id)}, ${p.status === 'APPROVED' ? 'approved' : 'draft'}.`
    case 'LETTER_REWORDING_ASKED':
      return `Complaint ${text(p.case_id)}: ${p.kept === 'llm' ? 'the reworded letter is used' : 'the standard letter stays'}.`
    case 'DEMO_BANK_BUILT':
      return `Seed ${text(p.seed)}, ${text(p.size)} loans${p.surprise ? ', mistakes chosen by surprise' : ''}.`
    case 'DEBIT_ADDED_BY_HAND':
      return `${money(p.amount)} on loan ${text(p.contract_id)}, card ${text(p.card_id)}.`
    case 'ANSWER_KEY_SHOWN':
      return `${text(p.rows)} rows of the answer key.`
    default:
      return Object.entries(p).map(([key, value]) => `${key}: ${text(value)}`).join(', ')
  }
}

function ChainStamp({ log }: { log: AuditLog }) {
  if (log.chain_intact) {
    return (
      <p className="border-stamp text-stamp rounded-sheet font-condensed text-stamp-text inline-flex items-center gap-2 border-4 border-double px-4 py-2 font-bold tracking-[0.08em] uppercase">
        <Mark kind="tick" /> Chain intact
      </p>
    )
  }
  return (
    <p className="border-ink rounded-sheet font-condensed text-stamp-text inline-flex items-center gap-2 border-2 px-4 py-2 font-bold tracking-[0.08em] uppercase">
      <Mark kind="exclamation" /> Chain broken at entry {log.broken_at}
    </p>
  )
}

export default function Audit() {
  const { worldId } = useSession()
  const { state, reload } = useLoad(() => api.audit(PAGE, 0), [worldId])
  const [more, setMore] = useState<AuditEntry[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<Error | null>(null)

  async function showMore(shown: number) {
    setLoadingMore(true)
    setMoreError(null)
    try {
      const next = await api.audit(PAGE, shown)
      setMore((entries) => [...entries, ...next.entries])
    } catch (error) {
      setMoreError(error as Error)
    } finally {
      setLoadingMore(false)
    }
  }

  function checkAgain() {
    setMore([])
    reload()
  }

  return (
    <>
      <PageHead title="Audit log" sentence="Every action in FeeGuard, in order. A changed entry breaks the chain." />
      {state.status === 'loading' && <Loading lines={6} />}
      {state.status === 'error' && <Problem error={state.error} onRetry={reload} />}
      {state.status === 'ready' && (() => {
        const log = state.data
        const entries = [...log.entries, ...more]
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <ChainStamp log={log} />
              <Button main onClick={checkAgain}>Check the chain again</Button>
            </div>
            <p className="max-w-[70ch]">
              Each entry holds a fingerprint (SHA-256) of the entry before it, so changing or removing one breaks
              every fingerprint after it. The chain shows a change; it does not prevent one.
              {!log.chain_intact && ' The entries from the broken one on can no longer be trusted.'}
            </p>
            {entries.length === 0 ? (
              <Empty>Nothing has been done on this demo bank yet. Check a complaint, and it appears here.</Empty>
            ) : (
              <>
                <div className="border-line bg-sheet rounded-sheet overflow-x-auto border">
                  <table className="text-table w-full min-w-[860px] border-collapse">
                    <thead>
                      <tr className="border-ink border-b-2 text-left">
                        <th scope="col" className="px-3 py-2"><Label>Time</Label></th>
                        <th scope="col" className="px-3 py-2"><Label>Who</Label></th>
                        <th scope="col" className="px-3 py-2"><Label>What</Label></th>
                        <th scope="col" className="px-3 py-2"><Label>Details</Label></th>
                        <th scope="col" className="px-3 py-2"><Label>Entry</Label></th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => {
                        const broken = log.broken_at === entry.id
                        return (
                          <tr key={entry.id} className={`border-line border-t align-top ${index % 2 ? 'bg-stripe' : ''}`}>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(entry.at)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{ACTING_AS[entry.actor] ?? entry.actor}</td>
                            <td className="px-3 py-2">{WHAT[entry.action] ?? entry.action}</td>
                            <td className="px-3 py-2">{details(entry)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {broken && <strong><Mark kind="exclamation" /> Broken here · </strong>}
                              {entry.id}{' '}
                              <span className="text-ink-soft text-small" title={entry.hash}>
                                {entry.hash.slice(0, 10)}…
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-ink-soft text-small">
                  {count(entries.length, 'entry', 'entries')} shown of {log.total}, the newest first.{' '}
                  {entries.length < log.total && (
                    <button type="button" className="text-stamp underline" disabled={loadingMore} onClick={() => showMore(entries.length)}>
                      {loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, log.total - entries.length)} older entries`}
                    </button>
                  )}
                </p>
                {moreError && <Problem error={moreError} onRetry={() => showMore(entries.length)} />}
              </>
            )}
          </div>
        )
      })()}
    </>
  )
}
