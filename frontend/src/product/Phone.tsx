// The customer's phone (V2_PLAN W1.6): the messages the bank sent one customer, as a thread, and
// a box to complain as them. Sending it starts FeeGuard, step by step, beside the phone. This is
// the demo bank's side: it stores the complaint, and FeeGuard only reads it. /demo opens it.

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { formatDate, formatTime } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { CustomerStatement, StatementMessage } from '../types'
import { DEFAULT_WORLD_ID, MAX_TEXT } from '../types'
import { LANG_ATTR, MISTAKE, PAID_BY, chargeName, productName } from '../words'
import { LiveRun } from './LiveRun'
import { Picker } from './Picker'
import { Empty, Head, Loading, Problem, Som } from './ui'

// Example customers of the main demo bank (seed 2026), chosen by hand, never read from the
// answer key (V2_PLAN W4, free mode). The first is the landing page's story; the second has the
// same name and no mistake, so the same complaint gets "the bank was right".
const EXAMPLE_COMPLAINT: Words = {
  uz: 'Assalomu alaykum. Iyul oyida HUMO kartamdan kredit toʻlovi ikki marta yechib olindi. Pulimni qaytarib bering.',
  ru: 'Здравствуйте. В июле платёж по кредиту списали с моей карты HUMO дважды. Верните мои деньги.',
  en: 'Hello. In July my loan payment was taken twice from my HUMO card. Please give my money back.',
}
const EXAMPLES: { customerId: string; name: string; hint: Words }[] = [
  { customerId: 'CU-00662', name: 'Oybek Salimov', hint: { en: 'His July payment was taken twice', uz: 'Iyul toʻlovi ikki marta yechilgan', ru: 'Июльский платёж списали дважды' } },
  { customerId: 'CU-00085', name: 'Oybek Salimov', hint: { en: 'Same name, no mistake in his records', uz: 'Ismi bir xil, yozuvlarida xato yoʻq', ru: 'То же имя, в записях ошибки нет' } },
]

