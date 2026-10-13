// One complaint (V2_PLAN W1.6), told in the four steps of the landing page: read, check, decide,
// find others. The customer's own words head the page. The decision floats at the bottom; it is
// the only blue on the screen, because it is the only thing a person decides here.

import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { api, ApiError } from '../api'
import { formatDate, formatDateTime, formatMonth, formatSeconds } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { CaseResult, Complaint, ContractClause, Decision, DecisionAction, DefectType, Finding, Incident, Verdict } from '../types'
import { ACTING_AS, CLAIM, LANG_ATTR, LETTER, MISTAKE_LONG, READ_BY, RECEIVED_BY, VERDICT, productName, verified } from '../words'
import { useWaited } from './Complaints'
import { Statement } from './Statement'
import { Empty, Figures, Loading, Num, Problem, Rise, Som } from './ui'

const VERDICTS: Verdict[] = ['SUPPORTED', 'NOT_SUPPORTED', 'NEEDS_INFO', 'OUT_OF_SCOPE']
const STEP: Words[] = [
  { en: 'Read', uz: 'Oʻqish', ru: 'Прочитать' },
  { en: 'Check', uz: 'Tekshirish', ru: 'Проверить' },
  { en: 'Decide', uz: 'Qaror qilish', ru: 'Решить' },
  { en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' },
]
const STEP_SUB: Words[] = [
  { en: 'the complaint', uz: 'shikoyatni', ru: 'жалобу' },
  { en: 'the bank’s records', uz: 'bank yozuvlarini', ru: 'записи банка' },
  { en: 'you, a person', uz: 'siz, inson', ru: 'вы, человек' },
  { en: 'with the same mistake', uz: 'xuddi shu xato tekkanlarni', ru: 'с той же ошибкой' },
]
const DECIDED: Record<DecisionAction, Words> = {
  CONFIRM: { en: 'Reply approved', uz: 'Javob tasdiqlandi', ru: 'Ответ одобрен' },
  CORRECT: { en: 'Verdict corrected', uz: 'Xulosa tuzatildi', ru: 'Вывод исправлен' },
  DISMISS: { en: 'Verdict rejected', uz: 'Xulosa rad etildi', ru: 'Вывод отклонён' },
}

type StepState = 'done' | 'now' | 'todo'

export default function Case() {
  const { complaintId } = useParams()
  return <CaseView key={complaintId} id={complaintId ?? ''} />
}

function CaseView({ id }: { id: string }) {
  const { t } = useLang()
  const location = useLocation()
  const passed = (location.state as { complaint?: Complaint } | null)?.complaint
  const { state, reload, replace } = useLoad<{ complaint: Complaint; result: CaseResult | null; incidents: Incident[] }>(async () => {
    const incidents = api.incidents().then((list) => list.items, () => [] as Incident[])
    try {
      const result = await api.getCase(id)
      return { complaint: result.complaint, result, incidents: await incidents }
    } catch (error) {
      // Not checked yet: show the complaint and wait for a person to start the check.
      if (!(error instanceof ApiError) || error.code !== 'NOT_FOUND') throw error
      const complaint = passed?.complaint_id === id ? passed : (await api.complaints(undefined, 500)).items.find((item) => item.complaint_id === id)
      if (!complaint) throw error
      return { complaint, result: null, incidents: await incidents }
    }
  }, [id])
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)

  if (state.status === 'loading') return <div className="wrap" style={{ paddingTop: 34 }}><Loading lines={6} words={t({ en: 'Opening the complaint…', uz: 'Shikoyat ochilmoqda…', ru: 'Открываем жалобу…' })} /></div>
  if (state.status === 'error') {
    return (
      <div className="wrap" style={{ paddingTop: 34 }}>
        <p style={{ marginBottom: 20 }}><Link className="back" to="/app">← {t({ en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' })}</Link></p>
        <Problem error={state.error} onRetry={reload} />
      </div>
    )
  }
  const { complaint, result, incidents } = state.data

  async function check() {
    setChecking(true)
    setProblem(null)
    try {
      const checked = await api.investigate(id)
      replace({ complaint: checked.complaint, result: checked, incidents })
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setChecking(false)
    }
  }

  const decided = Boolean(result?.decision)
  const steps: StepState[] = !result
    ? ['now', 'todo', 'todo', 'todo']
    : ['done', 'done', decided ? 'done' : 'now', result.findings.length ? (decided ? 'now' : 'done') : 'todo']

  return (
    <div className="wrap">
      <CaseHead complaint={complaint} result={result} steps={steps} />
      {!result ? (
        <section className="st">
          <div className="st__l now">
            <span className="n">1</span>
            <h2>{t(STEP[0])}</h2>
            <p>{t({
              en: 'Nothing is read yet. FeeGuard reads the words, then checks them against the loan’s records. It takes a few seconds and changes nothing in the records.',
              uz: 'Hali hech narsa oʻqilmagan. FeeGuard soʻzlarni oʻqiydi, soʻng ularni kredit yozuvlari bilan tekshiradi. Bu bir necha soniya oladi va yozuvlarda hech narsani oʻzgartirmaydi.',
              ru: 'Пока ничего не прочитано. FeeGuard читает слова, затем сверяет их с записями по кредиту. Это занимает несколько секунд и ничего не меняет в записях.',
            })}</p>
          </div>
          <div className="st__r">
            {checking ? (
              <Loading lines={5} words={t({ en: 'Reading the complaint and checking the bank’s records…', uz: 'Shikoyat oʻqilmoqda va bank yozuvlari tekshirilmoqda…', ru: 'Читаем жалобу и проверяем записи банка…' })} />
            ) : (
              <div className="panel panel--pad">
                <div className="sheet pad">
                  <h3 className="h2">{t({ en: 'Not checked yet', uz: 'Hali tekshirilmagan', ru: 'Ещё не проверена' })}</h3>
                  <p className="muted" style={{ margin: '4px 0 16px', maxWidth: '36em' }}>{t({
                    en: 'The AI only reads the words. Code checks the records, and you decide.',
                    uz: 'Sunʼiy intellekt faqat soʻzlarni oʻqiydi. Yozuvlarni kod tekshiradi, qarorni esa siz qabul qilasiz.',
                    ru: 'ИИ только читает слова. Записи проверяет код, а решаете вы.',
                  })}</p>
                  <button type="button" className="btn btn--act" onClick={check}>{t({ en: 'Check this complaint', uz: 'Shikoyatni tekshirish', ru: 'Проверить жалобу' })}</button>
                </div>
              </div>
            )}
            {problem && <Problem error={problem} onRetry={check} />}
          </div>
        </section>
      ) : (
        <Checked result={result} steps={steps} incidents={incidents} onChange={(next) => replace({ complaint: next.complaint, result: next, incidents })} onCheckAgain={check} checking={checking} />
      )}
    </div>
  )
}

function CaseHead({ complaint, result, steps }: { complaint: Complaint; result: CaseResult | null; steps: StepState[] }) {
  const { t } = useLang()
  const waited = useWaited()
  const loan = result?.timelines[0]
  return (
    <header className="enter no-print" style={{ paddingTop: 34 }}>
      <Link className="back" to="/app">← {t({ en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' })}</Link>
      <p className="lbl" style={{ marginTop: 26 }}>
        {t({ en: 'Complaint', uz: 'Shikoyat', ru: 'Жалоба' })} <span className="id">{complaint.complaint_id}</span> · {t(RECEIVED_BY[complaint.channel])} · {formatDateTime(complaint.created_at)}
        {!result?.decision && <> · {t({ en: 'waiting', uz: 'kutmoqda:', ru: 'ждёт' })} {waited(complaint.created_at)}</>}
      </p>
      <blockquote className="said said--big" style={{ marginTop: 12 }} lang={LANG_ATTR[complaint.lang]}>“{complaint.text}”</blockquote>
      <p className="who">
        <b>{complaint.customer_name}</b> · <span className="id">{complaint.customer_id}</span>
        {loan ? <> · {t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <span className="id">{loan.contract_id}</span> · {t(productName(loan.product_code, loan.product_name))}</> : complaint.contract_id ? <> · {t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <span className="id">{complaint.contract_id}</span></> : null}
      </p>
      <ol className="glance">
        {STEP.map((name, i) => (
          <li key={i} className={steps[i]}>
            <a href={`#step-${i + 1}`}><i>{i + 1}</i><b>{t(name)}</b><span>{t(STEP_SUB[i])}</span></a>
          </li>
        ))}
      </ol>
    </header>
  )
}

function Checked({ result, steps, incidents, onChange, onCheckAgain, checking }: {
  result: CaseResult; steps: StepState[]; incidents: Incident[]; onChange: (next: CaseResult) => void; onCheckAgain: () => void; checking: boolean
}) {
  const { t, say } = useLang()
  const { health } = useSession()
  const { understood, complaint, decision } = result
  const [correcting, setCorrecting] = useState(false)
  const [note, setNote] = useState('')
  const [verdict, setVerdict] = useState<Verdict>(result.verdict)
  const [excess, setExcess] = useState(String(result.total_excess))
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const [just, setJust] = useState(false)
  const right = result.verdict === 'SUPPORTED'
  const amountValid = /^\d+$/.test(excess)
  const early = result.findings.find((finding) => finding.type === 'EARLY_DEBIT')
  const reason = say(result.verdict_reason, result.verdict_reason_t)
  const gemini = understood.mode === 'llm' && health?.model_name?.toLowerCase().startsWith('gemini')
  const clauses = uniqueClauses([...result.findings, ...result.cleared].flatMap((item) => item.evidence.contract_clauses))

  async function decide(action: DecisionAction) {
    setSending(true)
    setProblem(null)
    try {
      const correction = action === 'CORRECT' ? { corrected_verdict: verdict, corrected_excess: Number(excess) } : {}
      const made: Decision = await api.decide(result.case_id, { action, note, ...correction })
      setJust(true)
      setCorrecting(false)
      onChange({ ...result, decision: made, complaint: { ...complaint, status: action === 'CONFIRM' ? 'CONFIRMED' : action === 'CORRECT' ? 'CORRECTED' : 'DISMISSED' } })
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setSending(false)
    }
  }

  const conclusion = right
    ? <>{t({ en: 'The records support the customer:', uz: 'Yozuvlar mijozni qoʻllaydi:', ru: 'Записи подтверждают слова клиента:' })} <b><Som n={result.total_excess} /></b> {t({ en: 'to return.', uz: 'qaytarilishi kerak.', ru: 'к возврату.' })}</>
    : result.verdict === 'NOT_SUPPORTED'
      ? t({ en: 'The records do not support the complaint.', uz: 'Yozuvlar shikoyatni tasdiqlamaydi.', ru: 'Записи не подтверждают жалобу.' })
      : t({ en: 'The records alone cannot settle this one.', uz: 'Buni faqat yozuvlar asosida hal qilib boʻlmaydi.', ru: 'Одних записей здесь недостаточно.' })

  return (
    <>
      {/* 1 · Read */}
      <section className="st no-print" id="step-1">
        <div className="st__l">
          <span className="n">1</span>
          <h2>{t(STEP[0])}</h2>
          <p>{understood.mode === 'llm'
            ? t({ en: 'The AI read the customer’s words and filled a short form. It decides nothing.', uz: 'Sunʼiy intellekt mijozning soʻzlarini oʻqib, qisqa shaklni toʻldirdi. U hech narsani hal qilmaydi.', ru: 'ИИ прочитал слова клиента и заполнил короткую форму. Он ничего не решает.' })
            : t({ en: 'Simple rules read the customer’s words and filled a short form, because the AI was off or too slow.', uz: 'Mijozning soʻzlarini oddiy qoidalar oʻqib, qisqa shaklni toʻldirdi, chunki sunʼiy intellekt oʻchiq yoki sekin edi.', ru: 'Слова клиента прочитали простые правила и заполнили короткую форму: ИИ был выключен или не успел.' })}</p>
        </div>
        <div className="st__r">
          <div className="panel">
            <div className="panel__bar"><b>{t({ en: 'What FeeGuard understood', uz: 'FeeGuard nimani tushundi', ru: 'Что понял FeeGuard' })}</b><span>{t(READ_BY[understood.mode])}{gemini ? ' (Gemini)' : ''}</span></div>
            <dl className="fields">
              <div><dt>{t({ en: 'Problem', uz: 'Muammo', ru: 'Проблема' })}</dt><dd>{t(CLAIM[understood.claim_type])}</dd></div>
              <div><dt>{t({ en: 'Month', uz: 'Oy', ru: 'Месяц' })}</dt>{understood.period ? <dd>{formatMonth(understood.period)}</dd> : <dd className="no">{t({ en: 'Not stated', uz: 'Koʻrsatilmagan', ru: 'Не указан' })}</dd>}</div>
              <div><dt>{t({ en: 'Amount', uz: 'Summa', ru: 'Сумма' })}</dt>{understood.claimed_excess !== null ? <dd><Som n={understood.claimed_excess} /></dd> : <dd className="no">{t({ en: 'Not stated', uz: 'Koʻrsatilmagan', ru: 'Не указана' })}</dd>}</div>
              <div><dt>{t({ en: 'Records checked', uz: 'Tekshirilgan yozuvlar', ru: 'Проверенные записи' })}</dt><dd>{formatDate(result.window.date_from)} – {formatDate(result.window.date_to)}</dd></div>
            </dl>
          </div>
          <p className="note">{t({
            en: 'The verdict does not depend on this reading. All four checks always run on the records.',
            uz: 'Xulosa bu oʻqishga bogʻliq emas. Yozuvlar boʻyicha toʻrtta tekshiruvning hammasi doim ishlaydi.',
            ru: 'Вывод не зависит от этого прочтения. Все четыре проверки по записям выполняются всегда.',
          })}</p>
        </div>
      </section>

      {/* 2 · Check */}
      <section className="st no-print" id="step-2">
        <div className="st__l">
          <span className="n">2</span>
          <h2>{t(STEP[1])}</h2>
          <p>{t({ en: 'Code put the loan’s records side by side:', uz: 'Kod kredit yozuvlarini yonma-yon qoʻydi:', ru: 'Код сопоставил записи по кредиту:' })} <b>{t({ en: 'what was due', uz: 'qancha toʻlanishi kerak edi', ru: 'сколько нужно было заплатить' })}</b>, <b>{t({ en: 'what was taken', uz: 'qancha yechildi', ru: 'сколько списано' })}</b> {t({ en: 'from the cards, and', uz: 'kartalardan va', ru: 'с карт и' })} <b>{t({ en: 'what reached the loan', uz: 'kreditga qancha yetib bordi', ru: 'сколько дошло до кредита' })}</b>. {t({ en: 'It only reads them.', uz: 'U ularni faqat oʻqiydi.', ru: 'Он только читает их.' })}</p>
        </div>
        <div className="st__r">
          {result.timelines.length === 0 ? (
            <Empty><p>{t({ en: 'This customer has no loan payment in the checked months.', uz: 'Bu mijozning tekshirilgan oylarda kredit toʻlovi yoʻq.', ru: 'У этого клиента нет платежей по кредиту в проверенные месяцы.' })}</p></Empty>
          ) : (
            <div className="panel">
              <div className="panel__bar"><b>{t({ en: 'Bank records', uz: 'Bank yozuvlari', ru: 'Записи банка' })}</b><span>{t({ en: 'Read-only', uz: 'Faqat oʻqish', ru: 'Только чтение' })} · {formatDate(result.window.date_from)} – {formatDate(result.window.date_to)}</span></div>
              {result.timelines.map((timeline) => <Statement key={timeline.contract_id} timeline={timeline} customer={complaint.customer_name} skip={result.verdict_reason} />)}
              {clauses.length > 0 && (
                <div className="sheet clause">
                  <span className="lbl">{t({ en: 'The contract says', uz: 'Shartnomada yozilgan', ru: 'В договоре сказано' })}</span>
                  {clauses.map((clause) => <p key={clause.clause} lang="uz-Latn"><span className="meta" style={{ fontStyle: 'normal', fontFamily: 'var(--sans)' }}>{t({ en: 'Clause', uz: 'Band', ru: 'Пункт' })} {clause.clause} · </span>{clause.text}</p>)}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 3 · Decide */}
      <section className="st" id="step-3">
        <div className={`st__l no-print ${steps[2] === 'now' ? 'now' : ''}`}>
          <span className="n">3</span>
          <h2>{t(STEP[2])}</h2>
          <p>{conclusion} {!decision && t({ en: 'Read the reply, then decide. Nothing is sent before you approve.', uz: 'Javobni oʻqing, soʻng qaror qiling. Siz tasdiqlamaguningizcha hech narsa yuborilmaydi.', ru: 'Прочитайте ответ и решите. Пока вы не одобрите, ничего не отправляется.' })}</p>
        </div>
        <div className="st__r">
          <div className="panel no-print">
            <div className="panel__bar"><b>{t({ en: 'Verdict', uz: 'Xulosa', ru: 'Вывод' })}</b><span>{t({ en: 'Checked in', uz: 'Tekshirish vaqti:', ru: 'Проверено за' })} {formatSeconds(result.elapsed_ms)}{t({ en: ', against the records only', uz: ', faqat yozuvlar asosida', ru: ', только по записям' })}</span></div>
            <div className="sheet pad">
              <span className="stamp land">{t(VERDICT[result.verdict])}</span>
              <div className="money">
                {result.total_excess > 0
                  ? <><span className="big wrong"><Rise n={result.total_excess} /></span><small>{t({ en: 'to return to the customer', uz: 'mijozga qaytariladi', ru: 'вернуть клиенту' })}</small></>
                  : <span className="none">{t({ en: 'Nothing to return', uz: 'Qaytariladigan pul yoʻq', ru: 'Возвращать нечего' })}</span>}
              </div>
              <p className="reason"><Figures text={reason} /></p>
              <div className="facts">
                {early && <p className="wrong"><b>{t({ en: 'Taken early', uz: 'Muddatidan oldin yechilgan', ru: 'Списано раньше срока' })}: <Som n={early.amount_affected} /></b>. {t({ en: 'This money was owed, only later, so it is not counted as money to return.', uz: 'Bu pul toʻlanishi kerak edi, faqat keyinroq, shuning uchun u qaytariladigan pul deb hisoblanmaydi.', ru: 'Эти деньги причитались, но позже, поэтому в сумму к возврату они не входят.' })}</p>}
                {result.claim_match === false && <p>{t({ en: 'The records show a different mistake than the one the customer described.', uz: 'Yozuvlar mijoz aytganidan boshqa xatoni koʻrsatadi.', ru: 'Записи показывают не ту ошибку, которую описал клиент.' })}</p>}
                {result.findings.filter((finding) => finding.explanation !== result.verdict_reason).map((finding) => <p key={finding.finding_id}><Figures text={say(finding.explanation, finding.explanation_t)} /></p>)}
                {result.findings.some((finding) => finding.legal_basis) && <p>{t({ en: 'Legal basis', uz: 'Huquqiy asos', ru: 'Правовое основание' })}: <b>{t(verified(result.findings.find((finding) => finding.legal_basis)?.legal_basis ?? null))}</b></p>}
              </div>
            </div>
          </div>

          <Reply result={result} onChange={onChange} onCheckAgain={onCheckAgain} checking={checking} />

          <div className="no-print">
            {decision ? (
              <div className="decided">
                <span className={`stamp stamp--soft ${just ? 'land' : ''}`}>{t(DECIDED[decision.action])}</span>
                <span>{t({ en: 'by', uz: '', ru: '' })} {t(ACTING_AS[decision.actor])}, {formatDateTime(decision.at)}</span>
                {decision.action === 'CORRECT' && decision.corrected_verdict && (
                  <span>{t({ en: 'Corrected to', uz: 'Tuzatildi:', ru: 'Исправлено на' })}: <b>{t(VERDICT[decision.corrected_verdict])}</b>{decision.corrected_excess !== null && <>, <Som n={decision.corrected_excess} /></>}</span>
                )}
                {decision.note && <span className="muted">{t({ en: 'Note', uz: 'Izoh', ru: 'Заметка' })}: {decision.note}</span>}
              </div>
            ) : (
              <>
                {correcting && (
                  <div className="correct">
                    <h3 className="h3" style={{ marginBottom: 12 }}>{t({ en: 'Correct the verdict', uz: 'Xulosani tuzatish', ru: 'Исправить вывод' })}</h3>
                    <div className="fields-row">
                      <label className="field"><span>{t({ en: 'The right verdict', uz: 'Toʻgʻri xulosa', ru: 'Верный вывод' })}</span>
                        <select className="input" value={verdict} onChange={(event) => setVerdict(event.target.value as Verdict)}>
                          {VERDICTS.map((item) => <option key={item} value={item}>{t(VERDICT[item])}</option>)}
                        </select>
                      </label>
                      <label className="field"><span>{t({ en: 'To return, in whole soʻm', uz: 'Qaytariladi, butun soʻmda', ru: 'К возврату, в целых сумах' })}</span>
                        <input className="input num" inputMode="numeric" value={excess} aria-invalid={!amountValid} onChange={(event) => setExcess(event.target.value.replace(/\s/g, ''))} />
                      </label>
                    </div>
                    {!amountValid && <p className="note" style={{ marginTop: 8 }}>{t({ en: 'Write the amount with digits only, for example 500000.', uz: 'Summani faqat raqamlar bilan yozing, masalan 500000.', ru: 'Напишите сумму только цифрами, например 500000.' })}</p>}
                    <div className="row-acts" style={{ marginTop: 14 }}>
                      <button type="button" className="btn btn--act" disabled={sending || !amountValid} onClick={() => decide('CORRECT')}>{t({ en: 'Save the correction', uz: 'Tuzatishni saqlash', ru: 'Сохранить исправление' })}</button>
                      <button type="button" className="btn btn--quiet" onClick={() => setCorrecting(false)}>{t({ en: 'Cancel', uz: 'Bekor qilish', ru: 'Отмена' })}</button>
                    </div>
                  </div>
                )}
                <label className="field" style={{ marginTop: 12 }}>
                  <span>{t({ en: 'A note for the audit log, if you want to leave one', uz: 'Audit jurnali uchun izoh, agar qoldirmoqchi boʻlsangiz', ru: 'Заметка для журнала аудита, если хотите оставить' })}</span>
                  <textarea className="input" rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
              </>
            )}
            {problem && <div style={{ marginTop: 12 }}><Problem error={problem} /></div>}
          </div>
        </div>
      </section>

      {/* 4 · Find others */}
      <Others findings={result.findings} result={result} incidents={incidents} now={steps[3] === 'now'} />

      {!decision && (
        <div className="decide dark no-print" role="group" aria-label={t({ en: 'Your decision', uz: 'Sizning qaroringiz', ru: 'Ваше решение' })}>
          <span>{t({ en: 'Your decision', uz: 'Sizning qaroringiz', ru: 'Ваше решение' })}</span>
          <button type="button" className="btn btn--act" disabled={sending} onClick={() => decide('CONFIRM')}>{t({ en: 'Approve the reply', uz: 'Javobni tasdiqlash', ru: 'Одобрить ответ' })}</button>
          <button type="button" className="btn btn--quiet" disabled={sending} aria-expanded={correcting} onClick={() => { setCorrecting(true); window.setTimeout(() => document.querySelector('.fg .correct')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30) }}>
            <span className="long">{t({ en: 'Correct the verdict', uz: 'Xulosani tuzatish', ru: 'Исправить вывод' })}</span><span className="short">{t({ en: 'Correct', uz: 'Tuzatish', ru: 'Исправить' })}</span>
          </button>
          <button type="button" className="btn btn--quiet" disabled={sending} onClick={() => decide('DISMISS')}>{t({ en: 'Reject it', uz: 'Rad etish', ru: 'Отклонить' })}</button>
        </div>
      )}
    </>
  )
}

function uniqueClauses(clauses: ContractClause[]): ContractClause[] {
  const seen = new Set<string>()
  return clauses.filter((clause) => !seen.has(clause.clause) && seen.add(clause.clause))
}

/** The reply to the customer: drafted from the records, in the customer's language. */
function Reply({ result, onChange, onCheckAgain, checking }: { result: CaseResult; onChange: (next: CaseResult) => void; onCheckAgain: () => void; checking: boolean }) {
  const { t } = useLang()
  const { health } = useSession()
  const [busy, setBusy] = useState(false)
  const [told, setTold] = useState<string | null>(null)
  const [problem, setProblem] = useState<Error | null>(null)
  const draft = result.draft_reply
  const approved = result.decision?.action === 'CONFIRM'

  async function reword() {
    setBusy(true)
    setProblem(null)
    setTold(null)
    try {
      const next = await api.improveDraft(result.case_id)
      onChange({ ...result, draft_reply: next })
      if (next.source === 'template') {
        setTold(health?.llm_mode === 'llm'
          ? t({ en: 'The AI’s wording changed a number or the language, so the standard letter stays.', uz: 'Sunʼiy intellekt matnida raqam yoki til oʻzgardi, shuning uchun standart xat qoladi.', ru: 'ИИ изменил число или язык, поэтому остаётся стандартное письмо.' })
          : t({ en: 'The AI is not set up here, so the standard letter stays.', uz: 'Bu yerda sunʼiy intellekt ulanmagan, shuning uchun standart xat qoladi.', ru: 'ИИ здесь не подключён, поэтому остаётся стандартное письмо.' }))
      }
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  if (!draft) {
    const letterVerdict = result.verdict === 'SUPPORTED' || result.verdict === 'NOT_SUPPORTED'
    return (
      <div className="panel panel--pad no-print">
        <div className="sheet pad">
          <p>{letterVerdict
            ? t({ en: 'This complaint was checked before replies were drafted. Check it again to get the reply.', uz: 'Bu shikoyat javoblar tayyorlanishidan oldin tekshirilgan. Javobni olish uchun uni qayta tekshiring.', ru: 'Эта жалоба проверена до того, как появились черновики ответов. Проверьте её ещё раз, чтобы получить ответ.' })
            : t({ en: 'No reply is drafted for this verdict. A person writes it.', uz: 'Bu xulosa uchun javob tayyorlanmaydi. Uni inson yozadi.', ru: 'Для такого вывода ответ не готовится. Его пишет человек.' })}</p>
          {letterVerdict && !result.decision && <div className="row-acts" style={{ marginTop: 14 }}><button type="button" className="btn" disabled={checking} onClick={onCheckAgain}>{t({ en: 'Check again', uz: 'Qayta tekshirish', ru: 'Проверить ещё раз' })}</button></div>}
        </div>
      </div>
    )
  }
  return (
    <div className="panel">
      <div className="panel__bar no-print">
        <span><b>{t({ en: 'The reply to the customer', uz: 'Mijozga javob', ru: 'Ответ клиенту' })}</b> · {t(LETTER[draft.source])} · {approved ? t({ en: 'approved by a person', uz: 'inson tasdiqlagan', ru: 'одобрено человеком' }) : t({ en: 'a draft, not sent', uz: 'qoralama, yuborilmagan', ru: 'черновик, не отправлено' })}</span>
        <span className="row-acts">
          {draft.source === 'template' && !result.decision && <button type="button" className="btn btn--small btn--quiet" disabled={busy} onClick={reword}>{busy ? t({ en: 'Asking the AI…', uz: 'Sunʼiy intellektdan soʻralmoqda…', ru: 'Спрашиваем ИИ…' }) : t({ en: 'Reword it', uz: 'Qayta yozish', ru: 'Переписать' })}</button>}
          <button type="button" className="btn btn--small btn--quiet" onClick={() => window.print()}>{t({ en: 'Print', uz: 'Chop etish', ru: 'Печать' })}</button>
        </span>
      </div>
      <div className="sheet letter" lang={LANG_ATTR[draft.lang]}><Figures text={draft.text} /></div>
      {(told || draft.source === 'template') && !result.decision && (
        <p className="note no-print" style={{ padding: '10px 12px 6px' }}>{told ?? t({
          en: 'The AI may reword the letter. FeeGuard keeps its text only if every number and the language stay the same.',
          uz: 'Sunʼiy intellekt xatni qayta yozishi mumkin. FeeGuard uning matnini faqat barcha raqamlar va til oʻzgarmagan boʻlsa qoldiradi.',
          ru: 'ИИ может переписать письмо. FeeGuard оставит его текст, только если все числа и язык не изменились.',
        })}</p>
      )}
      {problem && <div className="no-print" style={{ padding: 6 }}><Problem error={problem} onRetry={reword} /></div>}
    </div>
  )
}

/** Step 4: the same mistake in the whole bank. One block per kind of mistake found. */
function Others({ findings, result, incidents, now }: { findings: Finding[]; result: CaseResult; incidents: Incident[]; now: boolean }) {
  const { t, say } = useLang()
  const seen = new Set<DefectType>()
  const kinds = findings.filter((finding) => !seen.has(finding.type) && seen.add(finding.type))
  return (
    <section className="st no-print" id="step-4">
      <div className={`st__l ${kinds.length ? (now ? 'now' : '') : 'todo'}`}>
        <span className="n">4</span>
        <h2>{t(STEP[3])}</h2>
        <p>{kinds.length
          ? t({ en: 'The same check over every loan of the bank, also for customers who never complained.', uz: 'Xuddi shu tekshiruv bankning har bir krediti boʻyicha, hech qachon shikoyat qilmagan mijozlar uchun ham.', ru: 'Та же проверка по каждому кредиту банка, в том числе для клиентов, которые не жаловались.' })
          : t({ en: 'No mistake was found, so there is nothing to look for in other loans.', uz: 'Xato topilmadi, shuning uchun boshqa kreditlarda qidiradigan narsa yoʻq.', ru: 'Ошибка не найдена, поэтому искать в других кредитах нечего.' })}</p>
      </div>
      <div className="st__r">
        {kinds.map((finding) => {
          const link = result.incidents?.find((item) => item.finding_type === finding.type)
          const incident = incidents.find((item) => item.finding_type === finding.type)
          const numbers = link ?? incident
          const early = finding.type === 'EARLY_DEBIT'
          return (
            <div key={finding.finding_id} className="four dark">
              <p className="lbl">{t(MISTAKE_LONG[finding.type])}</p>
              {numbers ? (
                <div className="headline headline--small" style={{ marginTop: 14 }}>
                  <div><b><Num n={numbers.customers} /></b><span>{t({ en: 'customers with the same mistake', uz: 'mijozda xuddi shu xato', ru: 'клиентов с той же ошибкой' })}</span></div>
                  <div><b><Num n={numbers.silent} /></b><span>{t({ en: 'never complained', uz: 'hech qachon shikoyat qilmagan', ru: 'ни разу не жаловались' })}</span></div>
                  {early && incident
                    ? <div><b><Som n={incident.total_affected} /></b><span>{t({ en: 'taken early', uz: 'muddatidan oldin yechilgan', ru: 'списано раньше срока' })}</span></div>
                    : <div><b className="wrong"><Som n={numbers.total_excess} /></b><span>{t({ en: 'to return', uz: 'qaytariladi', ru: 'к возврату' })}</span></div>}
                </div>
              ) : (
                <p style={{ marginTop: 12, maxWidth: '34em' }}>{t({ en: 'FeeGuard has not looked in the other loans yet.', uz: 'FeeGuard boshqa kreditlarni hali koʻrib chiqmagan.', ru: 'FeeGuard ещё не смотрел другие кредиты.' })}</p>
              )}
              {link?.cause_sentence && <p className="muted" style={{ marginTop: 14, maxWidth: '44em', fontSize: 14 }}><Figures text={say(link.cause_sentence, link.cause_sentence_t)} /></p>}
              <div className="go">
                <span className="muted small">{numbers ? t({ en: 'Found by the check of all loans.', uz: 'Barcha kreditlar tekshiruvida topilgan.', ru: 'Найдено проверкой всех кредитов.' }) : ''}</span>
                <span className="row-acts">
                  {incident && <Link className="btn btn--quiet" to={`/app/incidents/${encodeURIComponent(incident.incident_id)}`}>{t({ en: 'Open the incident', uz: 'Hodisani ochish', ru: 'Открыть инцидент' })}</Link>}
                  <Link className="btn" to={`/app/others/${encodeURIComponent(finding.finding_id)}`}>{t({ en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' })} <span className="arrow">→</span></Link>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
