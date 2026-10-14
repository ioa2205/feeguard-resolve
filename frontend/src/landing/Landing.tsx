// The landing page (V2_PLAN W2, D-047): the customer's sentence on black, how it works in four
// steps on the real screens, the whole bank at night, the money in full red, what the bank gets.
// It loads without the product's code: only this file, its words, its chart and its two faces.

import '@fontsource/onest/400.css'
import '@fontsource/onest/500.css'
import '@fontsource/onest/600.css'
import '@fontsource/onest/700.css'
import '@fontsource/source-serif-4/400.css'
import '@fontsource/source-serif-4/400-italic.css'
import './landing.css'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType, ReactNode, RefObject } from 'react'
import { Link, useLocation } from 'react-router-dom'

import { formatDate, formatTime } from '../format'
import { useLang } from '../i18n'
import type { UiLang } from '../i18n'
import { clamp, clock, createChart, grouped, lessMotion, minuteOf, seg } from './chart'
import type { Chart, ChartTheme, ChartWords } from './chart'
import { C, CONTACT, QUOTE, dayMonth, fullDate, minutes, monthYear, seconds, span } from './copy'
import type { L } from './copy'
import { LangMenu } from './LangMenu'
import { loadStory } from './story'
import type { StoryView } from './story'

const LIGHT: ChartTheme = { bg: '#ffffff', ink: '#000000', ink2: '#5c5c5c', ink3: '#a3a3a3', rule: '#e6e6e6', band: '#f5f5f5', wrong: '#e71336' }
const DARK: ChartTheme = { bg: '#000000', ink: '#ffffff', ink2: '#a3a3a3', ink3: '#5c5c5c', rule: '#2e2e2e', band: '#141414', wrong: '#e71336' }
const KUN = 'https://kun.uz/news/2025/10/03/markaziy-bank-3-ta-tijorat-bankini-istemolchilar-huquqlarini-buzgani-uchun-jarimaga-tortdi'
const SPOT = 'https://www.spot.uz/oz/2025/10/03/three-bank/'

// --- Numbers ------------------------------------------------------------------------------

const groupsOf = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ').split(' ')
const somWord = (lang: UiLang) => (lang === 'ru' ? 'сум' : 'soʻm')
/** 3282000 -> "3 282 000", for words that `Typed` then draws with the page's digit gaps. */
const spaced = (n: number) => groupsOf(n).join(' ')

/** 1011781585 -> 1 011 781 585, the gaps drawn by CSS so the digits copy as one number. */
function Num({ n }: { n: number }) {
  return <span className="grp">{groupsOf(n).map((g, i) => <span key={i} className="g">{g}</span>)}</span>
}

/** "2 832 of 2 832" typed in the words: its digit groups get the same gaps. */
function Typed({ value }: { value: string }) {
  const pieces = value.split(/(\d{1,3}(?: \d{3})+)/)
  return <>{pieces.map((piece, i) => (/^\d{1,3}( \d{3})+$/.test(piece)
    ? <span key={i} className="grp">{piece.split(' ').map((g, j) => <span key={j} className="g">{g}</span>)}</span>
    : piece))}</>
}

function Som({ n, lang }: { n: number; lang: UiLang }) {
  return <span className="num"><Num n={n} /><span className="cur">{somWord(lang)}</span></span>
}

/** A number whose digit groups rise one after another when it comes into view. It never counts up. */
function Rise({ n, lang, cur = true }: { n: number; lang: UiLang; cur?: boolean }) {
  const groups = groupsOf(n)
  return (
    <span className="rise num" aria-label={cur ? `${n} ${somWord(lang)}` : String(n)}>
      {groups.map((g, i) => <span key={i} className="mask" aria-hidden="true"><span style={{ '--i': i } as CSSProperties}>{g}</span></span>)}
      {cur && <span className="mask cur" aria-hidden="true"><span style={{ '--i': groups.length } as CSSProperties}>{somWord(lang)}</span></span>}
    </span>
  )
}

/** A heading whose words rise into place one after another when it comes into view. */
function Words({ text }: { text: string }) {
  return (
    <span key={text}>
      {text.split(' ').map((word, i) => (
        <span key={i}>{i > 0 && ' '}<span className="wm"><span style={{ '--i': i } as CSSProperties}>{word}</span></span></span>
      ))}
    </span>
  )
}

// --- The customer's sentence, typed -------------------------------------------------------

type Token = { text: string; hit?: boolean; tail?: string }
type Letter = { ch: string; t: number; k: number; last: boolean }

/** The moment each letter of the sentence appears, as a hand types it: a little uneven, with a
 * breath after each full stop and comma. `k` is how long the caret then waits after it. */
