// The customer's phone (V2_PLAN W1.6): the messages the bank sent one customer, as a thread, and
// a box to complain as them. Sending it starts FeeGuard, step by step, beside the phone. This is
// the demo bank's side: it stores the complaint, and FeeGuard only reads it.

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { formatDate, formatTime } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { CustomerStatement, StatementMessage } from '../types'
import { MAX_TEXT } from '../types'
import { LANG_ATTR, MISTAKE, PAID_BY, chargeName, productName } from '../words'
import { LiveRun } from './LiveRun'
import { Picker } from './Picker'
import { Empty, Head, Loading, Problem, Som } from './ui'

function Bubble({ message }: { message: StatementMessage }) {
  const { t } = useLang()
  const amount = <span className="amt"><Som n={message.amount} /></span>
  const card = message.card ?? ''
  const name = chargeName(message.charge_name)
  let words
  switch (message.kind) {
    case 'DEBIT':
      words = <>{t({ en: `Taken from card ${card}:`, uz: `${card} kartadan yechildi:`, ru: `Списано с карты ${card}:` })} {amount}</>
      break
    case 'DEBIT_FAILED':
      words = <>{t({ en: `A debit from card ${card} failed. Nothing was taken:`, uz: `${card} kartadan yechish amalga oshmadi. Hech narsa yechilmadi:`, ru: `Списание с карты ${card} не прошло. Ничего не списано:` })} {amount}</>
      break
    case 'REVERSAL':
      words = <>{t({ en: `Returned to card ${card}:`, uz: `${card} kartaga qaytarildi:`, ru: `Возвращено на карту ${card}:` })} {amount}</>
      break
    case 'PAYMENT':
      words = <>{t({ en: 'Payment received', uz: 'Toʻlov qabul qilindi', ru: 'Платёж получен' })}{message.channel ? ` (${t(PAID_BY[message.channel])})` : ''}: {amount}</>
      break
    case 'PENALTY':
      words = <>{t({ en: 'Penalty charged', uz: 'Jarima undirildi', ru: 'Начислен штраф' })}{name ? ` (${t(name)})` : ''}: {amount}</>
      break
    case 'FEE':
      words = <>{t({ en: 'Fee charged', uz: 'Komissiya undirildi', ru: 'Взята комиссия' })}{name ? ` (${t(name)})` : ''}: {amount}</>
      break
    case 'NOTICE':
      words = <>
        {t({ en: 'A message from the bank, about a mistake FeeGuard found', uz: 'Bankdan xabar, FeeGuard topgan xato haqida', ru: 'Сообщение банка об ошибке, которую нашёл FeeGuard' })}
        {message.finding_type ? ` (${t(MISTAKE[message.finding_type]).toLowerCase()})` : ''}: {amount}
        {message.text && <blockquote lang={message.text_lang ? LANG_ATTR[message.text_lang] : undefined}>{message.text}</blockquote>}
      </>
  }
  return <li className="bubble">{words}<small>{formatTime(message.at)} · {t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} {message.contract_id}</small></li>
}

function Device({ statement, onSent, sent }: { statement: CustomerStatement; onSent: (id: string, text: string) => void; sent: { id: string; text: string } | null }) {
  const { t } = useLang()
  const thread = useRef<HTMLOListElement>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const { customer, messages } = statement

  // The newest message is at the bottom, where a phone shows it.
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [statement, sent])

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const words = text.trim()
    if (!words) return
    setBusy(true)
    setProblem(null)
    try {
      const created = await api.createComplaint({ customer_id: customer.customer_id, text: words })
      setText('')
      onSent(created.complaint_id, words)
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  let lastDay = ''
  return (
    <div className="device">
      <div className="device__top"><b>{t({ en: 'Bank', uz: 'Bank', ru: 'Банк' })}</b><span>{customer.phone_masked}</span></div>
      <ol className="thread" ref={thread} tabIndex={0} aria-label={t({ en: 'Messages from the bank, oldest first', uz: 'Bankdan kelgan xabarlar, eskisi birinchi', ru: 'Сообщения банка, сначала старые' })}>
        {messages.length === 0 && <li className="day">{t({ en: 'The bank has sent this customer no message yet.', uz: 'Bank bu mijozga hali xabar yubormagan.', ru: 'Банк ещё не отправлял этому клиенту сообщений.' })}</li>}
        {messages.flatMap((message, index) => {
          const day = message.at.slice(0, 10)
          const label = day !== lastDay ? <li key={`d-${index}`} className="day">{formatDate(message.at)}</li> : null
          lastDay = day
          return [label, <Bubble key={index} message={message} />]
        })}
        {sent && <li className="bubble bubble--me">{sent.text}<small>{t({ en: 'Sent to the bank', uz: 'Bankka yuborildi', ru: 'Отправлено в банк' })} · {sent.id}</small></li>}
      </ol>
      <form className="write" onSubmit={send}>
        <label>
          <span className="sr">{t({ en: 'Write a complaint', uz: 'Shikoyat yozing', ru: 'Напишите жалобу' })}</span>
          <textarea value={text} maxLength={MAX_TEXT} onChange={(event) => setText(event.target.value)}
            placeholder={t({ en: 'Write a complaint in your own words: Uzbek, Russian, English or a mix…', uz: 'Shikoyatni oʻz soʻzlaringiz bilan yozing: oʻzbekcha, ruscha, inglizcha yoki aralash…', ru: 'Напишите жалобу своими словами: по-узбекски, по-русски, по-английски или вперемешку…' })} />
        </label>
        <div className="row-acts">
          <span>{text.length} / {MAX_TEXT}</span>
          <button type="submit" className="btn btn--act" disabled={busy || !text.trim()}>{busy ? t({ en: 'Sending…', uz: 'Yuborilmoqda…', ru: 'Отправка…' }) : t({ en: 'Send the complaint', uz: 'Shikoyatni yuborish', ru: 'Отправить жалобу' })}</button>
        </div>
        {problem && <div style={{ marginTop: 8 }}><Problem error={problem} onRetry={() => send()} /></div>}
      </form>
    </div>
  )
}

