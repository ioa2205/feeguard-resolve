// Small shared parts: the page head, the button, and the loading, empty and error states
// (DESIGN sections 9 and 10).

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { ApiError } from '../api'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { Mark } from './Marks'

// What a person reads when the server refuses, by its error code (D-041). Any other code
// shows the server's own sentence.
const PROBLEMS: Record<string, Words> = {
  NO_ANSWER: { en: 'The server did not answer. Check the connection and try again.', uz: 'Server javob bermadi. Ulanishni tekshirib, qayta urinib koʻring.', ru: 'Сервер не ответил. Проверьте подключение и попробуйте снова.' },
  BUSY: { en: 'Another demo bank is being built. Try again in a moment.', uz: 'Boshqa demo bank yaratilmoqda. Birozdan keyin qayta urinib koʻring.', ru: 'Сейчас создаётся другой демо-банк. Попробуйте чуть позже.' },
  BUILDING: { en: 'This demo bank is still being built. Wait a moment.', uz: 'Bu demo bank hali yaratilmoqda. Biroz kuting.', ru: 'Этот демо-банк ещё создаётся. Подождите немного.' },
  NO_DEMO_BANK: { en: 'This demo bank does not exist any more. Choose another one at the top.', uz: 'Bu demo bank endi mavjud emas. Yuqoridan boshqasini tanlang.', ru: 'Этого демо-банка больше нет. Выберите другой вверху.' },
  DEFAULT_BANK: { en: 'The default demo bank stays as it was built, so every visitor sees the same numbers. Build your own demo bank and add the debit there.', uz: 'Asosiy demo bank oʻzgarmaydi, shunda har bir tashrif buyuruvchi bir xil raqamlarni koʻradi. Oʻz demo bankingizni yarating va yechimni oʻsha yerda qoʻshing.', ru: 'Основной демо-банк не меняется, чтобы все видели одни и те же цифры. Создайте свой демо-банк и добавьте списание там.' },
  PRESET_BANK: { en: 'A public-case demo bank stays as it was built. Build your own demo bank and add the debit there.', uz: 'Ommaviy holat demo banki oʻzgarmaydi. Oʻz demo bankingizni yarating va yechimni oʻsha yerda qoʻshing.', ru: 'Демо-банк публичного случая не меняется. Создайте свой демо-банк и добавьте списание там.' },
  ALREADY_DECIDED: { en: 'A person has already decided this complaint.', uz: 'Bu shikoyat boʻyicha allaqachon qaror qabul qilingan.', ru: 'По этой жалобе уже принято решение.' },
  FOUR_EYES: { en: 'The person who proposed the refund cannot approve it. Switch to the compliance head at the top.', uz: 'Qaytarishni taklif qilgan xodim uni tasdiqlay olmaydi. Yuqorida komplayens rahbariga oʻting.', ru: 'Тот, кто предложил возврат, не может его утвердить. Переключитесь вверху на руководителя комплаенса.' },
  WRONG_ROLE: { en: 'A complaint officer proposes the refund; the compliance head approves it. Change the role at the top.', uz: 'Qaytarishni shikoyatlar xodimi taklif qiladi, komplayens rahbari tasdiqlaydi. Yuqorida rolni oʻzgartiring.', ru: 'Возврат предлагает сотрудник по жалобам, утверждает руководитель комплаенса. Смените роль вверху.' },
  NOT_PROPOSED: { en: 'A complaint officer must propose the refund first.', uz: 'Avval shikoyatlar xodimi qaytarishni taklif qilishi kerak.', ru: 'Сначала сотрудник по жалобам должен предложить возврат.' },
  ALREADY_PROPOSED: { en: 'The refund is proposed already. The compliance head approves it next.', uz: 'Qaytarish allaqachon taklif qilingan. Endi komplayens rahbari tasdiqlaydi.', ru: 'Возврат уже предложен. Теперь его утверждает руководитель комплаенса.' },
  NOTHING_WAITING: { en: 'Every affected customer is already in an approved refund.', uz: 'Barcha zarar koʻrgan mijozlar allaqachon tasdiqlangan qaytarishga kiritilgan.', ru: 'Все пострадавшие клиенты уже включены в утверждённый возврат.' },
  NOTHING_TO_SEND: { en: 'No approved customer is waiting for a message. Approve the refund first.', uz: 'Xabar kutayotgan tasdiqlangan mijoz yoʻq. Avval qaytarishni tasdiqlang.', ru: 'Нет утверждённых клиентов, ждущих сообщения. Сначала утвердите возврат.' },
  RATE_LIMITED: { en: 'Too many requests at once. Wait a moment and try again.', uz: 'Bir vaqtda juda koʻp soʻrov. Biroz kutib, qayta urinib koʻring.', ru: 'Слишком много запросов. Подождите немного и попробуйте снова.' },
}

/** An error in the screen's language when its code is known. */
export function useProblemText(): (error: Error) => string {
  const { t } = useLang()
  return (error: Error) => {
    const known = error instanceof ApiError ? PROBLEMS[error.code] : undefined
    return known ? t(known) : error.message
  }
}

export function PageHead({ title, sentence, children }: { title: string; sentence: string; children?: ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="font-condensed text-title leading-tight font-semibold">{title}</h1>
      <p className="max-w-[70ch]">{sentence}</p>
      {children}
    </header>
  )
}

/** Short label in condensed capitals: a column head, the name of a block. */
export function Label({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`font-condensed text-label font-semibold tracking-[0.06em] uppercase ${className}`}>
      {children}
    </span>
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The one main action of the screen. Only that one is filled. */
  main?: boolean
}

export function Button({ main = false, className = '', type = 'button', ...rest }: ButtonProps) {
  const look = main ? 'bg-ink text-sheet border-ink' : 'bg-sheet text-ink border-ink'
  return (
    <button
      type={type}
      className={`rounded-field min-h-10 border px-4 py-2 text-left font-semibold disabled:border-dashed disabled:font-normal ${look} ${className}`}
      {...rest}
    />
  )
}

/** The real layout with pale bars where the text will be. */
export function Loading({ lines = 4, words }: { lines?: number; words?: string }) {
  const { t } = useLang()
  return (
    <div role="status" aria-live="polite" className="border-line bg-sheet rounded-sheet border p-6">
      <span className="sr-only">{words ?? t({ en: 'Loading', uz: 'Yuklanmoqda', ru: 'Загрузка' })}</span>
      {words && <p className="mb-4">{words}</p>}
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="bg-stripe mb-3 h-5" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  )
}

/** What happened, what to do, and "Try again". Ink, not red: red is only for wrongly taken money. */
export function Problem({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const { t } = useLang()
  const text = useProblemText()
  return (
    <div role="alert" className="border-ink bg-sheet rounded-sheet flex max-w-[70ch] flex-wrap items-start gap-4 border-2 p-4">
      <Mark kind="exclamation" className="mt-1.5" />
      <p className="min-w-[12rem] flex-1">{text(error)}</p>
      {onRetry && <Button onClick={onRetry}>{t({ en: 'Try again', uz: 'Qayta urinish', ru: 'Попробовать снова' })}</Button>}
    </div>
  )
}

/** One sentence that points to the next step. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-line bg-sheet rounded-sheet max-w-[70ch] border p-6">{children}</p>
}
