import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { usingSampleData } from '../api'
import { useSession } from '../session'
import type { Actor } from '../types'
import { ACTING_AS, READ_BY } from '../words'

// The frame of every screen (DESIGN section 7.1): band, menu, specimen strip, foot.
// Two zones with two band colours, so a person always knows whether they are in
// the product or in the fake bank. The colour never works alone: the zone is named.

const ZONES = [
  {
    key: 'feeguard',
    label: 'FeeGuard · the product',
    home: '/',
    band: 'bg-ink text-sheet',
    menu: [
      { to: '/', label: 'Complaints' },
      { to: '/case', label: 'Case' },
      { to: '/scan', label: 'Find others' },
      { to: '/reports', label: 'Fix plan and report' },
      { to: '/audit', label: 'Audit log' },
    ],
  },
  {
    key: 'sandbox',
    label: 'Sandbox Bank · the demo',
    home: '/sandbox/customer',
    band: 'bg-specimen text-ink',
    menu: [
      { to: '/sandbox/customer', label: 'A customer’s phone' },
      { to: '/sandbox/build', label: 'Build a demo bank' },
      { to: '/sandbox/scoreboard', label: 'Scoreboard' },
    ],
  },
]
const ACTORS: Actor[] = ['officer', 'compliance', 'jury']
const CHOSEN = 'font-semibold underline underline-offset-4'

function bankName(worldId: string): string {
  return worldId === 'default' ? 'Default' : worldId
}

export function Frame() {
  const { pathname } = useLocation()
  const { actor, setActor, worldId, setWorldId, worlds, health } = useSession()
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
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="text-table flex flex-wrap items-center gap-x-6 gap-y-1">
            <label className="flex min-h-10 items-center gap-2">
              Demo bank:
              {worlds ? (
                <select
                  value={worldId}
                  onChange={(event) => setWorldId(event.target.value)}
                  className="rounded-field min-h-10 border border-current bg-transparent px-2 font-semibold"
                >
                  {worlds.map((item) => (
                    <option key={item.world_id} value={item.world_id} className="bg-sheet text-ink">
                      {bankName(item.world_id)} · seed {item.seed}
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
              <span>Acting as:</span>
              {ACTORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={item === actor}
                  onClick={() => setActor(item)}
                  className={`min-h-10 ${item === actor ? CHOSEN : ''}`}
                >
                  {ACTING_AS[item]}
                </button>
              ))}
            </div>

            <span>
              Complaints are read by:{' '}
              <span className="font-semibold">{health ? READ_BY[health.llm_mode] : 'not known, the server did not answer'}</span>
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
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="border-line bg-sheet border-b print:hidden">
        <p className="mx-auto max-w-[1440px] px-4 py-1 md:px-6">
          <span className="font-condensed text-label mr-3 font-semibold tracking-[0.06em]">NAMUNA · SPECIMEN</span>
          Every customer, card and payment here is invented.
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
          FeeGuard only reads bank data. A person approves every result.
        </p>
      </footer>
    </div>
  )
}
