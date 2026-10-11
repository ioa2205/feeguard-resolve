// The language of the screens: English, Uzbek (Latin) or Russian (DECISIONS D-038).
// A customer's own words and the bank's records are never translated.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type UiLang = 'en' | 'uz' | 'ru'
export type Words = Record<UiLang, string>

export const UI_LANGS: { code: UiLang; label: string; attr: string }[] = [
  { code: 'en', label: 'English', attr: 'en' },
  { code: 'uz', label: 'Oʻzbekcha', attr: 'uz-Latn' },
  { code: 'ru', label: 'Русский', attr: 'ru' },
]
const KEY = 'feeguard.ui-lang'

interface Lang {
  ui: UiLang
  setUi: (next: UiLang) => void
  /** The text in the chosen language. */
  t: (words: Words) => string
}

const LangContext = createContext<Lang | null>(null)

function remembered(): UiLang {
  try {
    const value = window.localStorage.getItem(KEY)
    if (value === 'en' || value === 'uz' || value === 'ru') return value
  } catch {
    // A private window may refuse storage.
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
  const t = useCallback((words: Words) => words[ui], [ui])
  const value = useMemo(() => ({ ui, setUi, t }), [ui, setUi, t])
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLang(): Lang {
  const value = useContext(LangContext)
  if (!value) throw new Error('useLang needs LangProvider')
  return value
}