function typeOut(tokens: Token[], open: string, close: string) {
  let at = 450
  const letters: Letter[] = []
  const words = tokens.map((token, i) => {
    const parts = [
      { text: i === 0 ? open : '', hit: false },
      { text: token.text, hit: Boolean(token.hit) },
      { text: `${token.tail ?? ''}${i === tokens.length - 1 ? close : ''}`, hit: false },
    ].filter((part) => part.text)
    const out = parts.map((part) => ({
      hit: part.hit,
      letters: [...part.text].map((ch, j) => {
        const letter = { ch, t: at, k: 0, last: false }
        letters.push(letter)
        at += 17 + ((i * 7 + j * 13) % 7) * 2
        if ('.!?'.includes(ch)) at += 240
        else if (ch === ',') at += 120
        return letter
      }),
    }))
    at += 22 // the space
    return out
  })
  letters.forEach((letter, n) => { letter.k = (letters[n + 1]?.t ?? letter.t) - letter.t })
  const last = letters[letters.length - 1]
  if (last) last.last = true
  return { words, end: last?.t ?? 0 }
}

// --- Parts that play once, when they come into view --------------------------------------

function useSeen<T extends Element>(onSeen?: () => void) {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  const callback = useRef(onSeen)
  callback.current = onSeen
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const watch = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      setSeen(true)
      watch.disconnect()
    }, { rootMargin: '0px 0px -18% 0px' })
    watch.observe(el)
    return () => watch.disconnect()
  }, [seen])
  useEffect(() => {
    if (seen) callback.current?.()
  }, [seen])
  return [ref, seen] as const
}

function Seen({ as: Tag = 'div', className = '', style, id, onSeen, children }: {
  as?: ElementType
  className?: string
  style?: CSSProperties
  id?: string
  onSeen?: () => void
  children?: ReactNode
}) {
  const [ref, seen] = useSeen<HTMLElement>(onSeen)
  return <Tag ref={ref} id={id} style={style} data-anim="" className={`${className}${seen ? ' is-in' : ''}`}>{children}</Tag>
}

const delay = (d: number, i?: number) => ({ '--d': `${d}s`, ...(i === undefined ? {} : { '--i': i }) } as CSSProperties)
const marksOf = (lang: UiLang) => (lang === 'ru' ? ['«', '»'] : ['“', '”'])
const quoted = (lang: UiLang, words: string) => `${marksOf(lang)[0]}${words}${marksOf(lang)[1]}`

// --- The page -----------------------------------------------------------------------------

