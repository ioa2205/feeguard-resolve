import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { usingSampleData } from '../api'
import { UI_LANGS, useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { Actor } from '../types'

const ACTING_AS_T: Record<Actor, Words> = {
  officer: { en: 'Complaint officer', uz: 'Shikoyatlar xodimi', ru: 'Сотрудник по жалобам' },
  compliance: { en: 'Compliance head', uz: 'Komplayens rahbari', ru: 'Руководитель комплаенса' },
  jury: { en: 'Jury', uz: 'Hakamlar', ru: 'Жюри' },
}

// The frame of every screen (DESIGN section 7.1): band, menu, specimen strip, foot.
// Two zones with two band colours, so a person always knows whether they are in
// the product or in the fake bank. The colour never works alone: the zone is named.

const ZONES = [
  {
    key: 'feeguard',
    label: { en: 'FeeGuard · the product', uz: 'FeeGuard · mahsulot', ru: 'FeeGuard · продукт' },
    home: '/',
    band: 'bg-ink text-sheet',
    menu: [
      { to: '/', label: { en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' } },
      { to: '/case', label: { en: 'Case', uz: 'Ish', ru: 'Дело' } },
      { to: '/scan', label: { en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' } },
      { to: '/reports', label: { en: 'Fix plan and report', uz: 'Tuzatish rejasi va hisobot', ru: 'План исправления и отчёт' } },
      { to: '/audit', label: { en: 'Audit log', uz: 'Audit jurnali', ru: 'Журнал аудита' } },
    ],
  },
  {
    key: 'sandbox',
    label: { en: 'Sandbox Bank · the demo', uz: 'Sinov banki · demo', ru: 'Тестовый банк · демо' },
    home: '/sandbox/customer',
    band: 'bg-specimen text-ink',
    menu: [
      { to: '/sandbox/customer', label: { en: 'Write a complaint, watch it live', uz: 'Shikoyat yozing, jonli kuzating', ru: 'Напишите жалобу, смотрите вживую' } },
      { to: '/sandbox/build', label: { en: 'Build a demo bank', uz: 'Demo bank yaratish', ru: 'Создать демо-банк' } },
      { to: '/sandbox/scoreboard', label: { en: 'Scoreboard', uz: 'Natijalar', ru: 'Результаты' } },
    ],
  },
]
const ACTORS: Actor[] = ['officer', 'compliance', 'jury']
const CHOSEN = 'font-semibold underline underline-offset-4'

export function Frame() {
  const { pathname } = useLocation()
  const { actor, setActor, worldId, setWorldId, worlds, health, bankName } = useSession()
  const { ui, setUi, t } = useLang()
  const zone = pathname.startsWith('/sandbox') ? ZONES[1] : ZONES[0]
  const world = worlds?.find((item) => item.world_id === worldId)

  return (
    <div className="flex min-h-screen flex-col">
      <header className={`${zone.band} print:hidden`}>
        <div className="mx-auto max-w-[1440px] px-4 py-2 md:px-6">
          <div className="flex flex-wrap items-center gap-x-6">
            <span className="font-condensed text-stamp-text font-bold tracking-[0.08em]">FEEGUARD RESOLVE</span>
            <nav aria-label="Zone" className="flex flex-wrap gap-x-4">
              {ZONES.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.home}
                  aria-current={item === zone ? 'true' : undefined}
                  className={`flex min-h-10 items-center ${item === zone ? CHOSEN : ''}`}
                >
                  {t(item.label)}
                </NavLink>
              ))}
            </nav>
            <div role="radiogroup" aria-label="Language" className="ml-auto flex flex-wrap items-center gap-x-3">
              {UI_LANGS.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  role="radio"
                  lang={item.attr}
                  aria-checked={item.code === ui}
                  onClick={() => setUi(item.code)}
                  className={`min-h-10 ${item.code === ui ? CHOSEN : ''}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-table flex flex-wrap items-center gap-x-6 gap-y-1">
            <label className="flex min-h-10 items-center gap-2">
              {t({ en: 'Demo bank:', uz: 'Demo bank:', ru: 'Демо-банк:' })}
              {worlds ? (
                <select
                  value={worldId}
                  onChange={(event) => setWorldId(event.target.value)}
                  className="rounded-field min-h-10 border border-current bg-transparent px-2 font-semibold"
                >
                  {worlds.map((item) => (
                    <option key={item.world_id} value={item.world_id} className="bg-sheet text-ink">
                      {bankName(item.world_id)} · {t({ en: 'seed', uz: 'seed', ru: 'seed' })} {item.seed}
                      {item.status === 'ready' ? '' : ` · ${item.status}`}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-semibold">{bankName(worldId)}</span>
              )}
              {world && <span className="sr-only">{world.size} loans</span>}
            </label>

            <div role="radiogroup" aria-label="Acting as" className="flex flex-wrap items-center gap-x-3">
              <span>{t({ en: 'Acting as:', uz: 'Rol:', ru: 'Роль:' })}</span>
              {ACTORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={item === actor}
                  onClick={() => setActor(item)}
                  className={`min-h-10 ${item === actor ? CHOSEN : ''}`}
                >
                  {t(ACTING_AS_T[item])}
                </button>
              ))}
            </div>

            <span>
              {t({ en: 'Complaints are read by:', uz: 'Shikoyatlarni oʻqiydi:', ru: 'Жалобы читает:' })}{' '}
              <span className="font-semibold">{health
                  ? health.llm_mode === 'llm'
                    ? t({ en: 'the AI', uz: 'sunʼiy intellekt', ru: 'ИИ' }) + (health.model_name ? ` (${health.model_name})` : '')
                    : t({ en: 'rules (the AI is off)', uz: 'qoidalar (SI oʻchiq)', ru: 'правила (ИИ выключен)' })
                  : t({ en: 'not known, the server did not answer', uz: 'nomaʼlum, server javob bermadi', ru: 'неизвестно, сервер не ответил' })}</span>
            </span>
          </div>
        </div>
      </header>

      <nav aria-label="Screens" className="border-line bg-sheet border-b print:hidden">
        <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-6 px-4 md:px-6">
          {zone.menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `flex min-h-10 items-center ${isActive ? CHOSEN : ''}`}
            >
              {t(item.label)}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-line bg-sheet border-b print:hidden">
        <p className="mx-auto max-w-[1440px] px-4 py-1 md:px-6">
          <span className="font-condensed text-label mr-3 font-semibold tracking-[0.06em]">NAMUNA · SPECIMEN</span>
          {t({ en: 'Every customer, card and payment here is invented.', uz: 'Bu yerdagi barcha mijozlar, kartalar va toʻlovlar oʻylab topilgan.', ru: 'Все клиенты, карты и платежи здесь вымышлены.' })}
          {usingSampleData && (
            <strong className="ml-3">Sample data: these screens show examples, not results from the engine.</strong>
          )}
        </p>
      </div>

      {/* A screen starts again when another demo bank is chosen. */}
      <main key={worldId} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
        <Outlet />
      </main>

      <footer className="border-line text-ink-soft border-t print:hidden">
        <p className="mx-auto max-w-[1440px] px-4 py-3 md:px-6">
          {t({ en: 'FeeGuard only reads bank data. A person approves every result.', uz: 'FeeGuard bank maʼlumotlarini faqat oʻqiydi. Har bir natijani inson tasdiqlaydi.', ru: 'FeeGuard только читает данные банка. Каждый результат утверждает человек.' })}
        </p>
      </footer>
    </div>
  )
}
