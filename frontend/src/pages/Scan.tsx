import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import { Mark } from '../components/Marks'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { count, formatNumber, formatShare } from '../format'
import { useLoad } from '../hooks'
import type { CauseAttribute, DefectType, ScanResult } from '../types'
import { MISTAKE } from '../words'

// The Find others screen (DESIGN section 7.3). The numbers sit in sentences, not in boxes.
// The second sentence is the reason the product exists, so it is never cut or hidden.

const TITLE = 'Who else was hit'
const SENTENCE = 'Every customer with the same mistake, including those who never complained.'
const FIRST_ROWS = 50
const FEW_CASES = 20

/** "214 customers …": what happened to them, after the number. */
const WERE_HIT: Record<DefectType, [one: string, many: string]> = {
  DOUBLE_DEBIT: ['customer was charged twice.', 'customers were charged twice.'],
  EARLY_DEBIT: ['customer had a payment taken early.', 'customers had a payment taken early.'],
  LATE_POSTING: [
    'customer was fined for a payment the bank recorded late.',
    'customers were fined for a payment the bank recorded late.',
  ],
  ILLEGAL_FEE: [
    'customer was charged a fee that the contract does not list.',
    'customers were charged a fee that their contracts do not list.',
  ],
}

// The plain words for what the cases share. A name the screen does not know is shown as sent.
const SHARED: Record<string, string> = {
  batch_run: 'came from one batch run',
  cards_count: 'are customers with this many cards',
  channel: 'were paid through one channel',
  product: 'are loans of one product',
  schedule_version: 'are loans whose schedule was changed',
  tariff_version: 'are loans signed under one tariff',
  branch: 'are loans of one branch',
  region: 'are customers of one region',
}

function Big({ children }: { children: string }) {
  return <span className="text-headline leading-none font-semibold tabular-nums">{children}</span>
}

function Headline({ result }: { result: ScanResult }) {
  const early = result.finding_type === 'EARLY_DEBIT'
  if (result.affected_customers === 0) {
    return <p className="font-condensed text-title">No customer has this mistake in the bank&apos;s records now.</p>
  }
  if (!result.systemic) {
    return <p className="font-condensed text-title">Only this customer was hit. No pattern found.</p>
  }
  const [, many] = WERE_HIT[result.finding_type]
  return (
    <div className="font-condensed text-title space-y-1 leading-tight">
      <p>
        <Big>{formatNumber(result.affected_customers)}</Big> {many}
      </p>
      <p>
        <Big>{formatNumber(result.silent)}</Big> of them never complained.
      </p>
      {early ? (
        <p>
          <Big>{formatNumber(result.total_affected)}</Big> soʻm was taken early
          {result.avg_days_early !== null && `, on average ${count(result.avg_days_early, 'day')}`}.
        </p>
      ) : (
        <p className="text-wrong">
          <Big>{formatNumber(result.total_excess)}</Big> soʻm to return.
        </p>
      )}
    </div>
  )
}

function shared(attribute: CauseAttribute): string {
  const words = SHARED[attribute.name] ?? `share the same ${attribute.name.replace(/_/g, ' ')}`
  const times = Math.round(attribute.lift)
  return `${formatShare(attribute.support)} of the cases ${words} (${attribute.value}). That is ${
    times > 1 ? `${times} times more than normal` : 'about as often as normal'
  }.`
}

function Why({ result }: { result: ScanResult }) {
  const { cause } = result
  return (
    <section className="max-w-[70ch]">
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>Why it happened</Label></h2>
      {cause ? (
        <div className="space-y-1">
          {cause.attributes.map((attribute) => (
            <p key={attribute.name + attribute.value}>{shared(attribute)}</p>
          ))}
          <p>{cause.sentence}</p>
          {cause.suggested_fix && (
            <p>
              <strong>Suggested fix:</strong> {cause.suggested_fix}
            </p>
          )}
        </div>
      ) : result.items.length < FEW_CASES ? (
        <p>Too few cases to name a cause.</p>
      ) : (
        <p>
          Not built yet: FeeGuard does not name the cause of a group of cases. Task A8 in the plan builds it.
        </p>
      )}
    </section>
  )
}

