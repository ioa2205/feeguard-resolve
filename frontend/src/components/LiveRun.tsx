// The live run (DECISIONS D-038): right after a customer sends a complaint, FeeGuard
// works on it in front of the jury. Every step is a real call to the API and turns
// done only when the server answers; the time shown is measured in this browser.
// Each step names the part of the system that did the work.

import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { formatDate, formatMonth, formatNumber, formatSom } from '../format'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { CaseResult, ClaimType, DraftReply, Lang, ScanResult, Verdict } from '../types'
import { LANG_ATTR } from '../words'
import { Label } from './Parts'

type State = 'waiting' | 'running' | 'done' | 'skipped' | 'failed'
type StepKey = 'received' | 'read' | 'records' | 'verdict' | 'others' | 'cause' | 'letter' | 'audit'

const ORDER: StepKey[] = ['received', 'read', 'records', 'verdict', 'others', 'cause', 'letter', 'audit']

const TITLE: Record<StepKey, Words> = {
  received: { en: 'The bank registered the complaint', uz: 'Bank shikoyatni roʻyxatga oldi', ru: 'Банк зарегистрировал жалобу' },
  read: { en: 'The AI read the complaint', uz: 'Sunʼiy intellekt shikoyatni oʻqidi', ru: 'ИИ прочитал жалобу' },
  records: { en: 'FeeGuard checked the bank’s records', uz: 'FeeGuard bank yozuvlarini tekshirdi', ru: 'FeeGuard проверил записи банка' },
  verdict: { en: 'Verdict', uz: 'Xulosa', ru: 'Вывод' },
  others: { en: 'Others with the same mistake', uz: 'Xuddi shu xato boʻlgan boshqalar', ru: 'Другие с той же ошибкой' },
  cause: { en: 'Likely cause in the bank', uz: 'Bankdagi ehtimoliy sabab', ru: 'Вероятная причина в банке' },
  letter: { en: 'Reply letter to the customer', uz: 'Mijozga javob xati', ru: 'Ответное письмо клиенту' },
  audit: { en: 'Written to the audit log', uz: 'Audit jurnaliga yozildi', ru: 'Записано в журнал аудита' },
}

const HOW: Record<StepKey, Words> = {
  received: {
    en: 'Sandbox Bank stores it. FeeGuard only reads the bank, through one read-only connector.',
    uz: 'Sinov banki uni saqlaydi. FeeGuard bankni faqat oʻqiydi, bitta faqat-oʻqish ulagichi orqali.',
    ru: 'Тестовый банк хранит её. FeeGuard только читает банк, через один коннектор только для чтения.',
  },
  read: {
    en: 'One AI module. Its answer must fit a fixed form; amounts are read by code. Over 8 s or a failure: rules read it.',
    uz: 'Bitta SI moduli. Javob qatʼiy shaklga mos boʻlishi shart; summalarni kod oʻqiydi. 8 soniyadan oshsa yoki xato boʻlsa: qoidalar oʻqiydi.',
    ru: 'Один модуль ИИ. Ответ должен соответствовать строгой форме; суммы читает код. Дольше 8 с или сбой: читают правила.',
  },
  records: {
    en: 'Schedule, card debits, payments and charges, matched day by day. Four checkers, each tested on its look-alike trap.',
    uz: 'Jadval, kartadan yechimlar, toʻlovlar va undirmalar kunma-kun solishtiriladi. Toʻrt tekshiruvchi, har biri oʻz tuzogʻida sinalgan.',
    ru: 'График, списания с карт, платежи и начисления сверяются по дням. Четыре проверки, каждая испытана на своей ловушке.',
  },
  verdict: {
    en: 'Decided by a verdict table in code. The AI never decides and never counts money.',
    uz: 'Koddagi xulosa jadvali hal qiladi. SI hech qachon qaror qilmaydi va pul hisoblamaydi.',
    ru: 'Решает таблица вердиктов в коде. ИИ никогда не решает и не считает деньги.',
  },
  others: {
    en: 'The same checker runs over every loan of the bank, so customers who never complained are found too.',
    uz: 'Xuddi shu tekshiruvchi bankning har bir krediti boʻyicha ishlaydi, shikoyat qilmaganlar ham topiladi.',
    ru: 'Та же проверка проходит по каждому кредиту банка, поэтому находятся и те, кто не жаловался.',
  },
  cause: {
    en: 'Compares the wronged loans with all loans: which billing run, channel, tariff or product they share.',
    uz: 'Zarar koʻrgan kreditlarni barcha kreditlar bilan solishtiradi: qaysi hisob-kitob, kanal, tarif yoki mahsulot umumiy.',
    ru: 'Сравнивает пострадавшие кредиты со всеми: какой прогон списаний, канал, тариф или продукт у них общий.',
  },
  letter: {
    en: 'The AI may reword the standard letter. Code checks every number and the language; if one changed, the standard letter stays.',
    uz: 'SI standart xatni qayta ifodalashi mumkin. Kod har bir raqam va tilni tekshiradi; biri oʻzgarsa, standart xat qoladi.',
    ru: 'ИИ может переформулировать стандартное письмо. Код проверяет каждое число и язык; если что-то изменилось, остаётся стандартное.',
  },
  audit: {
    en: 'Each entry carries the hash of the one before, so a changed entry breaks the chain.',
    uz: 'Har bir yozuv oldingisining xeshini saqlaydi, oʻzgartirilgan yozuv zanjirni buzadi.',
    ru: 'Каждая запись хранит хеш предыдущей, поэтому изменённая запись ломает цепочку.',
  },
}

