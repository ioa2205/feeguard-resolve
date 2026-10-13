// The language of the screens: English, Uzbek (Latin) or Russian (DECISIONS D-038).
// A customer's own words and the bank's records are never translated.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { setFormatLang } from './format'

export type UiLang = 'en' | 'uz' | 'ru'
export type Words = Record<UiLang, string>

export const UI_LANGS: { code: UiLang; label: string; attr: string }[] = [
  { code: 'en', label: 'English', attr: 'en' },
  { code: 'uz', label: 'Oʻzbekcha', attr: 'uz-Latn' },
  { code: 'ru', label: 'Русский', attr: 'ru' },
]
const KEY = 'feeguard.ui-lang'

let current: UiLang = 'en'

/** The text in the screen's language, for code outside a component. A page that uses it calls
 * useLang() too, so it draws again when the language changes. */
export function tx(words: Words): string
export function tx(words: Words | undefined): string | undefined
export function tx(words: Words | undefined): string | undefined {
  return words ? words[current] : undefined
}

interface Lang {
  ui: UiLang
  setUi: (next: UiLang) => void
  /** The text in the chosen language. */
  t: (words: Words) => string
  /** A sentence the server wrote: its translation when it sent one, else the plain text. */
  say: (text: string | null | undefined, words?: Words | null) => string
}

const LangContext = createContext<Lang | null>(null)

function remembered(): UiLang {
  try {
    const value = window.localStorage.getItem(KEY)
    if (value === 'en' || value === 'uz' || value === 'ru') return value
  } catch {
    // A private window may refuse storage.
  }
  return fromBrowser()
}

/** On a first visit, the browser's own language when it is Uzbek or Russian (V2_PLAN W2), else English. */
function fromBrowser(): UiLang {
  const wanted = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of wanted) {
    const code = tag?.toLowerCase().slice(0, 2)
    if (code === 'uz' || code === 'ru' || code === 'en') return code
  }
  return 'en'
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [ui, setLang] = useState<UiLang>(remembered)
  const setUi = useCallback((next: UiLang) => {
    setLang(next)
    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      // The choice then lasts for this visit only.
    }
  }, [])
  useEffect(() => {
    document.documentElement.lang = UI_LANGS.find((item) => item.code === ui)?.attr ?? 'en'
  }, [ui])
  setFormatLang(ui) // before the screens below draw their dates and amounts
  current = ui
  const t = useCallback((words: Words) => words[ui], [ui])
  const say = useCallback((text: string | null | undefined, words?: Words | null) => (words ? words[ui] : text ?? ''), [ui])
  const value = useMemo(() => ({ ui, setUi, t, say }), [ui, setUi, t, say])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  const value = useContext(LangContext)
  if (!value) throw new Error('useLang needs LangProvider')
  return value
}
