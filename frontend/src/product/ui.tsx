// The small parts every product screen uses (V2_PLAN W1.4): figures, the page head, the
// waiting, empty and problem states, the state of a complaint and the steps of an incident.

import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { ApiError } from '../api'
import { somWord } from '../format'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import type { Complaint, IncidentStatus } from '../types'
import { VERDICT } from '../words'

// --- Figures --------------------------------------------------------------------------------

export const groupsOf = (n: number) => String(Math.trunc(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ')

/** 1011781585 -> 1 011 781 585: the gaps are drawn, so the number copies as one. */
export function Num({ n }: { n: number }) {
  return <span className="grp">{n < 0 && '−'}{groupsOf(n).map((g, i) => <span key={i} className="g">{g}</span>)}</span>
}

/** An amount with its currency, small after it. */
export function Som({ n, className = '' }: { n: number; className?: string }) {
  return <span className={`num ${className}`}><Num n={n} /><span className="cur">{somWord()}</span></span>
}

/** A big amount whose digit groups rise into place. It never counts up. */
export function Rise({ n, cur = true }: { n: number; cur?: boolean }) {
  const groups = groupsOf(n)
  return (
    <span className="rise num" aria-label={`${n}${cur ? ` ${somWord()}` : ''}`}>
      {groups.map((g, i) => <span key={i} className="mask" aria-hidden="true"><span style={{ '--i': i } as CSSProperties}>{g}</span></span>)}
      {cur && <span className="mask cur" aria-hidden="true"><span style={{ '--i': groups.length } as CSSProperties}>{somWord()}</span></span>}
    </span>
  )
}

/** A server sentence with its amounts set as the page's figures. */
export function Figures({ text }: { text: string }) {
  const pieces = text.split(/(\d{1,3}(?:[   ]\d{3})+)/)
  return <>{pieces.map((piece, i) => (i % 2 ? <span key={i} className="num"><Num n={Number(piece.replace(/\D/g, ''))} /></span> : piece))}</>
}

// --- The page head ----------------------------------------------------------------------------

export function Head({ title, sentence, children, back }: { title: ReactNode; sentence?: ReactNode; children?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <header className="head enter">
      <div>
        {back && <Link className="back" to={back.to}>← {back.label}</Link>}
        <h1 className="h-big" style={back ? { marginTop: 14 } : undefined}>{title}</h1>
        {sentence && <p className="sub">{sentence}</p>}
      </div>
      {children}
    </header>
  )
}

// --- Waiting, nothing, a problem --------------------------------------------------------------

export function Loading({ words, lines = 4 }: { words?: string; lines?: number }) {
  const { t } = useLang()
  return (
    <div className="skel" role="status" aria-live="polite">
      <p>{words ?? t({ en: 'Loading…', uz: 'Yuklanmoqda…', ru: 'Загрузка…' })}</p>
      {Array.from({ length: lines }, (_, i) => <i key={i} style={{ width: `${88 - i * 13}%` }} />)}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

// What a person reads when the server refuses, by its error code. Any other code shows the
// server's own sentence. Red is never used here: red is only for money taken wrongly.
const PROBLEMS: Record<string, Words> = {
  NO_ANSWER: { en: 'The server did not answer. Check the connection and try again.', uz: 'Server javob bermadi. Ulanishni tekshirib, qayta urinib koʻring.', ru: 'Сервер не ответил. Проверьте подключение и попробуйте снова.' },
  BUSY: { en: 'Another demo bank is being built. Try again in a moment.', uz: 'Boshqa demo bank yaratilmoqda. Birozdan keyin qayta urinib koʻring.', ru: 'Сейчас создаётся другой демо-банк. Попробуйте чуть позже.' },
  BUILDING: { en: 'This demo bank is still being built. Wait a moment.', uz: 'Bu demo bank hali yaratilmoqda. Biroz kuting.', ru: 'Этот демо-банк ещё создаётся. Подождите немного.' },
  NO_DEMO_BANK: { en: 'This demo bank does not exist any more. Choose another one in Demo tools at the top.', uz: 'Bu demo bank endi mavjud emas. Yuqoridagi “Demo vositalari”dan boshqasini tanlang.', ru: 'Этого демо-банка больше нет. Выберите другой в «Демо-инструментах» вверху.' },
  DEFAULT_BANK: { en: 'The main demo bank stays as it was built, so every visitor sees the same numbers. Build your own demo bank and add the debit there.', uz: 'Asosiy demo bank oʻzgarmaydi, shunda har bir tashrif buyuruvchi bir xil raqamlarni koʻradi. Oʻz demo bankingizni yarating va yechimni oʻsha yerda qoʻshing.', ru: 'Основной демо-банк не меняется, чтобы все видели одни и те же цифры. Создайте свой демо-банк и добавьте списание там.' },
  PRESET_BANK: { en: 'A public-case demo bank stays as it was built. Build your own demo bank and add the debit there.', uz: 'Ommaviy holat demo banki oʻzgarmaydi. Oʻz demo bankingizni yarating va yechimni oʻsha yerda qoʻshing.', ru: 'Демо-банк публичного случая не меняется. Создайте свой демо-банк и добавьте списание там.' },
  ALREADY_DECIDED: { en: 'A person has already decided this complaint.', uz: 'Bu shikoyat boʻyicha allaqachon qaror qabul qilingan.', ru: 'По этой жалобе уже принято решение.' },
  FOUR_EYES: { en: 'The person who proposed the refund cannot approve it. In Demo tools at the top, act as the compliance head.', uz: 'Qaytarishni taklif qilgan xodim uni tasdiqlay olmaydi. Yuqoridagi “Demo vositalari”da komplayens rahbari sifatida ishlang.', ru: 'Тот, кто предложил возврат, не может его утвердить. В «Демо-инструментах» вверху выберите руководителя комплаенса.' },
  WRONG_ROLE: { en: 'A complaints officer proposes the refund; the compliance head approves it. Change who you act as in Demo tools at the top.', uz: 'Qaytarishni shikoyatlar xodimi taklif qiladi, komplayens rahbari tasdiqlaydi. Rolni yuqoridagi “Demo vositalari”da oʻzgartiring.', ru: 'Возврат предлагает сотрудник по жалобам, утверждает руководитель комплаенса. Смените роль в «Демо-инструментах» вверху.' },
  NOT_PROPOSED: { en: 'A complaints officer must propose the refund first.', uz: 'Avval shikoyatlar xodimi qaytarishni taklif qilishi kerak.', ru: 'Сначала сотрудник по жалобам должен предложить возврат.' },
  ALREADY_PROPOSED: { en: 'The refund is proposed already. The compliance head approves it next.', uz: 'Qaytarish allaqachon taklif qilingan. Endi komplayens rahbari tasdiqlaydi.', ru: 'Возврат уже предложен. Теперь его утверждает руководитель комплаенса.' },
  NOTHING_WAITING: { en: 'Every affected customer is already in an approved refund.', uz: 'Barcha zarar koʻrgan mijozlar allaqachon tasdiqlangan qaytarishga kiritilgan.', ru: 'Все пострадавшие клиенты уже включены в утверждённый возврат.' },
  NOTHING_TO_SEND: { en: 'No approved customer is waiting for a message. Approve the refund first.', uz: 'Xabar kutayotgan tasdiqlangan mijoz yoʻq. Avval qaytarishni tasdiqlang.', ru: 'Нет утверждённых клиентов, ждущих сообщения. Сначала утвердите возврат.' },
  RATE_LIMITED: { en: 'Too many requests at once. Wait a moment and try again.', uz: 'Bir vaqtda juda koʻp soʻrov. Biroz kutib, qayta urinib koʻring.', ru: 'Слишком много запросов. Подождите немного и попробуйте снова.' },
  NOT_FOUND: { en: 'This was not found in the open demo bank.', uz: 'Bu ochiq demo bankda topilmadi.', ru: 'В открытом демо-банке этого нет.' },
}

export function useProblemText(): (error: Error) => string {
  const { t } = useLang()
  return (error: Error) => {
    const known = error instanceof ApiError ? PROBLEMS[error.code] : undefined
    return known ? t(known) : error.message
  }
}

export function Problem({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useLang()
  const text = useProblemText()
  return (
    <div className="problem" role="alert">
      <p>{text(error)}</p>
      {onRetry && <button type="button" className="btn btn--small" onClick={onRetry}>{t({ en: 'Try again', uz: 'Qayta urinish', ru: 'Попробовать снова' })}</button>}
    </div>
  )
}

// --- The state of a complaint: a dot carries the meaning, the words say it --------------------

export function useComplaintState() {
  const { t } = useLang()
  return (complaint: Complaint): { cls: string; label: string } => {
    if (complaint.status === 'NEW') return { cls: 'state--new', label: t({ en: 'Not checked yet', uz: 'Hali tekshirilmagan', ru: 'Ещё не проверена' }) }
    if (complaint.status !== 'CHECKED') {
      const done: Record<string, Words> = {
        CONFIRMED: { en: 'Reply approved', uz: 'Javob tasdiqlandi', ru: 'Ответ одобрен' },
        CORRECTED: { en: 'Verdict corrected', uz: 'Xulosa tuzatildi', ru: 'Вывод исправлен' },
        DISMISSED: { en: 'Verdict rejected', uz: 'Xulosa rad etildi', ru: 'Вывод отклонён' },
      }
      return { cls: 'state--done', label: t(done[complaint.status]) }
    }
    if (complaint.verdict === 'SUPPORTED') return { cls: 'state--right', label: t(VERDICT.SUPPORTED) }
    return { cls: '', label: complaint.verdict ? t(VERDICT[complaint.verdict]) : '' }
  }
}

// --- The steps of an incident: found, proposed, approved, told -------------------------------

const STEPS: [IncidentStatus, Words][] = [
  ['OPEN', { en: 'Found', uz: 'Topildi', ru: 'Найдено' }],
  ['PROPOSED', { en: 'Refund proposed', uz: 'Qaytarish taklif qilindi', ru: 'Возврат предложен' }],
  ['APPROVED', { en: 'Approved', uz: 'Tasdiqlandi', ru: 'Утверждено' }],
  ['NOTIFIED', { en: 'Customers told', uz: 'Mijozlarga xabar berildi', ru: 'Клиенты уведомлены' }],
]

export function Pipe({ status }: { status: IncidentStatus }) {
  const { t } = useLang()
  const at = STEPS.findIndex(([key]) => key === status)
  return (
    <ol className="pipe" aria-label={t({ en: 'Where it is', uz: 'Qaysi bosqichda', ru: 'На каком этапе' })}>
      {STEPS.map(([key, words], i) => <li key={key} className={i <= at ? 'done' : ''}><i />{t(words)}</li>)}
    </ol>
  )
}

/** The mark: one payment, then the same payment again, in red. */
export function Mark() {
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
      <line x1="5" y1="5" x2="21" y2="5" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.5" />
      <circle className="d2" cx="21" cy="5" r="4" />
      <circle className="d1" cx="5" cy="5" r="4" />
    </svg>
  )
}

export const SEARCH_ICON = (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
)

/** Today in the visitor's calendar, as "YYYY-MM-DD", for "waiting 4 days". */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
