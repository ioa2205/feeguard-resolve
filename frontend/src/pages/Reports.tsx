import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { formatDate, formatNumber, formatSom } from '../format'
import { useLoad } from '../hooks'
import { tx, useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { ActionPlanRow, ActionPlanUpdate, ClaimType, ComplaintChannel, CountRow, QuarterlyReport, Verdict } from '../types'
import { CLAIM, MISTAKE, RECEIVED_BY, VERDICT, verified } from '../words'

// The Fix plan and report screen (DESIGN sections 7.4 and 13). It looks like the
// document itself: the plan of measures is on screen as it will be printed, and its
// cells are edited in place. Deadlines and names are set by a person, never by FeeGuard.

const FIELD = 'rounded-field border-ink-soft bg-sheet w-full border px-2 py-1 print:hidden'

function editable(row: ActionPlanRow): ActionPlanUpdate {
  const { id: _id, finding_type: _type, ...rest } = row
  return rest
}

function PlanRow({ number, row, onSaved }: { number: number; row: ActionPlanRow; onSaved: (row: ActionPlanRow) => void }) {
  const [draft, setDraft] = useState<ActionPlanUpdate>(editable(row))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  useEffect(() => setDraft(editable(row)), [row])
  const changed = JSON.stringify(draft) !== JSON.stringify(editable(row))

  function set<K extends keyof ActionPlanUpdate>(key: K, value: ActionPlanUpdate[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save(status = draft.status) {
    setSaving(true)
    setError(null)
    try {
      onSaved(await api.updateActionPlan(row.id, { ...draft, status }))
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setSaving(false)
    }
  }

  const label = (what: string) => `${what}, row ${number}`
  return (
    <tr className="border-line border-t align-top break-inside-avoid">
      <td className="px-2 py-2 tabular-nums">{number}</td>
      <td className="px-2 py-2">
        <span className="text-small block font-semibold">{tx(MISTAKE[row.finding_type])}</span>
        <textarea aria-label={label('Deficiency')} rows={6} className={FIELD} value={draft.deficiency}
          maxLength={2000} onChange={(event) => set('deficiency', event.target.value)} />
        <span className="hidden print:block">{draft.deficiency}</span>
      </td>
      <td className="px-2 py-2">
        <textarea aria-label={label('Measures')} rows={6} className={FIELD} value={draft.measures}
          maxLength={2000} onChange={(event) => set('measures', event.target.value)} />
        <span className="hidden print:block">{draft.measures}</span>
      </td>
      <td className="px-2 py-2">
        <input type="date" aria-label={label('Deadline')} className={FIELD} value={draft.deadline ?? ''}
          onChange={(event) => set('deadline', event.target.value || null)} />
        <span className="hidden print:block">{draft.deadline ? formatDate(draft.deadline) : '—'}</span>
      </td>
      <td className="px-2 py-2">
        <input aria-label={label('Responsible unit')} className={FIELD} value={draft.responsible_unit} maxLength={200}
          onChange={(event) => set('responsible_unit', event.target.value)} />
        <span className="hidden print:block">{draft.responsible_unit || '—'}</span>
      </td>
      <td className="px-2 py-2">
        <input aria-label={label('Responsible person')} className={FIELD} value={draft.responsible_exec} maxLength={200}
          onChange={(event) => set('responsible_exec', event.target.value)} />
        <span className="hidden print:block">{draft.responsible_exec || '—'}</span>
      </td>
      <td className="px-2 py-2">
        <input type="date" aria-label={label('Monitoring deadline')} className={FIELD} value={draft.monitoring_deadline ?? ''}
          onChange={(event) => set('monitoring_deadline', event.target.value || null)} />
        <span className="hidden print:block">{draft.monitoring_deadline ? formatDate(draft.monitoring_deadline) : '—'}</span>
      </td>
      <td className="px-2 py-2">
        <p className={row.status === 'APPROVED' ? 'text-stamp font-semibold' : ''}>
          {row.status === 'APPROVED' ? 'Approved by a person' : 'Draft'}
        </p>
        <div className="mt-2 flex flex-col gap-2 print:hidden">
          {changed && <Button disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save this row'}</Button>}
          {row.status === 'DRAFT' && (
            <Button disabled={saving} onClick={() => save('APPROVED')}>Approve this row</Button>
          )}
          {row.status === 'APPROVED' && (
            <Button disabled={saving} onClick={() => save('DRAFT')}>Back to draft</Button>
          )}
        </div>
        {error && <p role="alert" className="text-small mt-2 font-semibold print:hidden">{error.message}</p>}
      </td>
    </tr>
  )
}

function Plan({ onApproved }: { onApproved: (approved: boolean) => void }) {
  const { state, reload, replace } = useLoad(() => api.actionPlan(), [])
  const items = state.status === 'ready' ? state.data.items : null
  useEffect(() => {
    onApproved(Boolean(items && items.length > 0 && items.every((row) => row.status === 'APPROVED')))
  }, [items, onApproved])
  if (state.status === 'loading') return <Loading lines={4} words="Drafting the plan from the confirmed mistakes…" />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const plan = state.data

  return (
    <section className="space-y-3">
      <h2 className="font-condensed text-stamp-text font-semibold">Plan of measures to remove the deficiencies</h2>
      <p className="text-small max-w-[90ch]">
        Annex 5 of Rule 3030-12. Column list: {tx(verified(plan.format_basis)).toLowerCase()} against the Central Bank&apos;s
        text. A row is drafted when a person confirms a mistake on a complaint; its numbers come from the search over
        the whole bank. Deadlines and the responsible person are left for a person to fill in.
      </p>
      {plan.items.length === 0 ? (
        <Empty>
          No row yet. A row is drafted when a person confirms a mistake. Open a complaint on the{' '}
          <Link to="/" className="text-stamp underline">Complaints</Link> screen and confirm its verdict.
        </Empty>
      ) : (
        <div className="border-line bg-sheet rounded-sheet overflow-x-auto border print:overflow-visible print:border-0">
          <table className="text-table w-full min-w-[1100px] border-collapse print:min-w-0">
            <thead>
              <tr className="border-ink border-b-2 text-left">
                <th scope="col" className="w-10 px-2 py-2"><Label>No.</Label></th>
                <th scope="col" className="px-2 py-2"><Label>Deficiency found</Label></th>
                <th scope="col" className="px-2 py-2"><Label>Measures</Label></th>
                <th scope="col" className="w-36 px-2 py-2"><Label>Deadline</Label></th>
                <th scope="col" className="w-40 px-2 py-2"><Label>Responsible unit</Label></th>
                <th scope="col" className="w-40 px-2 py-2"><Label>Responsible person</Label></th>
                <th scope="col" className="w-36 px-2 py-2"><Label>Monitoring deadline</Label></th>
                <th scope="col" className="w-36 px-2 py-2"><Label>Status</Label></th>
              </tr>
            </thead>
            <tbody>
              {plan.items.map((row, index) => (
                <PlanRow key={row.id} number={index + 1} row={row}
                  onSaved={(saved) => replace({ ...plan, items: plan.items.map((item) => (item.id === saved.id ? saved : item)) })} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const VERDICT_OR_NOT: Record<string, Words> = {
  ...VERDICT,
  NOT_CHECKED: { en: 'Not checked yet', uz: 'Hali tekshirilmagan', ru: 'Ещё не проверена' },
}

function Counts({ title, rows, word }: { title: string; rows: CountRow[]; word: (key: string) => string }) {
  return (
    <div className="break-inside-avoid">
      <h4 className="border-ink mb-1 border-b pb-1"><Label>{title}</Label></h4>
      {rows.length === 0 ? (
        <p>None.</p>
      ) : (
        <table className="text-table w-full border-collapse">
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-line border-t">
                <td className="py-1 pr-2">{word(row.key)}</td>
                <td className="py-1 text-right tabular-nums">{formatNumber(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function quarterName(report: QuarterlyReport): string {
  const [year, quarter] = report.quarter.split('-Q')
  const order = ['first', 'second', 'third', 'fourth'][Number(quarter) - 1]
  return `The ${order} quarter of ${year}, ${formatDate(report.date_from)} to ${formatDate(report.date_to)}`
}

function Quarterly() {
  const { state, reload } = useLoad(() => api.quarterly(), [])
  if (state.status === 'loading') return <Loading lines={5} words="Counting the quarter's complaints…" />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const report = state.data

  return (
    <section className="space-y-4 break-before-page">
      <h2 className="font-condensed text-stamp-text font-semibold">Quarterly analysis of complaints</h2>
      <p className="max-w-[70ch]">
        {quarterName(report)}. <strong>{formatNumber(report.complaints_total)}</strong> complaints about loan payments
        were received. The form of this analysis is {tx(verified(null)).toLowerCase()} against the Central Bank&apos;s text.
      </p>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <Counts title="By kind, as read" rows={report.by_type} word={(key) => tx(CLAIM[key as ClaimType]) ?? key} />
        <Counts title="By verdict" rows={report.by_verdict} word={(key) => tx(VERDICT_OR_NOT[key as Verdict]) ?? key} />
        <Counts title="By region" rows={report.by_region} word={(key) => key} />
        <Counts title="By channel" rows={report.by_channel} word={(key) => tx(RECEIVED_BY[key as ComplaintChannel]) ?? key} />
      </div>
      <p className="text-small max-w-[90ch]">
        A complaint nobody has checked yet is counted by the rules reader&apos;s reading of its text.
      </p>

      <h3><Label>Recurring issues: mistakes that hit more than one customer</Label></h3>
      {report.recurring.length === 0 ? (
        <p>None found in the whole bank.</p>
      ) : (
        <ul className="max-w-[90ch] space-y-3">
          {report.recurring.map((issue) => (
            <li key={issue.finding_type} className="break-inside-avoid">
              <strong>{tx(MISTAKE[issue.finding_type])}:</strong> {formatNumber(issue.affected_customers)} customers on{' '}
              {formatNumber(issue.affected_contracts)} loans,{' '}
              {issue.finding_type === 'EARLY_DEBIT'
                ? `${formatSom(issue.total_affected)} taken early.`
                : `${formatSom(issue.total_excess)} to return.`}
              {issue.cause_sentence && <span className="block">{issue.cause_sentence}</span>}
            </li>
          ))}
        </ul>
      )}

      <h3><Label>Measures</Label></h3>
      <p>
        {report.measures.length === 0
          ? 'No measure yet: the plan above has no row.'
          : `${report.measures.length} ${report.measures.length === 1 ? 'measure is' : 'measures are'} in the plan above, ${
              report.measures.filter((row) => row.status === 'APPROVED').length
            } approved by a person.`}
      </p>
    </section>
  )
}

export default function Reports() {
  useLang() // draw again when the language changes
  const { worldId } = useSession()
  const [approved, setApproved] = useState(false)
  return (
    <div key={worldId} className={`space-y-8 ${approved ? '' : 'print-draft'}`}>
      <PageHead
        title="Fix plan and report"
        sentence="The action plan and the quarterly analysis, in the Central Bank’s format."
      >
        <div className="mt-4 flex flex-wrap items-center gap-4 print:hidden">
          <Button main onClick={() => window.print()}>Print or save as PDF</Button>
          <p className="max-w-[60ch]">Prints on A4 without the menu. Choose “Save as PDF” in the print window for a file.</p>
        </div>
      </PageHead>
      <Plan onApproved={setApproved} />
      <Quarterly />
    </div>
  )
}
