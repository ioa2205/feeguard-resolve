// The language switch: the current language's flag, and a menu of the three. On the landing page
// each language is its own address (/uz, /ru, /en), so the choice can be shared and the link
// preview matches it. In the product, `pick` switches the words and leaves the address alone.

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'

import type { UiLang } from '../i18n'

const NAMES: Record<UiLang, { name: string; attr: string }> = {
  uz: { name: 'Oʻzbekcha', attr: 'uz-Latn' },
  ru: { name: 'Русский', attr: 'ru' },
  en: { name: 'English', attr: 'en' },
}
const ORDER: UiLang[] = ['uz', 'ru', 'en']

/** The five points of a star of radius `r` at (x, y), for the stars of Uzbekistan's flag. */
function star(x: number, y: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const d = i % 2 ? r * 0.382 : r
    return `${(x + d * Math.cos(a)).toFixed(2)},${(y + d * Math.sin(a)).toFixed(2)}`
  }).join(' ')
}
// Twelve stars in rows of 3, 4 and 5, set to the fly side of the crescent.
const STARS = [[3, 2.9], [4, 5.2], [5, 7.5]].flatMap(([count, y]) =>
  Array.from({ length: count }, (_, i) => star(20.6 - (count - 1 - i) * 1.9, y, 0.68)))

/** A round flag, drawn from the centre of the real one (the national flags, as published). */
export function Flag({ code }: { code: UiLang }) {
  const clip = `lp-flag-${useId().replace(/:/g, '')}`
  let art: ReactNode
  if (code === 'uz') {
    art = <>
      <rect width="30" height="9.6" fill="#0099b5" />
      <rect y="9.6" width="30" height=".6" fill="#ce1126" />
      <rect y="10.2" width="30" height="9.6" fill="#fff" />
      <rect y="19.8" width="30" height=".6" fill="#ce1126" />
      <rect y="20.4" width="30" height="9.6" fill="#1eb53a" />
      <circle cx="9.3" cy="5.2" r="2.75" fill="#fff" />
      <circle cx="10.35" cy="5.2" r="2.35" fill="#0099b5" />
      {STARS.map((points, i) => <polygon key={i} points={points} fill="#fff" />)}
    </>
  } else if (code === 'ru') {
    art = <>
      <rect width="30" height="10" fill="#fff" />
      <rect y="10" width="30" height="10" fill="#0039a6" />
      <rect y="20" width="30" height="10" fill="#d52b1e" />
    </>
  } else {
    // The Union Flag, 60 x 30, seen through its centre: the red saltire is counterchanged.
    art = <g transform="translate(-15 0)">
      <defs><clipPath id={clip}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath></defs>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" strokeWidth="4" clipPath={`url(#${clip})`} />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </g>
  }
  return (
    <svg className="flag" viewBox="0 0 30 30" aria-hidden="true">
      {art}
      <circle cx="15" cy="15" r="14.7" fill="none" stroke="#000" strokeOpacity=".12" strokeWidth=".6" />
    </svg>
  )
}

export function LangMenu({ lang, label, pick }: { lang: UiLang; label: string; pick?: (code: UiLang) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = `lp-lang-${useId().replace(/:/g, '')}`

  // A click outside, or the focus leaving, closes the menu.
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('focusin', away)
    box.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('focusin', away)
    }
  }, [open])

  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpen(false)
      button.current?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return
    event.preventDefault()
    const items = [...(box.current?.querySelectorAll<HTMLElement>('.lang__menu a, .lang__menu button') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className="lang" ref={box} data-open={open ? '' : undefined} onKeyDown={keys}>
      <button
        ref={button}
        type="button"
        className="lang__btn"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label}: ${NAMES[lang].name}`}
        onClick={() => setOpen((was) => !was)}
      >
        <Flag code={lang} />
        <svg className="lang__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <ul className="lang__menu" id={menuId} aria-label={label}>
        {ORDER.map((code) => {
          const inside = <>
            <Flag code={code} />
            <span>{NAMES[code].name}</span>
            {code === lang && <svg className="lang__tick" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.4 5.6 10.4 11.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </>
          return (
            <li key={code}>
              {pick ? (
                <button type="button" lang={NAMES[code].attr} aria-current={code === lang} tabIndex={open ? 0 : -1} onClick={() => { pick(code); setOpen(false); button.current?.focus() }}>{inside}</button>
              ) : (
                <Link to={`/${code}`} replace hrefLang={NAMES[code].attr} lang={NAMES[code].attr} aria-current={code === lang} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>{inside}</Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