function Table({ result }: { result: ScanResult }) {
  const [all, setAll] = useState(false)
  const early = result.finding_type === 'EARLY_DEBIT'
  const rows = all ? result.items : result.items.slice(0, FIRST_ROWS)
  return (
    <section>
      <div className="border-line bg-sheet rounded-sheet overflow-x-auto border">
        <table className="text-table w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="border-ink border-b-2 text-left">
              <th scope="col" className="px-3 py-2"><Label>Loan</Label></th>
              <th scope="col" className="px-3 py-2"><Label>Customer</Label></th>
              <th scope="col" className="px-3 py-2"><Label>Region</Label></th>
              <th scope="col" className="px-3 py-2"><Label>Installment</Label></th>
              <th scope="col" className="px-3 py-2 text-right">
                <Label>{early ? 'Taken early, soʻm' : 'To return, soʻm'}</Label>
              </th>
              {early && <th scope="col" className="px-3 py-2 text-right"><Label>Days early</Label></th>}
              <th scope="col" className="px-3 py-2"><Label>Complained</Label></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr
                key={`${item.contract_id}-${item.installment_n ?? 'fee'}`}
                className={`border-line border-t ${index % 2 ? 'bg-stripe' : ''}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">{item.contract_id}</td>
                <td className="px-3 py-2">
                  {item.customer_name} <span className="text-ink-soft text-small">{item.customer_id}</span>
                </td>
                <td className="px-3 py-2">{item.region}</td>
                <td className="px-3 py-2">{item.installment_n === null ? 'None: a one-time fee' : `No. ${item.installment_n}`}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatNumber(early ? item.amount_affected : item.amount_excess)}
                </td>
                {early && <td className="px-3 py-2 text-right tabular-nums">{item.days_early ?? ''}</td>}
                <td className="px-3 py-2 whitespace-nowrap">
                  {item.complained && item.complaint_id ? (
                    <Link to={`/case/${encodeURIComponent(item.complaint_id)}`} className="text-stamp underline">
                      Yes, complaint {item.complaint_id}
                    </Link>
                  ) : (
                    <span className="font-semibold"><Mark kind="exclamation" /> Never complained</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-ink-soft text-small mt-2">
        {count(rows.length, 'row')} shown of {formatNumber(result.items.length)}. One row is one mistake; a customer
        can have more than one.{' '}
        {!all && result.items.length > FIRST_ROWS && (
          <button type="button" className="text-stamp underline" onClick={() => setAll(true)}>
            Show all {formatNumber(result.items.length)} rows
          </button>
        )}
      </p>
    </section>
  )
}

function Download({ result }: { result: ScanResult }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function download() {
    setBusy(true)
    setError(null)
    try {
      const file = await api.refundsCsv(result.finding_type)
      const address = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = address
      link.download = `refunds-${result.finding_type.toLowerCase()}.csv`
      link.click()
      URL.revokeObjectURL(address)
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4">
        {result.total_excess > 0 ? (
          <Button main disabled={busy} onClick={download}>Download the refund list</Button>
        ) : (
          <p className="max-w-[50ch]">
            There is no refund list for this mistake. The money was owed, only later, so nothing is to return.
          </p>
        )}
        <Link to="/reports" className="text-stamp underline">Write the fix plan</Link>
      </div>
      {error && <Problem error={error} onRetry={download} />}
    </div>
  )
}

function ScanView({ findingId }: { findingId: string }) {
  const { state, reload } = useLoad(() => api.scan(findingId), [findingId])

  if (state.status === 'loading') return <Loading lines={6} words="Checking every loan of the bank…" />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />

  const result = state.data
  return (
    <div className="space-y-6">
      <p className="text-ink-soft text-small -mt-4">
        Mistake: {MISTAKE[result.finding_type]} · found in {(result.elapsed_ms / 1000).toFixed(1)} s ·{' '}
        on {count(result.affected_contracts, 'loan')}
      </p>
      <Headline result={result} />
      <Why result={result} />
      <Download result={result} />
      {result.items.length > 0 && <Table result={result} />}
    </div>
  )
}

export default function Scan() {
  const { findingId } = useParams()
  return (
    <>
      <PageHead title={TITLE} sentence={SENTENCE} />
      {findingId ? (
        <ScanView key={findingId} findingId={findingId} />
      ) : (
        <Empty>
          No mistake is chosen yet. Open a complaint on the{' '}
          <Link to="/" className="text-stamp underline">Complaints</Link> screen. When FeeGuard finds a mistake there,
          choose “Find others like this”.
        </Empty>
      )}
    </>
  )
}