function Examples({ chosen, onPick }: { chosen: string | null; onPick: (customerId: string) => void }) {
  const { t } = useLang()
  return (
    <div className="panel panel--pad examples">
      <p className="lbl">{t({ en: 'Start with an example', uz: 'Misoldan boshlang', ru: 'Начните с примера' })}</p>
      <ul>
        {EXAMPLES.map((example) => (
          <li key={example.customerId}>
            <button type="button" aria-pressed={example.customerId === chosen} onClick={() => onPick(example.customerId)}>
              <b>{example.name}</b>
              <span className="id">{example.customerId}</span>
              <span className="hint">{t(example.hint)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

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

function Device({ statement, onSent, sent, example }: { statement: CustomerStatement; onSent: (id: string, text: string) => void; sent: { id: string; text: string } | null; example: string | null }) {
  const { t } = useLang()
  const thread = useRef<HTMLOListElement>(null)
  const typing = useRef<number | null>(null)
  const [text, setText] = useState('')
  const [writing, setWriting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const { customer, messages } = statement

  // The newest message is at the bottom, where a phone shows it.
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight
  }, [statement, sent])

  useEffect(() => () => { if (typing.current) window.clearInterval(typing.current) }, [])

  // The example complaint is typed into the box, two letters at a time, unless motion is reduced.
  function writeExample(words: string) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(words)
      return
    }
    let shown = 0
    setWriting(true)
    typing.current = window.setInterval(() => {
      shown = Math.min(words.length, shown + 2)
      setText(words.slice(0, shown))
      if (shown === words.length) {
        window.clearInterval(typing.current ?? undefined)
        typing.current = null
        setWriting(false)
      }
    }, 16)
  }

  async function send(event?: FormEvent) {
    event?.preventDefault()
    const words = text.trim()
    if (!words || writing) return
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
          <textarea value={text} maxLength={MAX_TEXT} readOnly={writing} onChange={(event) => setText(event.target.value)}
            placeholder={t({ en: 'Write a complaint in your own words: Uzbek, Russian, English or a mix…', uz: 'Shikoyatni oʻz soʻzlaringiz bilan yozing: oʻzbekcha, ruscha, inglizcha yoki aralash…', ru: 'Напишите жалобу своими словами: по-узбекски, по-русски, по-английски или вперемешку…' })} />
        </label>
        <div className="row-acts">
          {example && !text
            ? <button type="button" className="btn btn--small btn--ex" onClick={() => writeExample(example)}>{t({ en: 'Use the example complaint', uz: 'Namuna shikoyatni qoʻyish', ru: 'Вставить пример жалобы' })}</button>
            : <span>{text.length} / {MAX_TEXT}</span>}
          <button type="submit" className="btn btn--act" disabled={busy || writing || !text.trim()}>{busy ? t({ en: 'Sending…', uz: 'Yuborilmoqda…', ru: 'Отправка…' }) : t({ en: 'Send the complaint', uz: 'Shikoyatni yuborish', ru: 'Отправить жалобу' })}</button>
        </div>
        {problem && <div style={{ marginTop: 8 }}><Problem error={problem} onRetry={() => send()} /></div>}
      </form>
    </div>
  )
}

function Customer({ customerId, examples }: { customerId: string; examples: boolean }) {
  const { t } = useLang()
  const { state, reload } = useLoad(() => api.statement(customerId), [customerId])
  const [sent, setSent] = useState<{ id: string; text: string } | null>(null)
  if (state.status === 'loading') return <Loading lines={6} />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const { customer, cards, contracts } = state.data
  const example = examples && EXAMPLES.some((item) => item.customerId === customerId) ? t(EXAMPLE_COMPLAINT) : null
  const other = example ? EXAMPLES.find((item) => item.customerId !== customerId) : undefined
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
        {sent && <LiveRun key={sent.id} complaintId={sent.id} />}
        {sent && other && (
          <p className="note">
            <Link className="link" to={`/app/phone?customer=${other.customerId}`}>{t({
              en: `Send the same complaint as ${other.name}, ${other.customerId}`,
              uz: `Xuddi shu shikoyatni ${other.name} (${other.customerId}) nomidan yuborish`,
              ru: `Отправить ту же жалобу от имени ${other.name}, ${other.customerId}`,
            })}</Link> · {t(other.hint)}
          </p>
        )}
        {!sent && <p className="note">{t({
            en: 'Read what the bank sent, then write a complaint as this customer. The moment you send it, FeeGuard starts: it reads the words, checks the records, looks for others and drafts the reply.',
            uz: 'Bank nima yuborganini oʻqing, soʻng shu mijoz nomidan shikoyat yozing. Yuborishingiz bilan FeeGuard ishga tushadi: soʻzlarni oʻqiydi, yozuvlarni tekshiradi, boshqalarni qidiradi va javob tayyorlaydi.',
            ru: 'Прочитайте, что прислал банк, и напишите жалобу от имени этого клиента. Как только вы её отправите, FeeGuard начнёт работу: прочитает слова, проверит записи, найдёт других и подготовит ответ.',
          })}</p>}
      </div>
      <Device statement={state.data} sent={sent} example={example} onSent={(id, text) => setSent({ id, text })} />
    </div>
  )
}

export default function Phone() {
  const { t } = useLang()
  const { worldId } = useSession()
  const [params, setParams] = useSearchParams()
  const chosen = params.get('customer')
  const examples = worldId === DEFAULT_WORLD_ID
  const pick = (customerId: string) => setParams({ customer: customerId })
  return (
    <div className="wrap">
      <Head
        title={t({ en: 'Customer’s phone', uz: 'Mijoz telefoni', ru: 'Телефон клиента' })}
        sentence={t({
          en: 'Write a complaint as a customer of the demo bank, send it, and watch FeeGuard check it step by step.',
          uz: 'Demo bank mijozi nomidan shikoyat yozing, yuboring va FeeGuard uni qadamma-qadam qanday tekshirishini kuzating.',
          ru: 'Напишите жалобу от имени клиента демо-банка, отправьте её и смотрите, как FeeGuard проверяет её шаг за шагом.',
        })}
      />
      <div className={`cols cols--side${chosen ? ' chosen' : ''}`}>
        <div className="stack pick-col">
          {examples && <Examples chosen={chosen} onPick={pick} />}
          <Picker chosen={chosen} onPick={(customer) => pick(customer.customer_id)} />
        </div>
        {chosen
          ? <Customer key={chosen} customerId={chosen} examples={examples} />
          : <Empty><p>{t({ en: 'Choose a customer to open their phone.', uz: 'Telefonini ochish uchun mijozni tanlang.', ru: 'Выберите клиента, чтобы открыть его телефон.' })}</p></Empty>}
      </div>
    </div>
  )
}