const VERDICT_T: Record<Verdict, Words> = {
  SUPPORTED: { en: 'Customer is right', uz: 'Mijoz haq', ru: 'Клиент прав' },
  NOT_SUPPORTED: { en: 'Bank was right', uz: 'Bank haq edi', ru: 'Банк был прав' },
  NEEDS_INFO: { en: 'More information needed', uz: 'Qoʻshimcha maʼlumot kerak', ru: 'Нужна дополнительная информация' },
  OUT_OF_SCOPE: { en: 'Not one of the four checks', uz: 'Toʻrt tekshiruvga kirmaydi', ru: 'Не входит в четыре проверки' },
}

const CLAIM_T: Record<ClaimType, Words> = {
  DOUBLE_DEBIT: { en: 'Taken twice', uz: 'Ikki marta yechilgan', ru: 'Списано дважды' },
  EARLY_DEBIT: { en: 'Taken early', uz: 'Muddatidan oldin yechilgan', ru: 'Списано раньше срока' },
  LATE_POSTING: { en: 'Recorded late, then fined', uz: 'Kech qayd etilib, jarima solingan', ru: 'Зачислено поздно, затем штраф' },
  ILLEGAL_FEE: { en: 'Fee not allowed', uz: 'Ruxsat etilmagan komissiya', ru: 'Недопустимая комиссия' },
  OTHER: { en: 'Something else', uz: 'Boshqa masala', ru: 'Другое' },
}

const LANG_T: Record<Lang, Words> = {
  uz_latn: { en: 'Uzbek, Latin script', uz: 'oʻzbekcha, lotin yozuvi', ru: 'узбекский, латиница' },
  uz_cyrl: { en: 'Uzbek, Cyrillic script', uz: 'oʻzbekcha, kirill yozuvi', ru: 'узбекский, кириллица' },
  ru: { en: 'Russian', uz: 'ruscha', ru: 'русский' },
  mixed: { en: 'Uzbek and Russian, mixed', uz: 'oʻzbekcha va ruscha aralash', ru: 'узбекский и русский вперемешку' },
}

const MARK: Record<State, string> = { waiting: '○', running: '◐', done: '●', skipped: '–', failed: '!' }

interface Run {
  state: Record<StepKey, State>
  took: Partial<Record<StepKey, number>>
  result?: CaseResult
  scan?: ScanResult
  letter?: DraftReply
  error?: string
}

function fresh(): Run {
  const state = Object.fromEntries(ORDER.map((key) => [key, 'waiting'])) as Record<StepKey, State>
  return { state: { ...state, received: 'done', read: 'running', records: 'running', verdict: 'running' }, took: {} }
}

