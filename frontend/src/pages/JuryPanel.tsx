import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { CustomerPicker } from '../components/CustomerPicker'
import { Button, Label, Loading, PageHead, Problem } from '../components/Parts'
import { count, formatDate, formatDateTime, formatNumber, formatSom } from '../format'
import { useLoad } from '../hooks'
import { useSession } from '../session'
import type { Customer, DefectType, Preset, Reveal, TamperResult, World, WorldSize } from '../types'
import { DEFAULT_WORLD_ID } from '../types'
import { MISTAKE } from '../words'

// Build a demo bank (DESIGN section 7.4): a form on one sheet. Main action: "Build the
// demo bank". Below it smaller actions: "Load this public case", "Add a debit by hand"
// and "Show the answer key". This is the Sandbox Bank; FeeGuard never sees the answer key.

const TYPES: DefectType[] = ['DOUBLE_DEBIT', 'EARLY_DEBIT', 'LATE_POSTING', 'ILLEGAL_FEE']
const SHEET = 'border-line bg-sheet rounded-sheet border p-4 md:p-6'
const FIELD = 'rounded-field border-ink-soft bg-sheet min-h-10 border px-2'

function Build() {
  const { refreshWorlds, setWorldId, worldId: openBank, bankName } = useSession()
  const navigate = useNavigate()
  // The screen starts again when the new bank opens, so "ready" travels in the address.
  const [params] = useSearchParams()
  const ready = params.get('built') === openBank ? openBank : null
  const ids = { seed: useId(), traps: useId(), complaints: useId() }
  const [seed, setSeed] = useState(101)
  const [size, setSize] = useState<WorldSize>(5000)
  const [chosen, setChosen] = useState<Record<DefectType, boolean>>({
    DOUBLE_DEBIT: true, EARLY_DEBIT: true, LATE_POSTING: true, ILLEGAL_FEE: true,
  })
  const [rates, setRates] = useState<Record<DefectType, number>>({
    DOUBLE_DEBIT: 2, EARLY_DEBIT: 2, LATE_POSTING: 2, ILLEGAL_FEE: 2,
  })
  const [traps, setTraps] = useState(20)
  const [complaintRate, setComplaintRate] = useState(15)
  const [surprise, setSurprise] = useState(false)
  const [building, setBuilding] = useState<World | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  const none = !surprise && !TYPES.some((type) => chosen[type])

  function follow(worldId: string) {
    timer.current = window.setInterval(async () => {
      try {
        const world = await api.world(worldId)
        setBuilding(world)
        if (world.status === 'building') return
        if (timer.current) window.clearInterval(timer.current)
        if (world.status === 'failed') {
          setBuilding(null)
          setError(new Error('Building the demo bank failed on the server. Try again, perhaps with another seed.'))
          return
        }
        await refreshWorlds()
        setBuilding(null)
        navigate(`/sandbox/build?built=${encodeURIComponent(worldId)}`)
        setWorldId(worldId)
      } catch (failure) {
        if (timer.current) window.clearInterval(timer.current)
        setBuilding(null)
        setError(failure as Error)
      }
    }, 1000)
  }

  async function build(event?: FormEvent) {
    event?.preventDefault()
    setError(null)
    try {
      const defects = Object.fromEntries(
        TYPES.filter((type) => chosen[type]).map((type) => [type, rates[type] / 100]),
      )
      const created = await api.createWorld({
        seed, size, defects, complaint_rate: complaintRate / 100, traps, surprise,
      })
      setBuilding({ world_id: created.world_id, status: 'building', progress: 0, size, seed, as_of_date: '' })
      follow(created.world_id)
    } catch (failure) {
      setError(failure as Error)
    }
  }

  return (
    <form onSubmit={build} className={`${SHEET} max-w-[70ch] space-y-4`}>
      <h2 className="font-condensed text-stamp-text font-semibold">A new demo bank</h2>
      <p>
        You choose the seed and the mistakes; the Sandbox Bank hides them among normal payments. The same seed and
        choices always give the same bank, so anyone can repeat it.
      </p>
      <div className="flex flex-wrap gap-6">
        <div>
          <label htmlFor={ids.seed} className="block"><Label>Seed</Label></label>
          <input id={ids.seed} type="number" min={0} max={2147483647} value={seed} required
            onChange={(event) => setSeed(Number(event.target.value))} className={`${FIELD} w-40`} />
        </div>
        <fieldset>
          <legend><Label>Size</Label></legend>
          <div className="flex gap-4">
            {([5000, 20000] as WorldSize[]).map((option) => (
              <label key={option} className="flex min-h-10 items-center gap-2">
                <input type="radio" name="size" checked={size === option} onChange={() => setSize(option)} />
                {formatNumber(option)} loans
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="text-small">5 000 loans take a few seconds to build; 20 000 loans take up to a minute.</p>

      <fieldset className="space-y-2">
        <legend><Label>Mistakes to hide, and the share of loans for each</Label></legend>
        {surprise && <p>Surprise me is on: the Sandbox Bank chooses the mistakes and their shares, and keeps them secret.</p>}
        {TYPES.map((type) => (
          <div key={type} className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-10 w-64 items-center gap-2">
              <input type="checkbox" disabled={surprise} checked={chosen[type]}
                onChange={(event) => setChosen({ ...chosen, [type]: event.target.checked })} />
              {MISTAKE[type]}
            </label>
            <label className="flex items-center gap-2">
              <input type="number" min={0.5} max={3} step={0.5} disabled={surprise || !chosen[type]} value={rates[type]}
                onChange={(event) => setRates({ ...rates, [type]: Number(event.target.value) })}
                className={`${FIELD} w-20`} aria-label={`${MISTAKE[type]}, per cent of loans`} />
              % of loans
            </label>
          </div>
        ))}
        <p className="text-small">From 0.5% to 3% each.</p>
      </fieldset>

      <div className="flex flex-wrap gap-6">
        <div>
          <label htmlFor={ids.traps} className="block"><Label>Look-alike complaints</Label></label>
          <input id={ids.traps} type="number" min={0} max={200} value={traps}
            onChange={(event) => setTraps(Number(event.target.value))} className={`${FIELD} w-28`} />
          <p className="text-small max-w-[30ch]">Customers who complain although the bank was right.</p>
        </div>
        <div>
          <label htmlFor={ids.complaints} className="block"><Label>Wronged customers who complain</Label></label>
          <input id={ids.complaints} type="number" min={0} max={100} value={complaintRate}
            onChange={(event) => setComplaintRate(Number(event.target.value))} className={`${FIELD} w-28`} /> %
          <p className="text-small max-w-[30ch]">The others never complain. Find others must find them.</p>
        </div>
      </div>

      <label className="flex min-h-10 items-center gap-2">
        <input type="checkbox" checked={surprise} onChange={(event) => setSurprise(event.target.checked)} />
        Surprise me: let the Sandbox Bank choose the mistakes in secret
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <Button main type="submit" disabled={Boolean(building) || none}>Build the demo bank</Button>
        {none && <span className="text-small">Choose at least one mistake, or Surprise me.</span>}
      </div>
      {building && (
        <div role="status" aria-live="polite" className="space-y-1">
          <p>Building demo bank {bankName(building.world_id)}: {building.progress}%.</p>
          <div className="bg-stripe h-3 w-full max-w-md">
            <div className="bg-ink h-3" style={{ width: `${building.progress}%` }} />
          </div>
        </div>
      )}
      {ready && (
        <p role="status" className="border-stamp rounded-sheet border-2 p-3">
          Demo bank <strong>{bankName(ready)}</strong> is ready and now open. Write a complaint on{' '}
          <Link to="/sandbox/customer" className="text-stamp underline">A customer’s phone</Link>, or open the{' '}
          <Link to="/" className="text-stamp underline">Complaints</Link> screen.
        </p>
      )}
      {error && <Problem error={error} />}
    </form>
  )
}

// Two mistakes from public news, each rebuilt as a demo bank with fixed settings (task P1).
// One click loads it: built the first time, opened at once after that.
function PublicCases() {
  const { presets, refreshWorlds, setWorldId, worldId: openBank } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const opened = presets.find((preset) => preset.preset_id === params.get('case') && preset.world_id === openBank)
  const [loading, setLoading] = useState<{ preset: Preset; progress: number } | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  async function load(preset: Preset) {
    setError(null)
    setLoading({ preset, progress: 0 })
    try {
      const { world_id: worldId } = await api.openPreset(preset.preset_id)
      for (;;) {
        const world = await api.world(worldId)
        if (!alive.current) return
        if (world.status === 'ready') break
        if (world.status === 'failed') throw new Error('Building the demo bank failed on the server. Try again.')
        setLoading({ preset, progress: world.progress })
        await new Promise((done) => window.setTimeout(done, 1000))
      }
      await refreshWorlds()
      navigate(`/sandbox/build?case=${encodeURIComponent(preset.preset_id)}`)
      setWorldId(worldId)
    } catch (failure) {
      if (!alive.current) return
      setLoading(null)
      setError(failure as Error)
    }
  }

  if (presets.length === 0) return null
  return (
    <section className={`${SHEET} max-w-[70ch] space-y-4`}>
      <h2 className="font-condensed text-stamp-text font-semibold">Public cases</h2>
      <p>
        In October 2025 the Central Bank fined banks for these two mistakes. Each is rebuilt here as a demo bank with
        invented customers. Load one, check one complaint about it, then press Find others: FeeGuard should find the
        whole group.
      </p>
      {presets.map((preset) => (
        <div key={preset.preset_id} className="border-line space-y-2 border-t pt-3">
          <h3 className="font-semibold">{preset.title}</h3>
          <p>{preset.what_happened}</p>
          <p className="text-small">
            Only this mistake is hidden, in {formatNumber(preset.size)} loans, seed {preset.seed}. Source:{' '}
            {preset.sources.map((source, index) => (
              <span key={source.url}>
                {index > 0 && ' · '}
                <a href={source.url} target="_blank" rel="noreferrer" className="text-stamp underline">
                  {source.name}, {formatDate(source.published)}
                </a>
              </span>
            ))}
          </p>
          <Button disabled={Boolean(loading)} onClick={() => load(preset)}>
            {loading?.preset === preset ? `Loading… ${loading.progress}%` : 'Load this public case'}
          </Button>
          {opened === preset && (
            <p role="status" className="border-stamp rounded-sheet border-2 p-3">
              This public case is now the open demo bank. Open the{' '}
              <Link to="/" className="text-stamp underline">Complaints</Link> screen, check a complaint about “
              {MISTAKE[preset.mistake].toLowerCase()}”, then press Find others.
            </p>
          )}
        </div>
      ))}
      {error && <Problem error={error} />}
      <p className="text-small text-ink-soft">
        Rebuilt from public news. We do not claim to know those banks’ internal causes.
      </p>
    </section>
  )
}

function AddDebit() {
  const { worldId, presets } = useSession()
  const ids = { loan: useId(), card: useId(), amount: useId() }
  const [customer, setCustomer] = useState<Customer | null>(null)
  const statement = useLoad(() => (customer ? api.statement(customer.customer_id) : Promise.resolve(null)), [customer?.customer_id])
  const [loan, setLoan] = useState('')
  const [card, setCard] = useState('')
  const [amount, setAmount] = useState(500000)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [added, setAdded] = useState<TamperResult | null>(null)

  const loaded = statement.state.status === 'ready' ? statement.state.data : null
  useEffect(() => {
    setLoan(loaded?.contracts[0]?.contract_id ?? '')
    setCard(loaded?.cards[0]?.card_id ?? '')
  }, [loaded])

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setAdded(null)
    try {
      setAdded(await api.tamper(worldId, { contract_id: loan, action: 'extra_debit', amount, card_id: card }))
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${SHEET} max-w-[70ch] space-y-3`}>
      <h2 className="font-condensed text-stamp-text font-semibold">Add a debit by hand</h2>
      <p>
        Take money from a customer&apos;s card a second time, as a broken billing run would. Then write a complaint for
        that customer: FeeGuard must find the debit you added.
      </p>
      {worldId === DEFAULT_WORLD_ID ? (
        <p>
          The default demo bank stays as it was built, so every visitor sees the same numbers. Build your own demo bank
          above; a debit can be added there.
        </p>
      ) : presets.some((preset) => preset.world_id === worldId) ? (
        <p>
          A public-case demo bank stays as it was built, so it shows the public mistake alone. Build your own demo bank
          above; a debit can be added there.
        </p>
      ) : (
        <>
          <CustomerPicker chosen={customer?.customer_id} onPick={setCustomer} />
          {statement.state.status === 'loading' && customer && <Loading lines={2} />}
          {statement.state.status === 'error' && <Problem error={statement.state.error} onRetry={statement.reload} />}
          {loaded && (
            <form onSubmit={add} className="space-y-3">
              <div className="flex flex-wrap gap-4">
                <div>
                  <label htmlFor={ids.loan} className="block"><Label>Loan</Label></label>
                  <select id={ids.loan} value={loan} onChange={(event) => setLoan(event.target.value)} className={FIELD}>
                    {loaded.contracts.map((contract) => (
                      <option key={contract.contract_id} value={contract.contract_id}>
                        {contract.contract_id}, {contract.product_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={ids.card} className="block"><Label>Card</Label></label>
                  <select id={ids.card} value={card} onChange={(event) => setCard(event.target.value)} className={FIELD}>
                    {loaded.cards.map((item) => <option key={item.card_id} value={item.card_id}>{item.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={ids.amount} className="block"><Label>Amount, soʻm</Label></label>
                  <input id={ids.amount} type="number" min={1000} max={100000000} step={1000} value={amount}
                    onChange={(event) => setAmount(Number(event.target.value))} className={`${FIELD} w-40`} />
                </div>
              </div>
              <Button type="submit" disabled={busy || !loan || !card}>{busy ? 'Adding…' : 'Add the debit'}</Button>
            </form>
          )}
          {error && <Problem error={error} />}
          {added && customer && (
            <p role="status" className="border-stamp rounded-sheet border-2 p-3">
              {formatSom(added.debit.amount)} was taken from {added.debit.card} for loan {added.debit.contract_id} on{' '}
              {formatDateTime(added.debit.created_at)}, in the same billing run as the debit before it. Now{' '}
              <Link to={`/sandbox/customer?customer=${encodeURIComponent(customer.customer_id)}`} className="text-stamp underline">
                write a complaint for {customer.full_name}
              </Link>{' '}
              and check it in FeeGuard.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function settingLines(settings: Record<string, unknown>): string[] {
  const lines = []
  const defects = settings.defects as Record<string, number> | undefined
  if (defects) {
    const hidden = Object.entries(defects).map(([type, rate]) => `${MISTAKE[type as DefectType] ?? type} ${Math.round(rate * 1000) / 10}%`)
    lines.push(`Mistakes hidden: ${hidden.join(', ') || 'none'}${settings.surprise ? ' (chosen by surprise)' : ''}.`)
  }
  const causes = settings.hidden as Record<string, Record<string, unknown>> | undefined
  for (const [type, detail] of Object.entries(causes ?? {})) {
    const facts = Object.entries(detail).map(([key, value]) => `${key.replace(/_/g, ' ')}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    lines.push(`${MISTAKE[type as DefectType] ?? type}, hidden cause: ${facts.join('; ')}.`)
  }
  lines.push(`World date ${String(settings.as_of_date)} · ${String(settings.traps)} look-alike complaints asked · ${Math.round(Number(settings.complaint_rate) * 100)}% of wronged customers complain.`)
  return lines
}

function AnswerKey() {
  const { worldId, bankName } = useSession()
  const { hash } = useLocation()
  const section = useRef<HTMLElement>(null)
  const [key, setKey] = useState<Reveal | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    if (hash === '#answer-key') section.current?.scrollIntoView()
  }, [hash])

  async function show() {
    setBusy(true)
    setError(null)
    try {
      setKey(await api.reveal(worldId))
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  const rows = key ? (all ? key.items : key.items.slice(0, 50)) : []
  return (
    <section id="answer-key" ref={section} className={`${SHEET} space-y-3`}>
      <h2 className="font-condensed text-stamp-text font-semibold">Show the answer key</h2>
      <p className="max-w-[70ch]">
        Every mistake the Sandbox Bank hid in demo bank {bankName(worldId)}, and its hidden settings. FeeGuard never
        reads this. Open it after the demo; opening it is written to the audit log.
      </p>
      {!key && <Button disabled={busy} onClick={show}>{busy ? 'Opening…' : 'Show the answer key'}</Button>}
      {error && <Problem error={error} onRetry={show} />}
      {key && (
        <>
          <ul className="max-w-[90ch] space-y-1">
            <li>Seed {key.seed}.</li>
            {settingLines(key.settings).map((text) => <li key={text}>{text}</li>)}
          </ul>
          <div className="overflow-x-auto">
            <table className="text-table w-full max-w-3xl min-w-[520px] border-collapse">
              <thead>
                <tr className="border-ink border-b-2 text-left">
                  <th scope="col" className="px-3 py-2"><Label>Mistake</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Kind</Label></th>
                  <th scope="col" className="px-3 py-2 text-right"><Label>Rows</Label></th>
                  <th scope="col" className="px-3 py-2 text-right"><Label>soʻm</Label></th>
                </tr>
              </thead>
              <tbody>
                {key.counts.map((row, index) => (
                  <tr key={`${row.defect_type}-${row.is_trap}`} className={`border-line border-t ${index % 2 ? 'bg-stripe' : ''}`}>
                    <td className="px-3 py-2">{MISTAKE[row.defect_type]}</td>
                    <td className="px-3 py-2">{row.is_trap ? 'Look-alike case (bank was right)' : 'Real mistake'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.count)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-line rounded-sheet overflow-x-auto border">
            <table className="text-table w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="border-ink border-b-2 text-left">
                  <th scope="col" className="px-3 py-2"><Label>Row</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Mistake</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Loan</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Installment</Label></th>
                  <th scope="col" className="px-3 py-2 text-right"><Label>soʻm</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Hidden cause</Label></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className={`border-line border-t ${index % 2 ? 'bg-stripe' : ''}`}>
                    <td className="px-3 py-2">{row.id}</td>
                    <td className="px-3 py-2">{MISTAKE[row.defect_type]}{row.is_trap && ', look-alike'}</td>
                    <td className="px-3 py-2">{row.contract_id}</td>
                    <td className="px-3 py-2">{row.installment_n === null ? 'None: a one-time fee' : `No. ${row.installment_n}`}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.excess_amount)}</td>
                    <td className="px-3 py-2">{row.cause_tag.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-soft text-small">
            {count(rows.length, 'row')} shown of {formatNumber(key.total)}.{' '}
            {!all && key.items.length > rows.length && (
              <button type="button" className="text-stamp underline" onClick={() => setAll(true)}>
                Show all {formatNumber(key.total)} rows
              </button>
            )}
          </p>
        </>
      )}
    </section>
  )
}

export default function JuryPanel() {
  const { worldId } = useSession()
  return (
    <>
      <PageHead
        title="Build a demo bank"
        sentence="Create a new fake bank, load a public case, add a debit by hand, or open the answer key."
      />
      <div className="space-y-6">
        <Build />
        <PublicCases />
        <div key={worldId} className="space-y-6">
          <AddDebit />
          <AnswerKey />
        </div>
      </div>
    </>
  )
}
