import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { CustomerPicker } from '../components/CustomerPicker'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { formatDateTime, formatSom } from '../format'
import { useLoad } from '../hooks'
import { useSession } from '../session'
import type { CustomerStatement, StatementMessage } from '../types'
import { MAX_TEXT } from '../types'
import { PAID_BY } from '../words'

// A customer's phone (DESIGN section 7.4): the bank messages one customer received,
// oldest first, as plain lines. Below them a text box and "Send complaint". No drawing
// of a phone. This is the Sandbox Bank: it stores the complaint, FeeGuard only reads it.

function line(message: StatementMessage): string {
  const amount = formatSom(message.amount)
  switch (message.kind) {
    case 'DEBIT':
      return `Taken from card ${message.card ?? ''}: ${amount}.`
    case 'DEBIT_FAILED':
      return `A debit of ${amount} from card ${message.card ?? ''} failed. Nothing was taken.`
    case 'REVERSAL':
      return `Returned to card ${message.card ?? ''}: ${amount}.`
    case 'PAYMENT':
      return `Payment received through ${message.channel ? PAID_BY[message.channel] : 'another channel'}: ${amount}.`
    case 'PENALTY':
      return `Penalty charged: ${message.charge_name ?? 'penalty'}, ${amount}.`
    case 'FEE':
      return `Fee charged: ${message.charge_name ?? 'fee'}, ${amount}.`
  }
}

function Messages({ statement }: { statement: CustomerStatement }) {
  const box = useRef<HTMLOListElement>(null)
  // The newest message is at the bottom, where a phone shows it.
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [statement])

  return (
    <section>
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>Messages from the bank, oldest first</Label></h2>
      {statement.messages.length === 0 ? (
        <p>The bank has sent this customer no message yet.</p>
      ) : (
        <ol ref={box} tabIndex={0} aria-label="Messages from the bank"
          className="border-line bg-sheet rounded-sheet max-h-[28rem] overflow-y-auto border">
          {statement.messages.map((message, index) => (
            <li key={index} className={`border-line border-t px-3 py-2 first:border-t-0 ${index % 2 ? 'bg-stripe' : ''}`}>
              <span className="text-ink-soft text-small mr-2 whitespace-nowrap">{formatDateTime(message.at)}</span>
              {line(message)}{' '}
              <span className="text-ink-soft text-small whitespace-nowrap">Loan {message.contract_id}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Write({ customerId }: { customerId: string }) {
  const field = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function send(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.createComplaint({ customer_id: customerId, text: text.trim() })
      setSent(created.complaint_id)
      setText('')
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  const empty = text.trim().length === 0
  return (
    <section>
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>Write a complaint</Label></h2>
      <form onSubmit={send} className="max-w-[70ch] space-y-2">
        <label htmlFor={field} className="block">
          Write it in your own words, the way a customer would: Uzbek in Latin or Cyrillic letters, Russian, or a mix.
        </label>
        <textarea
          id={field}
          rows={5}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="rounded-field border-ink-soft bg-sheet text-words w-full border px-3 py-2 font-serif"
        />
        <p className="text-ink-soft text-small">{text.length} of {MAX_TEXT} characters.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button main type="submit" disabled={busy || empty}>{busy ? 'Sending…' : 'Send complaint'}</Button>
          {empty && !busy && <span className="text-small">Write something first.</span>}
        </div>
      </form>
      {error && <div className="mt-3"><Problem error={error} onRetry={() => send()} /></div>}
      {sent && (
        <p role="status" className="border-stamp rounded-sheet mt-3 max-w-[70ch] border-2 p-3">
          The bank registered complaint <strong>{sent}</strong>. FeeGuard can see it now.{' '}
          <Link to={`/case/${encodeURIComponent(sent)}`} className="text-stamp font-semibold underline">
            Check it in FeeGuard
          </Link>
        </p>
      )}
    </section>
  )
}

function Phone({ customerId }: { customerId: string }) {
  const { state, reload } = useLoad(() => api.statement(customerId), [customerId])
  if (state.status === 'loading') return <Loading lines={6} />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const { customer, cards, contracts } = state.data
  return (
    <div className="space-y-6">
      <section className="max-w-[90ch] space-y-1">
        <h2 className="font-condensed text-stamp-text font-semibold">{customer.full_name}</h2>
        <p className="text-ink-soft text-small">
          Customer {customer.customer_id} · {customer.region} · phone {customer.phone_masked}
        </p>
        <p>
          <strong>Cards:</strong>{' '}
          {cards.map((card) => `${card.label}${card.is_primary ? ' (main)' : ''}`).join(', ') || 'none'}
        </p>
        <ul>
          {contracts.map((contract) => (
            <li key={contract.contract_id}>
              <strong>Loan {contract.contract_id}:</strong> {contract.product_name}, {formatSom(contract.monthly_payment)} a
              month, due on day {contract.due_day} of each month.
            </li>
          ))}
        </ul>
      </section>
      <Messages statement={state.data} />
      <Write customerId={customer.customer_id} />
    </div>
  )
}

export default function CustomerView() {
  const { worldId } = useSession()
  const [params, setParams] = useSearchParams()
  const chosen = params.get('customer')

  return (
    <>
      <PageHead
        title="A customer’s phone"
        sentence="What one customer sees from the bank, and a place to write a complaint in your own words."
      />
      <div key={worldId} className="space-y-6">
        <CustomerPicker chosen={chosen} onPick={(customer) => setParams({ customer: customer.customer_id })} />
        {chosen ? (
          <Phone key={chosen} customerId={chosen} />
        ) : (
          <Empty>Find a customer above to see the messages the bank sent them. Every name is invented.</Empty>
        )}
      </div>
    </>
  )
}
