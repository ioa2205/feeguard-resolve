import { NavLink, Outlet, useLocation } from 'react-router-dom'

// The frame of every screen (DESIGN section 7.1): band, menu, specimen strip, foot.
// Task C1 adds the role picker, the demo bank selector and the reader note to the band.

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

export function Frame() {
  const { pathname } = useLocation()
  const zone = pathname.startsWith('/sandbox') ? ZONES[1] : ZONES[0]

  return (
    <div className="flex min-h-screen flex-col">
      <header className={zone.band}>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:px-6">
          <span className="font-condensed text-stamp-text font-bold tracking-[0.08em]">FEEGUARD RESOLVE</span>
          <nav aria-label="Zone" className="flex flex-wrap gap-x-4">
            {ZONES.map((item) => (
              <NavLink
                key={item.key}
                to={item.home}
                aria-current={item === zone ? 'true' : undefined}
                className={`flex min-h-10 items-center ${item === zone ? 'font-semibold underline underline-offset-4' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <nav aria-label="Screens" className="border-line bg-sheet border-b">
        <div className="mx-auto flex max-w-[1440px] flex-wrap gap-x-6 px-4 md:px-6">
          {zone.menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex min-h-10 items-center ${isActive ? 'font-semibold underline underline-offset-4' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <p className="border-line bg-sheet border-b">
        <span className="mx-auto block max-w-[1440px] px-4 py-1 md:px-6">
          <span className="font-condensed text-label mr-3 font-semibold tracking-[0.06em]">
            NAMUNA · SPECIMEN
          </span>
          Every customer, card and payment here is invented.
        </span>
      </p>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 md:px-6">
        <Outlet />
      </main>

      <footer className="border-line text-ink-soft border-t">
        <p className="mx-auto max-w-[1440px] px-4 py-3 md:px-6">
          FeeGuard only reads bank data. A person approves every result.
        </p>
      </footer>
    </div>
  )
}
