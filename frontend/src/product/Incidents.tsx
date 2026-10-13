// Incidents (V2_PLAN W1.5, W1.6; D-040): one problem in the bank's records, one decision for
// every customer it hit, and every customer told. A complaints officer proposes one refund for
// all of them, the compliance head approves exactly that, then FeeGuard writes to each customer.

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import { CUSTOMER, LOAN, countOf, formatDate, formatDateTime, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { Incident, IncidentDetail } from '../types'
import { ACTING_AS, CHECK_TRIGGER, INCIDENT_STATUS, MISTAKE_LONG } from '../words'
import { Empty, Figures, Head, Loading, Num, Pipe, Problem, Som } from './ui'

const FIRST_ROWS = 25
const firstSentence = (text: string) => {
  const cut = text.indexOf('. ')
  return cut > 0 ? text.slice(0, cut + 1) : text
}

function Numbers({ incident, small = false }: { incident: Incident; small?: boolean }) {
  const { t } = useLang()
  const early = incident.total_excess === 0 && incident.total_affected > 0
  return (
    <div className={`headline${small ? ' headline--small' : ''}`}>
      <div><b><Num n={incident.customers} /></b><span>{t({ en: 'customers', uz: 'mijoz', ru: 'клиентов' })}{!small && <>, {countOf(incident.contracts, LOAN)}</>}</span></div>
      <div><b><Num n={incident.silent} /></b><span>{t({ en: 'never complained', uz: 'hech qachon shikoyat qilmagan', ru: 'ни разу не жаловались' })}</span></div>
      {early
        ? <div><b><Som n={incident.total_affected} /></b><span>{t({ en: 'taken early; nothing to return', uz: 'muddatidan oldin yechilgan; qaytariladigan pul yoʻq', ru: 'списано раньше срока; возвращать нечего' })}</span></div>
        : <div><b className="wrong"><Som n={incident.total_excess} /></b><span>{t({ en: 'to return', uz: 'qaytariladi', ru: 'к возврату' })}</span></div>}
    </div>
  )
}

export function IncidentList() {
  const { t, say } = useLang()
  const { worldId } = useSession()
  const { state, reload } = useLoad(() => api.incidents(), [worldId])
  return (
    <div className="wrap">
      <Head
        title={t({ en: 'Incidents', uz: 'Hodisalar', ru: 'Инциденты' })}
        sentence={t({
          en: 'One problem in the bank’s records, one decision for every customer it hit. A complaints officer proposes one refund for all of them, the compliance head approves it, and FeeGuard tells every customer in their own language.',
          uz: 'Bank yozuvlaridagi bitta muammo, u tekkan har bir mijoz uchun bitta qaror. Shikoyatlar xodimi hammasi uchun bitta qaytarishni taklif qiladi, komplayens rahbari uni tasdiqlaydi va FeeGuard har bir mijozga oʻz tilida xabar beradi.',
          ru: 'Одна проблема в записях банка — одно решение для всех, кого она задела. Сотрудник по жалобам предлагает один возврат для всех, руководитель комплаенса его утверждает, и FeeGuard сообщает каждому клиенту на его языке.',
        })}
      />
      {state.status === 'loading' && <Loading lines={5} />}
      {state.status === 'error' && <Problem error={state.error} onRetry={reload} />}
      {state.status === 'ready' && state.data.items.length === 0 && (
        <Empty><p>{t({
          en: 'No incident is open. One opens when the check of all loans finds the same mistake on two or more customers.',
          uz: 'Ochiq hodisa yoʻq. Barcha kreditlar tekshiruvi bir xil xatoni ikki yoki undan ortiq mijozda topganda hodisa ochiladi.',
          ru: 'Открытых инцидентов нет. Инцидент открывается, когда проверка всех кредитов находит одну и ту же ошибку у двух и более клиентов.',
        })}</p></Empty>
      )}
      {state.status === 'ready' && state.data.items.length > 0 && (
        <div className="incs enter">
          {state.data.items.map((incident) => (
            <Link key={incident.incident_id} className="inc" to={`/app/incidents/${encodeURIComponent(incident.incident_id)}`}>
              <div>
                <h2 className="h3" style={{ fontSize: 21, letterSpacing: '-.02em' }}>{t(MISTAKE_LONG[incident.finding_type])}</h2>
                <p className="sub-id">{t({ en: 'Found', uz: 'Topildi:', ru: 'Найдено' })} {formatDate(incident.opened_at)}, {t(CHECK_TRIGGER[incident.opened_by])}</p>
              </div>
              <Numbers incident={incident} small />
              <p className="why">{incident.cause
                ? <Figures text={firstSentence(say(incident.cause.sentence, incident.cause.sentence_t))} />
                : t({ en: 'Too few cases to name a cause.', uz: 'Sababni aytish uchun holatlar kam.', ru: 'Слишком мало случаев, чтобы назвать причину.' })}</p>
              <div className="foot"><Pipe status={incident.status} /><span className="btn btn--small">{t({ en: 'Open', uz: 'Ochish', ru: 'Открыть' })} <span className="arrow">→</span></span></div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

type Step = 'propose' | 'approve' | 'notify'
const NEXT: Record<Step, { label: Words; who: Words }> = {
  propose: {
    label: { en: 'Propose the refund', uz: 'Qaytarishni taklif qilish', ru: 'Предложить возврат' },
    who: { en: 'A complaints officer proposes one refund for every affected customer.', uz: 'Shikoyatlar xodimi barcha zarar koʻrgan mijozlar uchun bitta qaytarishni taklif qiladi.', ru: 'Сотрудник по жалобам предлагает один возврат для всех пострадавших клиентов.' },
  },
  approve: {
    label: { en: 'Approve the refund', uz: 'Qaytarishni tasdiqlash', ru: 'Утвердить возврат' },
    who: { en: 'The compliance head approves exactly what was proposed. The person who proposed it cannot approve it.', uz: 'Komplayens rahbari aynan taklif qilingan narsani tasdiqlaydi. Taklif qilgan xodim uni tasdiqlay olmaydi.', ru: 'Руководитель комплаенса утверждает ровно то, что предложено. Тот, кто предложил, утвердить не может.' },
  },
  notify: {
    label: { en: 'Tell the customers', uz: 'Mijozlarga xabar berish', ru: 'Уведомить клиентов' },
    who: { en: 'FeeGuard writes each approved customer a message in their own language, from a fixed text, also those who never complained.', uz: 'FeeGuard har bir tasdiqlangan mijozga oʻz tilida, tayyor matn asosida xabar yozadi, shikoyat qilmaganlarga ham.', ru: 'FeeGuard пишет каждому утверждённому клиенту на его языке по готовому тексту, в том числе тем, кто не жаловался.' },
  },
}

/** What a person does next, if anything. A customer found later waits for a new proposal. */
function nextStep(incident: Incident): Step | null {
  if (incident.status === 'OPEN') return 'propose'
  if (incident.status === 'PROPOSED') return 'approve'
  if (incident.status === 'APPROVED') return 'notify'
  return incident.waiting_customers > 0 ? 'propose' : null
}

export function IncidentPage() {
  const { incidentId } = useParams()
  return <Detail key={incidentId} id={incidentId ?? ''} />
}

function Detail({ id }: { id: string }) {
  const { t, say } = useLang()
  const { actor } = useSession()
  const { state, reload, replace } = useLoad<IncidentDetail>(() => api.incident(id), [id])
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const [all, setAll] = useState(false)
  const back = { to: '/app/incidents', label: t({ en: 'Incidents', uz: 'Hodisalar', ru: 'Инциденты' }) }

  if (state.status === 'loading') return <div className="wrap" style={{ paddingTop: 34 }}><Loading lines={6} /></div>
  if (state.status === 'error') {
    return (
      <div className="wrap" style={{ paddingTop: 34 }}>
        <p style={{ marginBottom: 20 }}><Link className="back" to={back.to}>← {back.label}</Link></p>
        <Problem error={state.error} onRetry={reload} />
      </div>
    )
  }
  const { incident, customers } = state.data
  const step = nextStep(incident)
  const noMoney = incident.total_excess === 0
  const rows = all ? customers : customers.slice(0, FIRST_ROWS)

  async function act(which: Step) {
    setBusy(true)
    setProblem(null)
    try {
      const next = await api.incidentStep(id, which)
      replace({ incident: next, customers })
      reload()
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="wrap">
      <Head
        back={back}
        title={t(MISTAKE_LONG[incident.finding_type])}
        sentence={<>{t({ en: 'Found', uz: 'Topildi:', ru: 'Найдено' })} {formatDateTime(incident.opened_at)}, {t(CHECK_TRIGGER[incident.opened_by])}. {t({ en: 'Complaints about it checked so far', uz: 'Shu haqda hozirgacha tekshirilgan shikoyatlar', ru: 'Жалоб об этом проверено на сегодня' })}: {incident.complaints_checked}.</>}
      />
      <Numbers incident={incident} />

      <div className="section">
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'Where it is', uz: 'Qaysi bosqichda', ru: 'На каком этапе' })}</b><Pipe status={incident.status} /></div>
          <div className="sheet pad">
            <p className="h2">{t(INCIDENT_STATUS[incident.status])}</p>
            <div className="facts">
              {incident.proposed_by && incident.proposed_at && <p>{t({ en: 'Proposed by', uz: 'Taklif qildi:', ru: 'Предложил:' })} <b>{t(ACTING_AS[incident.proposed_by])}</b>, {formatDateTime(incident.proposed_at)}</p>}
              {incident.approved_by && incident.approved_at && <p>{t({ en: 'Approved by', uz: 'Tasdiqladi:', ru: 'Утвердил:' })} <b>{t(ACTING_AS[incident.approved_by])}</b>, {formatDateTime(incident.approved_at)} · {countOf(incident.approved_customers, CUSTOMER)}</p>}
              {incident.notified_customers > 0 && <p>{t({ en: 'Told', uz: 'Xabar berildi:', ru: 'Уведомлено:' })} <b>{countOf(incident.notified_customers, CUSTOMER)}</b></p>}
              {(incident.status === 'APPROVED' || incident.status === 'NOTIFIED') && incident.waiting_customers > 0 && <p>{t({ en: 'Found later and waiting for a new proposal', uz: 'Keyinroq topilgan va yangi taklifni kutmoqda', ru: 'Найдены позже и ждут нового предложения' })}: <b>{countOf(incident.waiting_customers, CUSTOMER)}</b></p>}
            </div>
            {step && (
              <>
                <p className="note" style={{ marginTop: 16 }}>{t(NEXT[step].who)} {t({ en: 'You act as', uz: 'Siz hozir:', ru: 'Сейчас вы:' })} <b style={{ color: 'var(--black)' }}>{t(ACTING_AS[actor])}</b>{t({ en: '; change it in Demo tools at the top.', uz: '; buni yuqoridagi “Demo vositalari”da oʻzgartirasiz.', ru: '; сменить роль можно в «Демо-инструментах» вверху.' })}</p>
                <div className="row-acts" style={{ marginTop: 14 }}>
                  <button type="button" className="btn btn--act" disabled={busy} onClick={() => act(step)}>
                    {step === 'propose' && noMoney ? t({ en: 'Propose the decision', uz: 'Qarorni taklif qilish', ru: 'Предложить решение' }) : step === 'approve' && noMoney ? t({ en: 'Approve the decision', uz: 'Qarorni tasdiqlash', ru: 'Утвердить решение' }) : t(NEXT[step].label)}
                  </button>
                </div>
              </>
            )}
            {problem && <div style={{ marginTop: 14 }}><Problem error={problem} /></div>}
          </div>
        </div>
      </div>

      <div className="section cols">
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'Why it happened', uz: 'Nega shunday boʻldi', ru: 'Почему это произошло' })}</b></div>
          <div className="sheet pad prose">
            {incident.cause ? (
              <>
                <span className="lbl">{t({ en: 'Cause', uz: 'Sabab', ru: 'Причина' })}</span>
                <p style={{ marginTop: 4, fontSize: 16 }}><Figures text={say(incident.cause.sentence, incident.cause.sentence_t)} /></p>
                {incident.cause.suggested_fix && (
                  <>
                    <span className="lbl" style={{ display: 'block', marginTop: 20 }}>{t({ en: 'Suggested fix', uz: 'Tuzatish taklifi', ru: 'Как исправить' })}</span>
                    <p style={{ marginTop: 4 }}>{say(incident.cause.suggested_fix, incident.cause.suggested_fix_t)}</p>
                  </>
                )}
              </>
            ) : <p>{t({ en: 'Too few cases to name a cause.', uz: 'Sababni aytish uchun holatlar kam.', ru: 'Слишком мало случаев, чтобы назвать причину.' })}</p>}
          </div>
        </div>
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'Every customer it hit', uz: 'U tekkan har bir mijoz', ru: 'Все, кого это задело' })}</b><span>{countOf(customers.length, CUSTOMER)}</span></div>
          <div className="sheet scroll">
            <table className="tbl">
              <thead><tr>
                <th>{t({ en: 'Customer', uz: 'Mijoz', ru: 'Клиент' })}</th>
                <th className="hide-s">{t({ en: 'Loans', uz: 'Kreditlar', ru: 'Кредиты' })}</th>
                <th className="n">{noMoney ? t({ en: 'Taken early, soʻm', uz: 'Oldin yechilgan, soʻm', ru: 'Раньше срока, сум' }) : t({ en: 'To return, soʻm', uz: 'Qaytariladi, soʻm', ru: 'К возврату, сум' })}</th>
                <th className="hide-s">{t({ en: 'Complained', uz: 'Shikoyat', ru: 'Жалоба' })}</th>
                <th>{t({ en: 'Refund', uz: 'Qaytarish', ru: 'Возврат' })}</th>
              </tr></thead>
              <tbody>
                {rows.map((customer) => (
                  <tr key={customer.customer_id}>
                    <td>{customer.customer_name}<span className="c under">{customer.region}</span></td>
                    <td className="id c hide-s">{customer.contracts.join(', ')}</td>
                    <td className="n"><Num n={noMoney ? customer.amount_affected : customer.amount_excess} /></td>
                    <td className="nw hide-s">{customer.complained && customer.complaint_id ? <Link className="link" to={`/app/case/${encodeURIComponent(customer.complaint_id)}`}>{customer.complaint_id}</Link> : <span className="c">{t({ en: 'never', uz: 'yoʻq', ru: 'нет' })}</span>}</td>
                    <td className="nw">{customer.notified
                      ? <span className="flag-yes">{t({ en: 'Told', uz: 'Xabar berildi', ru: 'Уведомлён' })}</span>
                      : customer.approved ? <span className="flag-yes">{t({ en: 'Approved', uz: 'Tasdiqlandi', ru: 'Утверждён' })}</span>
                      : <span className="c">{t({ en: 'Waiting', uz: 'Kutmoqda', ru: 'Ждёт' })}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="more">
              {t({ en: `${formatNumber(rows.length)} shown of ${formatNumber(customers.length)}.`, uz: `${formatNumber(customers.length)} tadan ${formatNumber(rows.length)} tasi koʻrsatildi.`, ru: `Показано ${formatNumber(rows.length)} из ${formatNumber(customers.length)}.` })}
              {!all && customers.length > FIRST_ROWS && <button type="button" className="link" onClick={() => setAll(true)}>{t({ en: `Show all ${formatNumber(customers.length)}`, uz: `Barcha ${formatNumber(customers.length)} tasini koʻrsatish`, ru: `Показать всех (${formatNumber(customers.length)})` })}</button>}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
