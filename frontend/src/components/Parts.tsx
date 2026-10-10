// Small shared parts: the page head, the button, and the loading, empty and error states
// (DESIGN sections 9 and 10).

import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { Mark } from './Marks'

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
  return (
    <div role="status" aria-live="polite" className="border-line bg-sheet rounded-sheet border p-6">
      <span className="sr-only">{words ?? 'Loading'}</span>
      {words && <p className="mb-4">{words}</p>}
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className="bg-stripe mb-3 h-5" style={{ width: `${90 - index * 12}%` }} />
      ))}
    </div>
  )
}

/** What happened, what to do, and "Try again". Ink, not red: red is only for wrongly taken money. */
export function Problem({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div role="alert" className="border-ink bg-sheet rounded-sheet flex max-w-[70ch] flex-wrap items-start gap-4 border-2 p-4">
      <Mark kind="exclamation" className="mt-1.5" />
      <p className="min-w-[12rem] flex-1">{error.message}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  )
}

/** One sentence that points to the next step. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="border-line bg-sheet rounded-sheet max-w-[70ch] border p-6">{children}</p>
}