export default function Landing() {
  const { ui: lang, setUi } = useLang()
  const t = useCallback((words: L) => words[lang], [lang])
  const [story, setStory] = useState<StoryView | null>(null)
  const [motion] = useState(() => !lessMotion())
  const nav = useRef<HTMLElement>(null)
  const night = useRef<HTMLElement>(null)
  const scene = useRef<HTMLDivElement>(null)
  const caps = useRef<HTMLDivElement>(null)
  const miniCanvas = useRef<HTMLCanvasElement>(null)
  const bigCanvas = useRef<HTMLCanvasElement>(null)
  const charts = useRef<{ mini?: Chart; big?: Chart }>({})
  const miniSeen = useRef(false)
  const { pathname } = useLocation()

  // /uz, /ru and /en open the page in that language (a shared link keeps the language it was sent in).
  useEffect(() => {
    const asked = pathname.replace(/\/$/, '').slice(1)
    if (asked === 'uz' || asked === 'ru' || asked === 'en') setUi(asked)
  }, [pathname, setUi])

  useEffect(() => {
    let gone = false
    loadStory().then((loaded) => { if (!gone) setStory(loaded) }).catch(() => undefined)
    return () => { gone = true }
  }, [])

  useEffect(() => {
    document.title = C.title[lang]
  }, [lang])

  // The page is black at its edges too, and its in-page links glide.
  useEffect(() => {
    const body = document.body.style
    const html = document.documentElement.style
    const before = [body.background, body.margin, html.scrollBehavior]
    body.background = '#000'
    body.margin = '0'
    if (motion) html.scrollBehavior = 'smooth'
    return () => {
      [body.background, body.margin, html.scrollBehavior] = before
    }
  }, [motion])

  // The two charts, drawn again when the language changes.
  useEffect(() => {
    if (!story || !miniCanvas.current || !bigCanvas.current) return
    let gone = false
    const words: ChartWords = {
      due: (owed) => C.chart.due[lang](fullDate(story.dueDate, lang), story.installment, grouped(owed)),
      taken: C.chart.taken[lang],
      recorded: C.chart.recorded[lang],
      notRecorded: C.chart.notRecorded[lang],
      minutes: (n) => minutes(n, lang),
      night: (date, count) => C.chart.night[lang](dayMonth(date, lang), count),
      share: (pct, lift, total) => C.chart.share[lang](pct, lift, total),
    }
    const phone = () => window.innerWidth <= 960
    Promise.all(['400 12px Onest', '500 12px Onest', '600 13px Onest'].map((face) => document.fonts.load(face))).catch(() => undefined).then(() => {
      if (gone || !miniCanvas.current || !bigCanvas.current) return
      const mini = createChart(miniCanvas.current, story.chart, {
        theme: LIGHT,
        words,
        layout: (W, H) => ({ L: 16, R: W - 16, caseTop: -6, caseBottom: H - 26, stripTop: 30, stripBottom: H - 40, labels: false, lanes: true, caseR: 6.5 }),
      })
      const big = createChart(bigCanvas.current, story.chart, {
        theme: DARK,
        words,
        layout(W, H) {
          const box = caps.current
          const capBottom = box ? Math.max(...[...box.children].map((c) => (c as HTMLElement).offsetTop + (c as HTMLElement).offsetHeight)) + box.offsetTop : 160
          const L = phone() ? 18 : Math.max(40, (W - 1080) / 2)
          return {
            L, R: W - L,
            caseTop: capBottom + (phone() ? 30 : 56), caseBottom: H - (phone() ? 70 : 90),
            stripTop: capBottom + 36, stripBottom: H - 60,
            gap: 46, caseR: phone() ? 7 : 9, textScale: phone() ? 1 : 1.15, sweep: true,
          }
        },
      })
      big.set({ draw: 1 })
      if (miniSeen.current) mini.set({ draw: 1 })
      charts.current = { mini, big }
      window.dispatchEvent(new Event('scroll'))
    })
    return () => {
      gone = true
      charts.current.mini?.destroy()
      charts.current.big?.destroy()
      charts.current = {}
    }
  }, [story, lang])

  // The night is moved by the scroll; the red and blue blocks open to the full width as they
  // arrive; the top bar takes the colour of the section under it.
  useEffect(() => {
    if (!story) return
    let ticking = false
    const opening = [...document.querySelectorAll<HTMLElement>('.lp .open')]
    function frame() {
      ticking = false
      if (motion) {
        const vh = window.innerHeight
        opening.forEach((block) => {
          const top = block.getBoundingClientRect().top
          block.style.setProperty('--c', (1 - clamp((vh - top) / (vh * 0.55))).toFixed(3))
        })
      }
      const box = night.current?.getBoundingClientRect()
      if (box) {
        const p = clamp(-box.top / (box.height - window.innerHeight))
        charts.current.big?.set({ zoom: seg(p, 0.06, 0.26), reveal: seg(p, 0.2, 0.5), cause: seg(p, 0.6, 0.72) })
        const list = [...(caps.current?.children ?? [])] as HTMLElement[]
        list.forEach((cap) => {
          const a = Number(cap.dataset.in)
          const b = Number(cap.dataset.out)
          const o = Math.min(a <= 0 ? 1 : seg(p, a + 0.005, a + 0.045), 1 - seg(p, b - 0.04, b))
          cap.style.opacity = String(o)
          cap.style.transform = `translateY(${(1 - o) * 14}px)`
        })
        const k = p < 0.2 ? 0 : p < 0.56 ? 1 : 2
        scene.current?.querySelectorAll('.progress i').forEach((dot, i) => dot.classList.toggle('on', i === k))
        bigCanvas.current?.setAttribute('aria-label', list[k]?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      }
      const bar = nav.current
      if (bar) {
        const y = bar.offsetHeight / 2
        const under = [...document.querySelectorAll<HTMLElement>('.lp [data-theme]')].find((s) => {
          const r = s.getBoundingClientRect()
          return r.top <= y && r.bottom > y
        })
        if (under) bar.dataset.on = under.dataset.theme
      }
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(frame)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    frame()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [story, motion])

  const startMini = useCallback(() => {
    miniSeen.current = true
    charts.current.mini?.to('draw', 1, 2400, 300, 'linear')
  }, [])

  // --- The customer's sentence: the original, or its translation, typed letter by letter; the
  // money part is underlined once it is written. The quote marks and any punctuation stay on
  // their word's line.
  const sameWords = !story || story.text === QUOTE.original
  const quote = sameWords ? QUOTE[lang] : { text: story.text, hit: '' }
  const [before, after] = quote.hit && quote.text.includes(quote.hit) ? quote.text.split(quote.hit) : [quote.text, null]
  const [, stop = '', rest = after ?? ''] = after !== null ? /^([.,!?;:]*)(.*)$/s.exec(after) ?? [] : []
  const tokens: Token[] = [
    ...before.split(' ').filter(Boolean).map((text) => ({ text })),
    ...(after !== null ? [{ text: quote.hit, hit: true, tail: stop }] : []),
    ...rest.split(' ').filter(Boolean).map((text) => ({ text })),
  ]
  const typed = typeOut(tokens, ...(marksOf(lang) as [string, string]))
  const sentence: ReactNode[] = typed.words.map((parts, i) => (
    <span key={i}>
      {i > 0 && ' '}
      <span className="w">
        {parts.map((part, j) => {
          const letters = part.letters.map((letter, n) => (
            <span key={n} className={letter.last ? 'ch last' : 'ch'} style={{ '--t': `${letter.t}ms`, '--k': `${letter.k}ms` } as CSSProperties}>{letter.ch}</span>
          ))
          return <span key={j} className={part.hit ? 'hit' : undefined}>{letters}</span>
        })}
      </span>
    </span>
  ))
  let claimed = 0
  const claimNumber = (value: string) => <b className="num" style={{ '--i': claimed++ } as CSSProperties}><Typed value={value} /></b>
  const first = story?.cause?.attributes.find((item) => item.name === 'batch_run')
  const cause = first && story ? { pct: Math.round(first.support * 100), run: first.value, lift: first.lift } : null
  const written = story ? `${formatDate(story.writtenAt)}, ${formatTime(story.writtenAt)}` : ''
  const translatedNote = sameWords && C.hero.translated[lang] ? ` · ${C.hero.translated[lang]}` : ''

  return (
    <div className={`lp${motion ? ' motion' : ''}`}>
      <header className="nav" ref={nav} data-on="dark">
        <div className="wrap">
          {/* The mark is the story: one payment, then the same payment again, in red. */}
          <a className="brand" href="#top" aria-label="FeeGuard">
            <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="5" y1="5" x2="21" y2="5" stroke="currentColor" strokeOpacity=".4" strokeWidth="1.5" /><circle className="dot2" cx="21" cy="5" r="4" /><circle className="dot1" cx="5" cy="5" r="4" /></svg>
            FeeGuard
          </a>
          <nav className="nav__links" aria-label="FeeGuard">
            <a href="#how">{t(C.nav.how)}</a>
            <a href="#bank">{t(C.nav.bank)}</a>
            <a href="#inside" className="roomy">{t(C.nav.inside)}</a>
            <a href="#contact">{t(C.nav.contact)}</a>
          </nav>
          <div className="nav__end">
            <LangMenu lang={lang} label={t(C.nav.language)} />
            <Link className="btn btn--small" to="/demo"><span className="wide">{t(C.nav.demo)}</span><span className="narrow">{t(C.nav.demoShort)}</span></Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* 1 · The customer's sentence */}
        <section className="hero dark" data-theme="dark" style={{ '--end': `${typed.end}ms` } as CSSProperties}>
          <p className="hero__k">{t(C.hero.kicker)}</p>
          <blockquote key={lang} lang={lang === 'uz' || !sameWords ? 'uz-Latn' : lang}>{sentence}</blockquote>
          <p className="hero__who">{story ? <>{story.name} · {written}{translatedNote}</> : ' '}</p>
          <h1>{t(C.hero.lead)} <span>{t(C.hero.then)}</span></h1>
          <div className="actions">
            <Link className="btn" to="/demo">{t(C.nav.demo)} <span className="arrow" aria-hidden="true">→</span></Link>
            <a className="link" href="#how">{t(C.hero.how)}</a>
          </div>
          <p className="fine">{t(C.hero.fine)}</p>
          <span className="cue" aria-hidden="true" />
        </section>

        {story && (
          <>
            <How story={story} lang={lang} t={t} miniCanvas={miniCanvas} onRecords={startMini} />

            {/* 3 · Step 4: the same check over the whole bank */}
            <section className="night dark" id="night" data-theme="dark" ref={night} aria-label={t(C.night.step)}>
              <div className="scene" ref={scene}>
                <canvas ref={bigCanvas} role="img" aria-label="" />
                <div className="caps" ref={caps} aria-live="polite">
                  <div className="cap" data-in="0" data-out="0.2">
                    <div className="k"><i>4</i>{t(C.night.step)}</div>
                    <h2>{t(C.night.a)}</h2>
                    <p>{C.night.aSub[lang](<b><Num n={story.loans} /></b>, story.name, story.loans)}</p>
                  </div>
                  <div className="cap" data-in="0.2" data-out="0.56">
                    <h2>{t(C.night.b)}</h2>
                    <p className="key">{C.night.key[lang](<i />, <i className="r" />, minutes(story.gap ?? 2, lang))}</p>
                  </div>
                  <div className="cap" data-in="0.56" data-out="1.01">
                    <h2>{t(C.night.c)}</h2>
                    <p>{cause ? C.night.cause[lang](cause.pct, story.contracts, cause.run, cause.lift) : ''}</p>
                  </div>
                </div>
                <div className="progress" aria-hidden="true"><i /><i /><i /></div>
              </div>
            </section>

            {/* 4 · The money */}
            <section className="red open" data-theme="red">
              <div className="wrap">
                <Seen as="p" className="red__k rv">{t(C.money.kicker)}</Seen>
                <Seen as="h2" className="red__big">{<Rise n={story.total} lang={lang} />}</Seen>
                <Seen as="p" className="red__s rv" style={delay(0.5)}>{C.money.line[lang](<Num n={story.customers} />, <Num n={story.silent} />, story.customers)}</Seen>
              </div>
            </section>

            <Gets story={story} lang={lang} t={t} />

            <section className="here light" data-theme="light">
              <div className="wrap">
                <Seen as="h2" className="h2"><Words text={t(C.here.title)} /></Seen>
                <Seen as="p" className="sub rv" style={delay(0.15)}>{t(C.here.sub)}</Seen>
                {/* docs/EVAL.md, Proof 4 (11 Oct 2026) */}
                <div className="cases">
                  {([[C.here.fee, 102, 86, 11_740_000], [C.here.late, 100, 83, 426_350]] as const).map(([name, customers, silent, back], i) => (
                    <Seen key={i} className="case rv" style={delay(0.1 + i * 0.12)}>
                      <h3>{t(name)}</h3>
                      <dl>
                        <dt>{t(C.here.customers)}</dt><dd style={{ '--d0': `${0.45 + i * 0.12}s` } as CSSProperties}><Rise n={customers} lang={lang} cur={false} /></dd>
                        <dt>{t(C.here.silent)}</dt><dd style={{ '--d0': `${0.6 + i * 0.12}s` } as CSSProperties}><Rise n={silent} lang={lang} cur={false} /></dd>
                        <dt>{t(C.here.toReturn)}</dt><dd style={{ '--d0': `${0.75 + i * 0.12}s` } as CSSProperties}><Rise n={back} lang={lang} /></dd>
                      </dl>
                    </Seen>
                  ))}
                </div>
                <Seen as="p" className="fine rv">
                  {t(C.here.sources)} <a href={KUN} rel="noopener">Kun.uz, {t(C.here.newsDate)}</a> {t(C.here.and)} <a href={SPOT} rel="noopener">Spot, {t(C.here.newsDate)}</a>. {t(C.here.fine)}
                </Seen>
              </div>
            </section>

            <section className="inside dark" id="inside" data-theme="dark">
              <div className="wrap">
                <Seen as="h2" className="h2"><Words text={t(C.inside.title)} /></Seen>
                <div className="rules">
                  {C.inside.rules.map((rule, i) => (
                    <Seen key={i} className="rv" style={delay(i * 0.12)}><b>{t(rule.b)}</b><span>{t(rule.s)}</span></Seen>
                  ))}
                </div>
              </div>
            </section>

            <section className="measured light" data-theme="light">
              <div className="wrap">
                <Seen as="h2" className="h2" style={{ marginBottom: 44 }}><Words text={t(C.measured.title)} /></Seen>
                <Seen as="p" className="claim rv" style={delay(0.1)}>{C.measured.claim[lang](claimNumber)}</Seen>
                <Seen as="p" className="fine rv" style={{ ...delay(0.2), marginTop: 30 }}><Typed value={t(C.measured.fine)} /></Seen>
              </div>
            </section>

            {/* White behind the blue, so the block opens out of the white section above it. */}
            <div className="light">
              <section className="cta open" data-theme="blue">
                <div className="wrap">
                  <Seen as="h2" className="h2"><Words text={t(C.cta.title)} /></Seen>
                  <Seen as="p" className="rv" style={delay(0.15)}>{t(C.cta.p)}</Seen>
                  <Seen className="rv" style={delay(0.25)}><Link className="btn" to="/demo">{t(C.nav.demo)} <span className="arrow" aria-hidden="true">→</span></Link></Seen>
                  {/* V2_PLAN W2 block 9: the contact details the user gave on 13 Oct 2026. */}
                  <Seen className="contact rv" id="contact" style={delay(0.35)}>
                    <p className="contact__k">{t(C.cta.talk)}</p>
                    <p className="contact__name">{CONTACT.name}</p>
                    <ul className="contact__links">
                      {CONTACT.links.map((item) => (
                        <li key={item.name}><a className="link" href={item.href} target="_blank" rel="noopener noreferrer">{item.name}<span className="ext" aria-hidden="true">↗</span></a></li>
                      ))}
                    </ul>
                  </Seen>
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      <footer className="dark" data-theme="dark">
        <div className="wrap">
          <span>FeeGuard</span>
          <span>{t(C.foot.invented)}{story?.source === 'saved' && story.savedAt ? <> {C.foot.saved[lang](formatDate(story.savedAt))}</> : null}</span>
        </div>
      </footer>
    </div>
  )
}

function firstSentence(text: string): string {
  const end = text.indexOf('. ')
  return end > 0 ? text.slice(0, end + 1) : text
}

// --- 2 · How it works, on the real screens -----------------------------------------------

function How({ story, lang, t, miniCanvas, onRecords }: {
  story: StoryView
  lang: UiLang
  t: (words: L) => string
  miniCanvas: RefObject<HTMLCanvasElement>
  onRecords: () => void
}) {
  const taken = story.events.filter((e) => e.kind === 'TAKEN')
  const recorded = story.events.filter((e) => e.kind === 'RECORDED')
  const gap = taken.length >= 2 ? minuteOf(taken[1].at) - minuteOf(taken[0].at) : story.gap ?? 2
  const network = (card: string | null) => (card ?? '').split(' ')[0]

  // The customer's words, with the parts the reading used underlined in the order the form fills in.
  const text = story.text
  const marks: [string, number][] = [[QUOTE.used.problem, 0.6], [QUOTE.used.month, 1.4]]
  let pieces: ReactNode[] = [text]
  for (const [phrase, d] of marks) {
    pieces = pieces.flatMap((piece) => {
      if (typeof piece !== 'string' || !piece.includes(phrase)) return [piece]
      const [a, b] = piece.split(phrase)
      return [a, <mark key={phrase} style={delay(d)}>{phrase}</mark>, b]
    })
  }
  const usedProblem = text.includes(QUOTE.used.problem) && story.claimType === 'DOUBLE_DEBIT'
  const usedMonth = text.includes(QUOTE.used.month)

  const lines = [
    { t: dayMonth(story.dueDate, lang), kind: C.check.kind.due, what: C.check.what.payment[lang](story.installment), card: '', n: <Num n={story.owed} />, bad: false },
    ...(taken[0] ? [{ t: clock(minuteOf(taken[0].at)), kind: C.check.kind.taken, what: t(C.check.what.fromCard), card: taken[0].card ?? '', n: <>−<Num n={taken[0].amount ?? 0} /></>, bad: false }] : []),
    ...(recorded[0] ? [{ t: clock(minuteOf(recorded[0].at)), kind: C.check.kind.recorded, what: t(C.check.what.onLoan), card: channelOf(story, lang), n: <>+<Num n={recorded[0].amount ?? 0} /></>, bad: false }] : []),
    ...(taken[1] ? [
      { t: clock(minuteOf(taken[1].at)), kind: C.check.kind.taken, what: t(C.check.what.again), card: taken[1].card ?? '', n: <>−<Num n={taken[1].amount ?? 0} /></>, bad: true },
      { t: clock(minuteOf(taken[1].at)), kind: C.check.kind.recorded, what: t(C.check.what.nothing), card: '', n: null, bad: true },
    ] : []),
  ]
  const why = taken.length >= 2
    ? C.decide.why[lang](
      fullDate(story.dueDate, lang), spaced(story.owed), spaced(taken[0].amount ?? 0),
      C.decide.debitAt[lang](network(taken[0].card), clock(minuteOf(taken[0].at))),
      C.decide.debitAt[lang](network(taken[1].card), clock(minuteOf(taken[1].at))),
      recorded.length,
    )
    : ''

  return (
    <section className="how light" id="how" data-theme="light">
      <div className="wrap">
        <Seen as="h2" className="h2"><Words text={t(C.how.title)} /></Seen>
        <Seen as="p" className="sub rv" style={delay(0.15)}>{t(C.how.sub)}</Seen>
        <Seen as="ol" className="glance">
          {C.how.glance.map((step, i) => (
            <li key={i} className="in" style={delay(0.25 + i * 0.22, i)}>
              <a href={i < 3 ? `#s${i + 1}` : '#night'}><i>{i + 1}</i><b>{t(step.b)}</b><span>{t(step.s)}</span></a>
            </li>
          ))}
        </Seen>

        <article className="step" id="s1">
          <Seen className="rv">
            <span className="step__n">1</span>
            <h3>{t(C.read.title)}</h3>
            <p>{C.read.p1[lang]()}</p>
            <p>{t(C.read.p2)}</p>
          </Seen>
          <Seen className="frag read">
            <div className="frag__bar"><b>{t(C.read.bar)} {story.complaintId}</b><span>Web · {formatDate(story.writtenAt)}, {formatTime(story.writtenAt)}</span></div>
            <div className="sheet read__text">
              <p className="uz" lang="uz-Latn">{pieces}</p>
              {lang !== 'uz' && text === QUOTE.original && <p className="tr">{quoted(lang, QUOTE[lang].text)}</p>}
            </div>
            <div className="read__form">
              <div className="frag__lbl"><span>{t(C.read.understood)}</span><span>{t(C.read.readBy[story.readBy === 'llm' ? 'llm' : 'rules'])}</span></div>
              <dl>
                <div style={delay(0.2)}><dt>{t(C.read.customer)}</dt><dd>{story.name}<small>{t(C.read.fromSender)}</small></dd></div>
                <div style={delay(0.9)}><dt>{t(C.read.problem)}</dt><dd>{t(C.read.claim[story.claimType] ?? { en: story.claimType, uz: story.claimType, ru: story.claimType })}
                  {usedProblem && <small>{C.read.from[lang](<q lang="uz-Latn">{quoted(lang, QUOTE.used.problem)}</q>)}</small>}</dd></div>
                <div style={delay(1.7)}><dt>{t(C.read.month)}</dt><dd>{story.period ? monthYear(story.period, lang) : '—'}
                  {usedMonth && <small>{C.read.from[lang](<q lang="uz-Latn">{quoted(lang, QUOTE.used.month)}</q>)}</small>}</dd></div>
                <div style={delay(2.3)}><dt>{t(C.read.amount)}</dt>{story.claimedExcess ? <dd><Som n={story.claimedExcess} lang={lang} /></dd> : <dd className="no">{t(C.read.notStated)}</dd>}</div>
                <div style={delay(2.8)}><dt>{t(C.read.records)}</dt><dd>{span(story.window.from, story.window.to, lang)}</dd></div>
              </dl>
            </div>
          </Seen>
        </article>

        <article className="step" id="s2">
          <Seen className="rv">
            <span className="step__n">2</span>
            <h3>{t(C.check.title)}</h3>
            <p>{C.check.p1[lang]()}</p>
            <p>{C.check.p2[lang](gap)}</p>
            <p className="fact">{t(C.check.fact)}</p>
          </Seen>
          <Seen className="frag rec" onSeen={onRecords}>
            <div className="frag__bar"><b>{C.check.loan[lang](story.contract, story.installment)}</b><span>{t(C.check.readOnly)}</span></div>
            <div className="sheet">
            <div className="mini"><canvas ref={miniCanvas} aria-hidden="true" /></div>
            <table className="ledger">
              <thead><tr><th>{t(C.check.head.time)}</th><th>{t(C.check.head.record)}</th><th>{t(C.check.head.card)}</th><th className="n">{somWord(lang)}</th></tr></thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className={line.bad ? 'bad' : ''} style={{ '--i': i } as CSSProperties}>
                    <td className="t num">{line.t}</td>
                    <td className="what"><span className="kind">{t(line.kind)}</span>{line.what}</td>
                    <td className="cardno">{line.card}</td>
                    <td className="n num">{line.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="total"><span>{t(C.check.notOwed)}</span><span className="wrong"><Som n={story.excess} lang={lang} /></span></div>
            </div>
          </Seen>
        </article>

        <article className="step" id="s3">
          <Seen className="rv">
            <span className="step__n">3</span>
            <h3>{t(C.decide.title)}</h3>
            <p>{C.decide.p1[lang]()}</p>
            <p>{t(C.decide.p2)}</p>
          </Seen>
          <Seen className="frag verdict">
            <div className="frag__bar"><b>{t(C.decide.bar)}</b><span>{C.decide.checkedIn[lang](seconds(story.elapsedMs, lang))}</span></div>
            <div className="sheet verdict__body">
              <div className="stamp">{t(C.decide.stamp)}</div>
              <div className="vmoney"><span className="big"><Rise n={story.excess} lang={lang} /></span><small>{t(C.decide.toReturn)}</small></div>
              <p className="why in" style={delay(1)}><Typed value={why} /></p>
              <div className="acts in" style={delay(1.2)}><span className="b b--act">{t(C.decide.approve)}<Pointer /></span><span className="b">{t(C.decide.reword)}</span><span className="b">{t(C.decide.others)}</span></div>
              <p className="decides in" style={delay(1.4)}>{t(C.decide.blue)}</p>
            </div>
          </Seen>
        </article>
      </div>
    </section>
  )
}

/** A person's pointer: it comes to the blue button and presses it, because a person decides. */
function Pointer() {
  return (
    <svg className="pointer" width="18" height="22" viewBox="0 0 18 22" aria-hidden="true">
      <path d="M1.6 1.4v16.4l4.2-4.1 2.9 6.6 3-1.3-2.9-6.5h6z" fill="#000" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function channelOf(story: StoryView, lang: UiLang): string {
  const rec = story.events.find((e) => e.kind === 'RECORDED')
  const words = rec?.channel ? C.check.channel[rec.channel] : undefined
  return words ? words[lang] : rec?.channel ?? ''
}

// --- 5 · What the bank gets ---------------------------------------------------------------

function Gets({ story, lang, t }: { story: StoryView; lang: UiLang; t: (words: L) => string }) {
  const letter = story.letter?.text.split('\n').filter(Boolean) ?? []
  const finding = letter.find((p) => p.startsWith('Tekshiruv')) ?? letter[2] ?? ''
  const shown = [letter[0] ?? '', finding.length > 230 ? `${finding.slice(0, finding.lastIndexOf(' ', 230))} …` : finding].filter(Boolean)
  const sample = [...story.rows].sort((a, b) => a.m[0] - b.m[0] || a.contract.localeCompare(b.contract)).slice(0, 4)
  const attr = story.cause?.attributes[0]
  const fix = story.cause?.suggested_fix_t?.[lang] ?? story.cause?.suggested_fix ?? ''
  const action = (entry: StoryView['trail'][number]) => {
    const key = entry.action === 'COMPLAINT_CHECKED' && entry.payload.verdict === 'SUPPORTED' ? 'COMPLAINT_CHECKED_RIGHT' : entry.action
    const words = C.gets.log.action[key]
    return words ? words[lang] : entry.action
  }
  return (
    <section className="gets light" id="bank" data-theme="light">
      <div className="wrap">
        <Seen as="h2" className="h2"><Words text={t(C.gets.title)} /></Seen>
        <Seen as="p" className="sub rv" style={delay(0.15)}>{t(C.gets.sub)}</Seen>
        <div className="cards">
          <Seen className="card card--wide">
            <h3>{t(C.gets.letter.h)}</h3>
            <p>{t(C.gets.letter.p)}</p>
            <div className="box letter" lang="uz-Latn">{shown.map((p, i) => <p key={i} style={{ '--i': i } as CSSProperties}><Typed value={p} /></p>)}</div>
          </Seen>
          <Seen className="card card--wide">
            <h3>{t(C.gets.refunds.h)}</h3>
            <p>{t(C.gets.refunds.p)}</p>
            <div className="box">
              <table className="refunds"><tbody>
                {sample.map((row, i) => (
                  <tr key={row.contract} style={{ '--i': i } as CSSProperties}><td>{row.name}</td><td className="c">{row.contract}</td><td className="n num"><Num n={row.excess} /></td></tr>
                ))}
                <tr className="more" style={{ '--i': 4 } as CSSProperties}><td colSpan={3}>{C.gets.refunds.more[lang](story.rows.length - sample.length)}</td></tr>
                <tr className="sum" style={{ '--i': 5 } as CSSProperties}><td colSpan={2}>{t(C.gets.refunds.total)}</td><td className="n"><Som n={story.total} lang={lang} /></td></tr>
              </tbody></table>
              <span className="chip">refunds.csv</span>
            </div>
          </Seen>
          <Seen className="card">
            <h3>{t(C.gets.fix.h)}</h3>
            <p>{t(C.gets.fix.p)}</p>
            <div className="box fix">
              <b>{t(C.gets.fix.cause)}</b>
              <p>{attr ? C.gets.fix.run[lang](attr.value, Math.round(attr.support * 100), attr.lift) : ''}</p>
              <b>{t(C.gets.fix.suggested)}</b>
              <p>{firstSentence(fix)}</p>
            </div>
          </Seen>
          <Seen className="card">
            <h3>{t(C.gets.one.h)}</h3>
            <p>{C.gets.one.p[lang](<Num n={story.customers} />)}</p>
            <div className="box"><ol className="flow">
              {C.gets.one.steps.map((step, i) => (
                <li key={i} style={{ '--i': i } as CSSProperties}>
                  <b>{t(step.b)}</b>
                  <span>{step.s ? t(step.s) : <><Num n={story.customers} /> {t(C.gets.one.customersWord)}, <Som n={story.total} lang={lang} /></>}</span>
                </li>
              ))}
            </ol></div>
          </Seen>
          <Seen className="card">
            <h3>{t(C.gets.log.h)}</h3>
            <p>{t(C.gets.log.p)}</p>
            <div className="box"><ol className="chain">
              {story.trail.map((entry, i) => (
                <li key={entry.id} style={{ '--i': i } as CSSProperties}>
                  <span className="id">{entry.id}</span>
                  <span>{action(entry)}
                    <span className="h">{t(C.gets.log.before)} <em style={{ '--i': i } as CSSProperties}>{entry.prev_hash.slice(0, 8)}</em> · {t(C.gets.log.self)} <em style={{ '--i': i + 1 } as CSSProperties}>{entry.hash.slice(0, 8)}</em></span>
                  </span>
                </li>
              ))}
            </ol></div>
          </Seen>
        </div>
      </div>
    </section>
  )
}
