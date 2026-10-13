// The live run (D-038): right after a customer sends a complaint, FeeGuard works on it in front
// of the visitor. Every step is a real call to the API and turns done only when the server
// answers; the time shown is measured in this browser. Each step says who did the work.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { CUSTOMER, countOf, formatDate, formatMonth, formatNumber, formatSeconds } from '../format'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { CaseResult, DraftReply, ScanResult } from '../types'
import { CLAIM, LANGUAGE, LANG_ATTR, VERDICT } from '../words'
import { Figures, Som, useProblemText } from './ui'

type State = 'waiting' | 'running' | 'done' | 'skipped' | 'failed'
type StepKey = 'received' | 'read' | 'records' | 'verdict' | 'others' | 'cause' | 'letter' | 'audit'
const ORDER: StepKey[] = ['received', 'read', 'records', 'verdict', 'others', 'cause', 'letter', 'audit']

const TITLE: Record<StepKey, Words> = {
  received: { en: 'The bank registered the complaint', uz: 'Bank shikoyatni roʻyxatga oldi', ru: 'Банк зарегистрировал жалобу' },
  read: { en: 'The complaint was read', uz: 'Shikoyat oʻqildi', ru: 'Жалоба прочитана' },
  records: { en: 'FeeGuard checked the bank’s records', uz: 'FeeGuard bank yozuvlarini tekshirdi', ru: 'FeeGuard проверил записи банка' },
  verdict: { en: 'Verdict', uz: 'Xulosa', ru: 'Вывод' },
  others: { en: 'Others with the same mistake', uz: 'Xuddi shu xato tekkan boshqalar', ru: 'Другие с той же ошибкой' },
  cause: { en: 'Likely cause in the bank', uz: 'Bankdagi ehtimoliy sabab', ru: 'Вероятная причина в банке' },
  letter: { en: 'Reply to the customer', uz: 'Mijozga javob', ru: 'Ответ клиенту' },
  audit: { en: 'Written to the audit log', uz: 'Audit jurnaliga yozildi', ru: 'Записано в журнал аудита' },
}

const HOW: Record<StepKey, Words> = {
  received: {
    en: 'The demo bank stores it. FeeGuard only reads the bank, through one read-only connection.',
    uz: 'Uni demo bank saqlaydi. FeeGuard bankni faqat oʻqiydi, bitta faqat-oʻqish ulanishi orqali.',
    ru: 'Её хранит демо-банк. FeeGuard только читает банк, через одно подключение только для чтения.',
  },
  read: {
    en: 'The AI fills a fixed form; amounts are read by code. If it takes more than 8 s or fails, simple rules read the words.',
    uz: 'Sunʼiy intellekt qatʼiy shaklni toʻldiradi; summalarni kod oʻqiydi. 8 soniyadan oshsa yoki xato boʻlsa, soʻzlarni oddiy qoidalar oʻqiydi.',
    ru: 'ИИ заполняет строгую форму; суммы читает код. Если это длится дольше 8 с или не удаётся, слова читают простые правила.',
  },
  records: {
    en: 'The schedule, card debits, payments and charges, matched day by day. Four checks, each tested on its look-alike case.',
    uz: 'Jadval, kartadan yechimlar, toʻlovlar va undirmalar kunma-kun solishtiriladi. Toʻrtta tekshiruv, har biri oʻziga oʻxshash holatda sinalgan.',
    ru: 'График, списания с карт, платежи и начисления сверяются по дням. Четыре проверки, каждая испытана на похожем, но верном случае.',
  },
  verdict: {
    en: 'Decided by a table in code. The AI never decides and never counts money.',
    uz: 'Koddagi jadval hal qiladi. Sunʼiy intellekt hech qachon qaror qilmaydi va pul hisoblamaydi.',
    ru: 'Решает таблица в коде. ИИ никогда не решает и не считает деньги.',
  },
  others: {
    en: 'The same check runs over every loan of the bank, so customers who never complained are found too.',
    uz: 'Xuddi shu tekshiruv bankning har bir krediti boʻyicha ishlaydi, shuning uchun shikoyat qilmaganlar ham topiladi.',
    ru: 'Та же проверка проходит по каждому кредиту банка, поэтому находятся и те, кто не жаловался.',
  },
  cause: {
    en: 'The affected loans are compared with all loans: which billing run, channel, tariff or product they share.',
    uz: 'Zarar koʻrgan kreditlar barcha kreditlar bilan solishtiriladi: qaysi hisob-kitob jarayoni, kanal, tarif yoki mahsulot umumiy.',
    ru: 'Пострадавшие кредиты сравниваются со всеми: какой прогон списаний, канал, тариф или продукт у них общий.',
  },
  letter: {
    en: 'The AI may reword the standard letter. Code checks every number and the language; if one changed, the standard letter stays.',
    uz: 'Sunʼiy intellekt standart xatni qayta yozishi mumkin. Kod har bir raqam va tilni tekshiradi; biri oʻzgarsa, standart xat qoladi.',
    ru: 'ИИ может переписать стандартное письмо. Код проверяет каждое число и язык; если что-то изменилось, остаётся стандартное.',
  },
  audit: {
    en: 'Each entry carries the code of the one before it, so a changed entry breaks the chain.',
    uz: 'Har bir yozuv oʻzidan oldingisining kodini saqlaydi, shuning uchun oʻzgartirilgan yozuv zanjirni uzadi.',
    ru: 'Каждая запись хранит код предыдущей, поэтому изменённая запись разрывает цепочку.',
  },
}

