// The frame of every product screen (V2_PLAN W1.5, W1.6): a white bar with the four sections, the
// counts that wait for a person, the customer's phone, the language and one menu of demo tools.
// The bar turns black over the black part of a page, as on the landing page.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { api, usingSampleData } from '../api'
import { formatNumber } from '../format'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { LangMenu } from '../landing/LangMenu'
import { useSession } from '../session'
import type { Actor, World } from '../types'
import { DEFAULT_WORLD_ID } from '../types'
import { ACTING_AS, MISTAKE } from '../words'
import { Mark } from './ui'

const CHEV = <svg className="lang__chev" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.75 5 6.75 8 3.75" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
const ROLES: Actor[] = ['officer', 'compliance']

/** What a demo bank is called on screen. No seeds, no ids. */
export function useBankName() {
  const { t } = useLang()
  const { worlds, presets } = useSession()
  return (world: World | string): string => {
    const id = typeof world === 'string' ? world : world.world_id
    if (id === DEFAULT_WORLD_ID) return t({ en: 'Main demo bank', uz: 'Asosiy demo bank', ru: 'Основной демо-банк' })
    const preset = presets.find((item) => item.world_id === id)
    if (preset) return `${t({ en: 'Public case', uz: 'Ommaviy holat', ru: 'Публичный случай' })}: ${t(MISTAKE[preset.mistake]).toLowerCase()}`
    const own = (worlds ?? []).filter((item) => item.world_id !== DEFAULT_WORLD_ID && !presets.some((p) => p.world_id === item.world_id))
    const n = own.findIndex((item) => item.world_id === id)
    return `${t({ en: 'Your demo bank', uz: 'Sizning demo bankingiz', ru: 'Ваш демо-банк' })}${n >= 0 && own.length > 1 ? ` ${n + 1}` : ''}`
  }
}