export function LiveRun({ complaintId, text }: { complaintId: string; text: string }) {
  const { t } = useLang()
  const { health } = useSession()
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
        update((current) => ({ ...current, error: (failure as Error).message }))
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
  const seconds = (ms: number | undefined) => (ms === undefined ? '' : `${(ms / 1000).toFixed(1)} s`)
  const running = (key: StepKey) => state[key] === 'running'
  const by = result?.understood.mode === 'llm'
    ? `${t({ en: 'the AI', uz: 'SI', ru: 'ИИ' })}${health?.model_name ? ` (${health.model_name})` : ''}`
    : t({ en: 'rules (the AI did not answer in time)', uz: 'qoidalar (SI vaqtida javob bermadi)', ru: 'правила (ИИ не ответил вовремя)' })
  const installments = result?.timelines.reduce((sum, line) => sum + line.rows.length, 0) ?? 0
  const loans = result?.timelines.map((line) => line.contract_id).join(', ')

  function body(key: StepKey) {
    if (state[key] === 'failed') return <p>{t({ en: 'This step failed: ', uz: 'Bu qadam bajarilmadi: ', ru: 'Шаг не выполнен: ' })}{run.error ?? ''}</p>
    switch (key) {
      case 'received':
        return (
          <>
            <p>{t({ en: 'Complaint', uz: 'Shikoyat', ru: 'Жалоба' })} <strong>{complaintId}</strong></p>
            <blockquote className="border-line text-words mt-1 border-l-4 pl-3 font-serif">{text}</blockquote>
          </>
        )
      case 'read':
        return result && (
          <ul className="space-y-0.5">
            <li>{t({ en: 'Read by', uz: 'Oʻqidi', ru: 'Прочитал' })}: <strong>{by}</strong></li>
            <li>{t({ en: 'What the customer says', uz: 'Mijoz nima deydi', ru: 'О чём жалоба' })}: <strong>{t(CLAIM_T[result.understood.claim_type])}</strong></li>
            <li>{t({ en: 'Month', uz: 'Oy', ru: 'Месяц' })}: <strong>{result.understood.period ? formatMonth(result.understood.period) : t({ en: 'not said', uz: 'aytilmagan', ru: 'не указан' })}</strong></li>
            <li>{t({ en: 'Amount claimed', uz: 'Daʼvo qilingan summa', ru: 'Заявленная сумма' })}: <strong>{result.understood.claimed_excess !== null ? formatSom(result.understood.claimed_excess) : t({ en: 'not said', uz: 'aytilmagan', ru: 'не указана' })}</strong></li>
            <li>{t({ en: 'Language', uz: 'Til', ru: 'Язык' })}: <strong>{t(LANG_T[result.complaint.lang])}</strong></li>
          </ul>
        )
      case 'records':
        return result && (
          <ul className="space-y-0.5">
            <li>{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <strong>{loans || '—'}</strong>, {formatDate(result.window.date_from)} – {formatDate(result.window.date_to)}</li>
            <li><strong>{formatNumber(installments)}</strong> {t({ en: 'installments matched against card debits, payments and charges', uz: 'ta toʻlov kartadan yechimlar, toʻlovlar va undirmalar bilan solishtirildi', ru: 'платежей по графику сверено со списаниями, оплатами и начислениями' })}</li>
            <li>{t({ en: 'Mistakes found', uz: 'Topilgan xatolar', ru: 'Найдено ошибок' })}: <strong>{result.findings.length}</strong> · {t({ en: 'look-alikes cleared', uz: 'oʻxshash, lekin toʻgʻri holatlar', ru: 'похожих, но верных случаев' })}: <strong>{result.cleared.length}</strong></li>
            <li>{t({ en: 'Server time for reading and checking', uz: 'Oʻqish va tekshirish uchun server vaqti', ru: 'Время сервера на чтение и проверку' })}: <strong>{(result.elapsed_ms / 1000).toFixed(1)} s</strong></li>
          </ul>
        )
      case 'verdict':
        return result && (
          <>
            <p className="font-condensed text-title font-semibold uppercase">{t(VERDICT_T[result.verdict])}</p>
            <p>{result.verdict_reason}</p>
            {result.total_excess > 0 && (
              <p>{t({ en: 'To return to the customer', uz: 'Mijozga qaytarish kerak', ru: 'Вернуть клиенту' })}: <strong className="text-wrong">{formatSom(result.total_excess)}</strong></p>
            )}
          </>
        )
      case 'others':
        if (state.others === 'skipped') return <p>{t({ en: 'No mistake was found, so there is nothing to look for.', uz: 'Xato topilmadi, qidirishga hojat yoʻq.', ru: 'Ошибка не найдена, искать нечего.' })}</p>
        return scan && (
          <ul className="space-y-0.5">
            <li><strong>{formatNumber(scan.affected_customers)}</strong> {t({ en: 'customers have the same mistake', uz: 'nafar mijozda xuddi shu xato bor', ru: 'клиентов с той же ошибкой' })}</li>
            <li><strong>{formatNumber(scan.silent)}</strong> {t({ en: 'of them never complained', uz: 'nafari hech qachon shikoyat qilmagan', ru: 'из них никогда не жаловались' })}</li>
            <li>{t({ en: 'To return in total', uz: 'Jami qaytarish kerak', ru: 'Всего вернуть' })}: <strong className="text-wrong">{formatSom(scan.total_excess)}</strong></li>
            <li>{t({ en: 'Server time for the whole bank', uz: 'Butun bank uchun server vaqti', ru: 'Время сервера на весь банк' })}: <strong>{(scan.elapsed_ms / 1000).toFixed(2)} s</strong></li>
          </ul>
        )
      case 'cause':
        if (state.cause === 'skipped') return <p>{t({ en: 'Too few cases to name a cause.', uz: 'Sababni aytish uchun holatlar kam.', ru: 'Слишком мало случаев, чтобы назвать причину.' })}</p>
        return scan?.cause && (
          <>
            <p><strong>{scan.cause.sentence}</strong></p>
            {scan.cause.suggested_fix && <p>{t({ en: 'Suggested fix', uz: 'Tavsiya etilgan tuzatish', ru: 'Предлагаемое исправление' })}: {scan.cause.suggested_fix}</p>}
          </>
        )
      case 'letter':
        if (state.letter === 'skipped') return <p>{t({ en: 'This verdict needs a person first; no letter yet.', uz: 'Bu xulosa avval inson koʻrigini talab qiladi; xat hali yoʻq.', ru: 'Этот вывод сначала смотрит человек; письма пока нет.' })}</p>
        return letter && (
          <>
            <p>{letter.source === 'llm'
              ? t({ en: 'Reworded by the AI; every number and the language passed the check.', uz: 'SI qayta ifodaladi; barcha raqamlar va til tekshiruvdan oʻtdi.', ru: 'Переформулировано ИИ; все числа и язык прошли проверку.' })
              : t({ en: 'The standard letter: the AI was off or changed a number.', uz: 'Standart xat: SI oʻchiq yoki raqamni oʻzgartirdi.', ru: 'Стандартное письмо: ИИ выключен или изменил число.' })}</p>
            <blockquote lang={LANG_ATTR[letter.lang]} className="border-line text-words mt-1 max-h-60 overflow-y-auto border-l-4 pl-3 font-serif whitespace-pre-wrap">{letter.text}</blockquote>
          </>
        )
      case 'audit':
        return result && (
          <p>{t({ en: 'Entry', uz: 'Yozuv', ru: 'Запись' })} <strong>{result.audit_id}</strong>. {t({ en: 'A person still confirms or dismisses the result.', uz: 'Natijani baribir inson tasdiqlaydi yoki rad etadi.', ru: 'Результат всё равно подтверждает или отклоняет человек.' })}</p>
        )
    }
  }

  return (
    <section ref={box} aria-live="polite" className="border-ink rounded-sheet bg-sheet max-w-[90ch] border-2 p-4">
      <h2 className="border-ink mb-3 border-b-2 pb-1">
        <Label>{t({ en: 'FeeGuard at work, live', uz: 'FeeGuard ishlamoqda, jonli', ru: 'FeeGuard в работе, вживую' })}</Label>
      </h2>
      <ol className="space-y-3">
        {ORDER.map((key, index) => (
          <li key={key} className={`border-line border-l-4 pl-3 ${state[key] === 'waiting' ? 'opacity-50' : ''} ${state[key] === 'done' ? 'border-ink' : ''}`}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span aria-hidden className="font-condensed w-5">{MARK[state[key]]}</span>
              <span className="font-condensed font-semibold">{index + 1}. {t(TITLE[key])}</span>
              <span className="text-ink-soft text-small">
                {running(key) ? `${t({ en: 'working', uz: 'ishlanmoqda', ru: 'в работе' })}… ${((now - since.current) / 1000).toFixed(1)} s` : seconds(took[key])}
              </span>
            </div>
            <div className="ml-8">
              {state[key] !== 'waiting' && !running(key) && body(key)}
              <p className="text-ink-soft text-small mt-1">{t(HOW[key])}</p>
            </div>
          </li>
        ))}
      </ol>
      {result && (
        <p className="mt-4 flex flex-wrap gap-x-6">
          <Link to={`/case/${encodeURIComponent(complaintId)}`} className="text-stamp font-semibold underline">
            {t({ en: 'Open the full case with the evidence', uz: 'Dalillar bilan toʻliq ishni ochish', ru: 'Открыть всё дело с доказательствами' })}
          </Link>
          {result.findings[0] && (
            <Link to={`/scan/${encodeURIComponent(result.findings[0].finding_id)}`} className="text-stamp font-semibold underline">
              {t({ en: 'See every affected customer', uz: 'Barcha zarar koʻrgan mijozlar', ru: 'Все пострадавшие клиенты' })}
            </Link>
          )}
          <Link to="/audit" className="text-stamp font-semibold underline">{t({ en: 'Audit log', uz: 'Audit jurnali', ru: 'Журнал аудита' })}</Link>
        </p>
      )}
    </section>
  )
}