interface Run {
  state: Record<StepKey, State>
  took: Partial<Record<StepKey, number>>
  result?: CaseResult
  scan?: ScanResult
  letter?: DraftReply
  error?: Error
}

function fresh(): Run {
  const state = Object.fromEntries(ORDER.map((key) => [key, 'waiting'])) as Record<StepKey, State>
  return { state: { ...state, received: 'done', read: 'running', records: 'running', verdict: 'running' }, took: {} }
}

export function LiveRun({ complaintId }: { complaintId: string }) {
  const { t, say } = useLang()
  const { health } = useSession()
  const problemText = useProblemText()
  const [run, setRun] = useState<Run>(fresh)
  const [now, setNow] = useState(() => performance.now())
  const started = useRef<string | null>(null)
  const since = useRef(performance.now())
  const box = useRef<HTMLElement>(null)

  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [complaintId])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    // Once per complaint, also under React's double start in development.
    if (started.current === complaintId) return
    started.current = complaintId
    setRun(fresh())
    const update = (change: (run: Run) => Run) => setRun((current) => change(current))
    const mark = (keys: StepKey[], state: State, took?: number) =>
      update((current) => ({
        ...current,
        state: { ...current.state, ...Object.fromEntries(keys.map((key) => [key, state])) },
        took: took === undefined ? current.took : { ...current.took, ...Object.fromEntries(keys.map((key) => [key, took])) },
      }))

    async function go() {
      let clock = performance.now()
      since.current = clock
      let result: CaseResult
      try {
        result = await api.investigate(complaintId)
      } catch (failure) {
        mark(['read', 'records', 'verdict'], 'failed')
        mark(['others', 'cause', 'letter', 'audit'], 'skipped')
        update((current) => ({ ...current, error: failure as Error }))
        return
      }
      update((current) => ({ ...current, result }))
      mark(['read', 'records', 'verdict', 'audit'], 'done', performance.now() - clock)

      const first = result.findings[0]
      if (first) {
        mark(['others', 'cause'], 'running')
        clock = performance.now()
        since.current = clock
        try {
          const scan = await api.scan(first.finding_id)
          update((current) => ({ ...current, scan }))
          mark(['others'], 'done', performance.now() - clock)
          mark(['cause'], scan.cause ? 'done' : 'skipped', performance.now() - clock)
        } catch {
          mark(['others', 'cause'], 'failed')
        }
      } else {
        mark(['others', 'cause'], 'skipped')
      }

      if (result.verdict === 'SUPPORTED' || result.verdict === 'NOT_SUPPORTED') {
        mark(['letter'], 'running')
        clock = performance.now()
        since.current = clock
        try {
          const letter = await api.improveDraft(result.case_id)
          update((current) => ({ ...current, letter }))
          mark(['letter'], 'done', performance.now() - clock)
        } catch {
          mark(['letter'], 'failed')
        }
      } else {
        mark(['letter'], 'skipped')
      }
    }
    void go()
  }, [complaintId])

  const { state, took, result, scan, letter } = run
  const running = (key: StepKey) => state[key] === 'running'
  const gemini = health?.model_name?.toLowerCase().startsWith('gemini')
  const by = result?.understood.mode === 'llm'
    ? `${t({ en: 'the AI', uz: 'sunʼiy intellekt', ru: 'ИИ' })}${gemini ? ' (Gemini)' : ''}`
    : health?.llm_mode === 'llm'
      ? t({ en: 'simple rules: the AI did not answer in time', uz: 'oddiy qoidalar: sunʼiy intellekt vaqtida javob bermadi', ru: 'простые правила: ИИ не ответил вовремя' })
      : t({ en: 'simple rules: the AI is not set up here', uz: 'oddiy qoidalar: bu yerda sunʼiy intellekt ulanmagan', ru: 'простые правила: ИИ здесь не подключён' })
  const installments = result?.timelines.reduce((sum, line) => sum + line.rows.length, 0) ?? 0
  const loans = result?.timelines.map((line) => line.contract_id).join(', ')
  const none = { en: 'not stated', uz: 'koʻrsatilmagan', ru: 'не указано' }

  function body(key: StepKey) {
    if (state[key] === 'failed') return <p>{t({ en: 'This step failed.', uz: 'Bu qadam bajarilmadi.', ru: 'Шаг не выполнен.' })} {run.error ? problemText(run.error) : ''}</p>
    switch (key) {
      case 'received':
        return <p>{t({ en: 'Complaint', uz: 'Shikoyat', ru: 'Жалоба' })} <b className="id">{complaintId}</b></p>
      case 'read':
        return result && (
          <>
            <p>{t({ en: 'Read by', uz: 'Oʻqidi:', ru: 'Прочитал:' })} <b>{by}</b> · {t({ en: 'language', uz: 'til', ru: 'язык' })}: <b>{t(LANGUAGE[result.complaint.lang])}</b></p>
            <p>{t({ en: 'Problem', uz: 'Muammo', ru: 'Проблема' })}: <b>{t(CLAIM[result.understood.claim_type])}</b> · {t({ en: 'month', uz: 'oy', ru: 'месяц' })}: <b>{result.understood.period ? formatMonth(result.understood.period) : t(none)}</b> · {t({ en: 'amount', uz: 'summa', ru: 'сумма' })}: <b>{result.understood.claimed_excess !== null ? <Som n={result.understood.claimed_excess} /> : t(none)}</b></p>
          </>
        )
      case 'records':
        return result && (
          <>
            <p>{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <b className="id">{loans || '—'}</b>, {formatDate(result.window.date_from)} – {formatDate(result.window.date_to)} · <b>{formatNumber(installments)}</b> {t({ en: 'installments matched against debits, payments and charges', uz: 'ta toʻlov yechimlar, toʻlovlar va undirmalar bilan solishtirildi', ru: 'платежей по графику сверено со списаниями, оплатами и начислениями' })}</p>
            <p>{t({ en: 'Mistakes found', uz: 'Topilgan xatolar', ru: 'Найдено ошибок' })}: <b>{result.findings.length}</b> · {t({ en: 'checked and correct', uz: 'tekshirildi va toʻgʻri', ru: 'проверено и верно' })}: <b>{result.cleared.length}</b> · {t({ en: 'server time', uz: 'server vaqti', ru: 'время сервера' })}: <b>{formatSeconds(result.elapsed_ms)}</b></p>
          </>
        )
      case 'verdict':
        return result && (
          <>
            <p><span className="stamp land" style={{ margin: '4px 0 8px' }}>{t(VERDICT[result.verdict])}</span></p>
            <p><Figures text={say(result.verdict_reason, result.verdict_reason_t)} /></p>
            {result.total_excess > 0 && <p>{t({ en: 'To return to the customer', uz: 'Mijozga qaytariladi', ru: 'Вернуть клиенту' })}: <b className="wrong"><Som n={result.total_excess} /></b></p>}
          </>
        )
      case 'others':
        if (state.others === 'skipped') return <p>{t({ en: 'No mistake was found, so there is nothing to look for.', uz: 'Xato topilmadi, qidiradigan narsa yoʻq.', ru: 'Ошибка не найдена, искать нечего.' })}</p>
        return scan && (
          <p><b>{countOf(scan.affected_customers, CUSTOMER)}</b> {t({ en: 'with the same mistake', uz: 'da xuddi shu xato', ru: 'с той же ошибкой' })} · <b>{formatNumber(scan.silent)}</b> {t({ en: 'never complained', uz: 'tasi shikoyat qilmagan', ru: 'не жаловались' })} · {t({ en: 'to return', uz: 'qaytariladi', ru: 'к возврату' })}: <b className="wrong"><Som n={scan.total_excess} /></b> · {t({ en: 'whole bank in', uz: 'butun bank:', ru: 'весь банк за' })} <b>{formatSeconds(scan.elapsed_ms, 2)}</b></p>
        )
      case 'cause':
        if (state.cause === 'skipped') return <p>{t({ en: 'Too few cases to name a cause.', uz: 'Sababni aytish uchun holatlar kam.', ru: 'Слишком мало случаев, чтобы назвать причину.' })}</p>
        return scan?.cause && <p><Figures text={say(scan.cause.sentence, scan.cause.sentence_t)} /></p>
      case 'letter':
        if (state.letter === 'skipped') return <p>{t({ en: 'This verdict needs a person first; no reply is drafted.', uz: 'Bu xulosani avval inson koʻradi; javob tayyorlanmaydi.', ru: 'Такой вывод сначала смотрит человек; ответ не готовится.' })}</p>
        return letter && (
          <>
            <p>{letter.source === 'llm'
              ? t({ en: 'Reworded by the AI; every number and the language passed the check.', uz: 'Sunʼiy intellekt qayta yozdi; barcha raqamlar va til tekshiruvdan oʻtdi.', ru: 'Переписано ИИ; все числа и язык прошли проверку.' })
              : t({ en: 'The standard letter: the AI is off, or it changed a number.', uz: 'Standart xat: sunʼiy intellekt oʻchiq yoki raqamni oʻzgartirdi.', ru: 'Стандартное письмо: ИИ выключен или изменил число.' })}</p>
            <blockquote lang={LANG_ATTR[letter.lang]} className="letter-mini">{letter.text}</blockquote>
          </>
        )
      case 'audit':
        return result && <p>{t({ en: 'Entry', uz: 'Yozuv', ru: 'Запись' })} <b className="id">{result.audit_id}</b>. {t({ en: 'A person still approves or rejects the result.', uz: 'Natijani baribir inson tasdiqlaydi yoki rad etadi.', ru: 'Результат всё равно одобряет или отклоняет человек.' })}</p>
    }
  }

  return (
    <section ref={box} aria-live="polite" className="panel run" style={{ scrollMarginTop: 'calc(var(--bar) + 16px)' }}>
      <div className="panel__bar"><b>{t({ en: 'FeeGuard at work, live', uz: 'FeeGuard ishlamoqda, jonli', ru: 'FeeGuard в работе, вживую' })}</b><span>{t({ en: 'Each step is a real answer from the server', uz: 'Har bir qadam — serverning haqiqiy javobi', ru: 'Каждый шаг — настоящий ответ сервера' })}</span></div>
      <ol>
        {ORDER.map((key, index) => (
          <li key={key} className={`step ${state[key]}`}>
            <span className="dot" aria-hidden="true" />
            <b>{index + 1}. {t(TITLE[key])}</b>
            <span className="time">{running(key) ? `${formatSeconds(now - since.current)}…` : took[key] !== undefined && state[key] === 'done' ? formatSeconds(took[key] ?? 0) : ''}</span>
            {state[key] !== 'waiting' && !running(key) && <div className="body">{body(key)}</div>}
            <p className="how">{t(HOW[key])}</p>
          </li>
        ))}
      </ol>
      {result && (
        <div className="row-acts" style={{ padding: '12px 6px 4px' }}>
          <Link className="btn" to={`/app/case/${encodeURIComponent(complaintId)}`}>{t({ en: 'Open the complaint in FeeGuard', uz: 'Shikoyatni FeeGuardda ochish', ru: 'Открыть жалобу в FeeGuard' })} <span className="arrow">→</span></Link>
          {result.findings[0] && <Link className="btn btn--quiet" to={`/app/others/${encodeURIComponent(result.findings[0].finding_id)}`}>{t({ en: 'See everyone it hit', uz: 'U tekkan hammani koʻrish', ru: 'Посмотреть всех, кого задело' })}</Link>}
          <Link className="btn btn--quiet" to="/app/audit">{t({ en: 'Audit log', uz: 'Audit jurnali', ru: 'Журнал аудита' })}</Link>
        </div>
      )}
    </section>
  )
}