function DemoTools() {
  const { t } = useLang()
  const { actor, setActor, worldId, setWorldId, worlds, health } = useSession()
  const name = useBankName()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const away = (event: Event) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('focusin', away)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('focusin', away)
    }
  }, [open])
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      setOpen(false)
      button.current?.focus()
    }
  }
  const readBy = health
    ? health.llm_mode === 'llm'
      ? t({ en: 'the AI', uz: 'sunʼiy intellekt', ru: 'ИИ' }) + (health.model_name?.toLowerCase().startsWith('gemini') ? ' (Gemini)' : '')
      : t({ en: 'simple rules; the AI is not set up', uz: 'oddiy qoidalar; sunʼiy intellekt ulanmagan', ru: 'простые правила; ИИ не подключён' })
    : t({ en: 'not known: the server did not answer', uz: 'nomaʼlum: server javob bermadi', ru: 'неизвестно: сервер не ответил' })

  return (
    <div className="tools-menu" ref={box} data-open={open ? '' : undefined} onKeyDown={keys}>
      <button ref={button} type="button" className="btn btn--small" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((was) => !was)}>
        <span className="long">{t({ en: 'Demo tools', uz: 'Demo vositalari', ru: 'Демо-инструменты' })}</span>{CHEV}
      </button>
      <div className="menu" role="group" aria-label={t({ en: 'Demo tools', uz: 'Demo vositalari', ru: 'Демо-инструменты' })}>
        <div className="grp-m">
          <label className="field">
            <span>{t({ en: 'Open demo bank', uz: 'Ochiq demo bank', ru: 'Открытый демо-банк' })}</span>
            <select className="input" value={worldId} tabIndex={open ? 0 : -1} onChange={(event) => setWorldId(event.target.value)}>
              {(worlds ?? [{ world_id: worldId, status: 'ready', progress: 100, size: 20000, seed: 0, as_of_date: '' } as World]).map((world) => (
                <option key={world.world_id} value={world.world_id}>
                  {name(world)} · {formatNumber(world.size)} {t({ en: 'loans', uz: 'kredit', ru: 'кредитов' })}{world.status === 'ready' ? '' : ` · ${world.progress}%`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grp-m">
          <span className="lbl">{t({ en: 'Act as', uz: 'Kim sifatida', ru: 'Действовать как' })}</span>
          <div className="roles" role="radiogroup">
            {ROLES.map((role) => (
              <button key={role} type="button" role="radio" aria-checked={actor === role} tabIndex={open ? 0 : -1} onClick={() => setActor(role)}>
                {t(ACTING_AS[role])}
                {actor === role && <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2.5 7.4 5.6 10.4 11.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </button>
            ))}
          </div>
          <p className="note" style={{ padding: '8px 2px 0' }}>{t({ en: 'An officer proposes a refund; the compliance head approves it.', uz: 'Xodim qaytarishni taklif qiladi; komplayens rahbari tasdiqlaydi.', ru: 'Сотрудник предлагает возврат; руководитель комплаенса утверждает.' })}</p>
        </div>
        <div className="grp-m" style={{ paddingTop: 2 }}>
          <Link className="go-link" to="/app/demo" tabIndex={open ? 0 : -1}>{t({ en: 'Build a demo bank', uz: 'Demo bank yaratish', ru: 'Создать демо-банк' })}<span aria-hidden="true">→</span></Link>
          <Link className="go-link" to="/app/demo#public" tabIndex={open ? 0 : -1}>{t({ en: 'Public cases from the news', uz: 'Yangiliklardagi ommaviy holatlar', ru: 'Публичные случаи из новостей' })}<span aria-hidden="true">→</span></Link>
          <Link className="go-link" to="/app/results" tabIndex={open ? 0 : -1}>{t({ en: 'Results and the answer key', uz: 'Natijalar va javoblar kaliti', ru: 'Результаты и ключ ответов' })}<span aria-hidden="true">→</span></Link>
        </div>
        <p className="note">{t({ en: 'Complaints are read by', uz: 'Shikoyatlarni oʻqiydi:', ru: 'Жалобы читает' })} {readBy}. {t({ en: 'Every customer, card and payment in a demo bank is invented.', uz: 'Demo bankdagi barcha mijozlar, kartalar va toʻlovlar oʻylab topilgan.', ru: 'Все клиенты, карты и платежи в демо-банке вымышлены.' })}</p>
      </div>
    </div>
  )
}

const NAV: { to: string; label: Words; also?: string[]; count?: 'decide' | 'incidents' }[] = [
  { to: '/app', label: { en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' }, also: ['/app/case', '/app/others'], count: 'decide' },
  { to: '/app/incidents', label: { en: 'Incidents', uz: 'Hodisalar', ru: 'Инциденты' }, count: 'incidents' },
  { to: '/app/report', label: { en: 'Fix plan and report', uz: 'Tuzatish rejasi va hisobot', ru: 'План исправления и отчёт' } },
  { to: '/app/audit', label: { en: 'Audit log', uz: 'Audit jurnali', ru: 'Журнал аудита' } },
]

export function Frame() {
  const { pathname } = useLocation()
  const { ui, setUi, t } = useLang()
  const { worldId } = useSession()
  const bar = useRef<HTMLElement>(null)
  const [counts, setCounts] = useState<{ decide: number; incidents: number }>({ decide: 0, incidents: 0 })

  // What waits for a person, again after every move: a decision or a step changes it.
  useEffect(() => {
    let live = true
    Promise.all([api.complaints('CHECKED'), api.incidents()]).then(
      ([waiting, incidents]) => live && setCounts({ decide: waiting.total, incidents: incidents.items.filter((item) => item.status !== 'NOTIFIED').length }),
      () => undefined,
    )
    return () => { live = false }
  }, [pathname, worldId])

  // The bar takes the colour of what is under it.
  useEffect(() => {
    const paint = () => {
      const dark = document.querySelector('.fg [data-dark]')
      const box = dark?.getBoundingClientRect()
      const height = bar.current?.offsetHeight ?? 64
      // The bar sits above the page, so "under it" is what touches its lower edge.
      bar.current?.classList.toggle('on-dark', Boolean(box && box.top <= height + 1 && box.bottom > height / 2))
    }
    paint()
    window.addEventListener('scroll', paint, { passive: true })
    const watch = new MutationObserver(paint)
    watch.observe(document.body, { childList: true, subtree: true })
    return () => {
      window.removeEventListener('scroll', paint)
      watch.disconnect()
    }
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  const active = (item: (typeof NAV)[number]) =>
    item.to === '/app' ? pathname === '/app' || (item.also ?? []).some((prefix) => pathname.startsWith(prefix)) : pathname.startsWith(item.to)

  return (
    <div className="fg">
      <header className="fg-top" ref={bar}>
        <div className="in">
          <Link className="brand" to="/app" aria-label="FeeGuard"><Mark />FeeGuard</Link>
          <nav aria-label="FeeGuard">
            {NAV.map((item) => {
              const n = item.count ? counts[item.count] : 0
              return (
                <NavLink key={item.to} to={item.to} end={item.to === '/app'} aria-current={active(item) ? 'page' : undefined}>
                  {t(item.label)}
                  {n > 0 && <span className="count" aria-label={t({ en: `${n} waiting for a person`, uz: `${n} ta inson qarorini kutmoqda`, ru: `${n} ждут решения человека` })}>{n}</span>}
                </NavLink>
              )
            })}
          </nav>
          <div className="end">
            <NavLink className="side" to="/app/phone">{t({ en: 'Customer’s phone', uz: 'Mijoz telefoni', ru: 'Телефон клиента' })}</NavLink>
            <LangMenu lang={ui} label={t({ en: 'Language', uz: 'Til', ru: 'Язык' })} pick={setUi} />
            <DemoTools />
          </div>
        </div>
      </header>
      {usingSampleData && <p className="wrap note" style={{ paddingTop: 10 }}>Sample data: these screens show examples, not results from the engine.</p>}
      {/* A screen starts again when another demo bank is opened. */}
      <main className="fg-main" key={worldId}>
        <Outlet />
      </main>
      <footer className="fg-foot">
        <div className="wrap">
          <span>{t({ en: 'FeeGuard only reads the bank’s records. A person approves every result.', uz: 'FeeGuard bank yozuvlarini faqat oʻqiydi. Har bir natijani inson tasdiqlaydi.', ru: 'FeeGuard только читает записи банка. Каждый результат утверждает человек.' })}</span>
          <span>{t({ en: 'Demo bank: every customer, card and payment is invented.', uz: 'Demo bank: barcha mijozlar, kartalar va toʻlovlar oʻylab topilgan.', ru: 'Демо-банк: все клиенты, карты и платежи вымышлены.' })}</span>
        </div>
      </footer>
    </div>
  )
}

/** An address that belongs to no screen. */
export function NotFound() {
  const { t } = useLang()
  return (
    <div className="wrap">
      <header className="head">
        <div>
          <h1 className="h-big">{t({ en: 'No such screen', uz: 'Bunday ekran yoʻq', ru: 'Такого экрана нет' })}</h1>
          <p className="sub">{t({ en: 'This address does not belong to FeeGuard.', uz: 'Bu manzil FeeGuardga tegishli emas.', ru: 'Этот адрес не относится к FeeGuard.' })}</p>
        </div>
      </header>
      <Link className="btn" to="/app">{t({ en: 'Open the complaints', uz: 'Shikoyatlarni ochish', ru: 'Открыть жалобы' })} <span className="arrow">→</span></Link>
    </div>
  )
}