function Customer({ customerId }: { customerId: string }) {
  const { t } = useLang()
  const { state, reload } = useLoad(() => api.statement(customerId), [customerId])
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null)
  if (state.status === 'loading') return <Loading lines={6} />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const { customer, cards, contracts } = state.data
  return (
    <div className="phone">
      <div className="stack">
        <div className="panel panel--pad">
          <div className="sheet pad">
            <h2 className="h2">{customer.full_name}</h2>
            <p className="meta"><span className="id">{customer.customer_id}</span> · {customer.region}</p>
            <div className="facts">
              <p>{t({ en: 'Cards', uz: 'Kartalar', ru: 'Карты' })}: <b>{cards.map((card) => `${card.label}${card.is_primary ? t({ en: ' (main)', uz: ' (asosiy)', ru: ' (основная)' }) : ''}`).join(', ') || '—'}</b></p>
              {contracts.map((contract) => (
                <p key={contract.contract_id}>{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <b className="id">{contract.contract_id}</b>: {t(productName(contract.product_code, contract.product_name))}, <Som n={contract.monthly_payment} /> {t({ en: `a month, due on day ${contract.due_day}`, uz: `oyiga, har oyning ${contract.due_day}-kuni`, ru: `в месяц, платёж ${contract.due_day}-го числа` })}</p>
              ))}
            </div>
          </div>
        </div>
        {sent
          ? <LiveRun key={sent.id} complaintId={sent.id} />
          : <p className="note">{t({
            en: 'Read what the bank sent, then write a complaint as this customer. The moment you send it, FeeGuard starts: it reads the words, checks the records, looks for others and drafts the reply.',
            uz: 'Bank nima yuborganini oʻqing, soʻng shu mijoz nomidan shikoyat yozing. Yuborishingiz bilan FeeGuard ishga tushadi: soʻzlarni oʻqiydi, yozuvlarni tekshiradi, boshqalarni qidiradi va javob tayyorlaydi.',
            ru: 'Прочитайте, что прислал банк, и напишите жалобу от имени этого клиента. Как только вы её отправите, FeeGuard начнёт работу: прочитает слова, проверит записи, найдёт других и подготовит ответ.',
          })}</p>}
      </div>
      <Device statement={state.data} sent={sent} onSent={(id, text) => setSent({ id, text })} />
    </div>
  )
}

export default function Phone() {
  const { t } = useLang()
  const [params, setParams] = useSearchParams()
  const chosen = params.get('customer')
  return (
    <div className="wrap">
      <Head
        title={t({ en: 'Customer’s phone', uz: 'Mijoz telefoni', ru: 'Телефон клиента' })}
        sentence={t({
          en: 'The other side of the demo: what a customer of the demo bank sees, and where a complaint is written. Pick a customer, then complain as them.',
          uz: 'Demoning ikkinchi tomoni: demo bank mijozi nimani koʻradi va shikoyat qayerda yoziladi. Mijozni tanlang, soʻng uning nomidan shikoyat yozing.',
          ru: 'Другая сторона демо: что видит клиент демо-банка и где пишется жалоба. Выберите клиента и пожалуйтесь от его имени.',
        })}
      />
      <div className="cols cols--side">
        <Picker chosen={chosen} onPick={(customer) => setParams({ customer: customer.customer_id })} />
        {chosen
          ? <Customer key={chosen} customerId={chosen} />
          : <Empty><p>{t({ en: 'Choose a customer on the left to open their phone.', uz: 'Telefonini ochish uchun chapdan mijozni tanlang.', ru: 'Выберите клиента слева, чтобы открыть его телефон.' })}</p></Empty>}
      </div>
    </div>
  )
}
