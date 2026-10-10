// The six small marks of DESIGN section 9, drawn by us. No icon library.
// A mark takes the colour of its text. It never carries a meaning alone:
// a word always stands next to it.

import type { ReactElement } from 'react'

export type MarkKind = 'taken' | 'recorded' | 'charged' | 'tick' | 'cross' | 'exclamation'

const SHAPES: Record<MarkKind, ReactElement> = {
  taken: <circle cx="6" cy="6" r="4.5" fill="currentColor" />,
  recorded: <circle cx="6" cy="6" r="3.75" fill="none" stroke="currentColor" strokeWidth="1.5" />,
  charged: <path d="M6 1.5 11 10.5H1Z" fill="currentColor" />,
  tick: <path d="M1.5 6.5 4.5 9.5 10.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.75" />,
  cross: <path d="M2 2 10 10M10 2 2 10" fill="none" stroke="currentColor" strokeWidth="1.75" />,
  exclamation: (
    <>
      <path d="M6 1.5v6" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="6" cy="10" r="1.2" fill="currentColor" />
    </>
  ),
}

export function Mark({ kind, className = '' }: { kind: MarkKind; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      {SHAPES[kind]}
    </svg>
  )
}
