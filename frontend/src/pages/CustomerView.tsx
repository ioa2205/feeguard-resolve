import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { CustomerPicker } from '../components/CustomerPicker'
import { LiveRun } from '../components/LiveRun'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { formatDateTime, formatSom } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
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
  const { t } = useLang()
  const box = useRef<HTMLOListElement>(null)
  // The newest message is at the bottom, where a phone shows it.
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [statement])

  return (
    <section>
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>{t({ en: 'Messages from the bank, oldest first', uz: 'Bankdan kelgan xabarlar, eskisi birinchi', ru: 'Сообщения банка, сначала старые' })}</Label></h2>
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
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null)
  const { t } = useLang()

  async function send(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.createComplaint({ customer_id: customerId, text: text.trim() })
      setSent({ id: created.complaint_id, text: text.trim() })
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
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>{t({ en: 'Write a complaint', uz: 'Shikoyat yozing', ru: 'Напишите жалобу' })}</Label></h2>
      <form onSubmit={send} className="max-w-[70ch] space-y-2">
        <label htmlFor={field} className="block">
          {t({
            en: 'Write it in your own words, the way a customer would: Uzbek in Latin or Cyrillic letters, Russian, English, or a mix. FeeGuard starts the moment you send it.',
            uz: 'Mijoz kabi oʻz soʻzlaringiz bilan yozing: oʻzbekcha lotin yoki kirill harflarida, ruscha, inglizcha yoki aralash. Yuborishingiz bilan FeeGuard ishga tushadi.',
            ru: 'Напишите своими словами, как клиент: по-узбекски латиницей или кириллицей, по-русски, по-английски или вперемешку. FeeGuard начнёт работу сразу после отправки.',
          })}
        </label>
        <textarea
          id={field}
          rows={5}
          maxLength={MAX_TEXT}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="rounded-field border-ink-soft bg-sheet text-words w-full border px-3 py-2 font-serif"
        />
        <p className="text-ink-soft text-small">{text.length} / {MAX_TEXT}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button main type="submit" disabled={busy || empty}>{busy ? t({ en: 'Sending…', uz: 'Yuborilmoqda…', ru: 'Отправка…' }) : t({ en: 'Send complaint', uz: 'Shikoyatni yuborish', ru: 'Отправить жалобу' })}</Button>
          {empty && !busy && <span className="text-small">{t({ en: 'Write something first.', uz: 'Avval biror narsa yozing.', ru: 'Сначала напишите текст.' })}</span>}
        </div>
      </form>
      {error && <div className="mt-3"><Problem error={error} onRetry={() => send()} /></div>}
      {sent && (
        <div className="mt-4">
          <LiveRun complaintId={sent.id} text={sent.text} />
        </div>
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
  const { t } = useLang()
  const [params, setParams] = useSearchParams()
  const chosen = params.get('customer')

  return (
    <>
      <PageHead
        title={t({ en: 'Write a complaint, watch FeeGuard work', uz: 'Shikoyat yozing, FeeGuard ishini kuzating', ru: 'Напишите жалобу и смотрите, как работает FeeGuard' })}
        sentence={t({
          en: 'Pick any customer, read what the bank sent them, then complain as them. The AI reads it and FeeGuard checks it, finds others and drafts the reply, live.',
          uz: 'Istalgan mijozni tanlang, bank unga nima yuborganini oʻqing va uning nomidan shikoyat yozing. SI uni oʻqiydi, FeeGuard tekshiradi, boshqalarni topadi va javob tayyorlaydi, jonli.',
          ru: 'Выберите любого клиента, прочитайте, что ему прислал банк, и пожалуйтесь от его имени. ИИ прочитает жалобу, а FeeGuard проверит её, найдёт других и подготовит ответ, вживую.',
        })}
      />
      <div key={worldId} className="space-y-6">
        <CustomerPicker chosen={chosen} onPick={(customer) => setParams({ customer: customer.customer_id })} />
        {chosen ? (
          <Phone key={chosen} customerId={chosen} />
        ) : (
          <Empty>{t({ en: 'Find a customer above to see the messages the bank sent them. Every name is invented.', uz: 'Bank yuborgan xabarlarni koʻrish uchun yuqoridan mijozni toping. Barcha ismlar oʻylab topilgan.', ru: 'Найдите клиента выше, чтобы увидеть сообщения банка. Все имена вымышлены.' })}</Empty>
        )}
      </div>
    </>
  )
}
