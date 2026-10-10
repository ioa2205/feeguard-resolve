import { Link } from 'react-router-dom'

import { api } from '../api'
import { Label, Loading, PageHead, Problem } from '../components/Parts'
import { formatNumber } from '../format'
import { useLoad } from '../hooks'
import { useSession } from '../session'
import type { LanguageScore, ScoreRow, Scoreboard as Board, Timings } from '../types'
import { MISTAKE, READ_BY } from '../words'

// The Scoreboard (DESIGN section 7.4): one headline sentence, then one table row per
// mistake: hidden, found, missed, false alarms. Proof 1 of the plan. Every number comes
// from the engine's findings next to the answer key; nothing is typed in here.

function Big({ children }: { children: string }) {
  return <span className="text-headline leading-none font-semibold tabular-nums">{children}</span>
}

function Headline({ board }: { board: Board }) {
  const sum = (pick: (row: ScoreRow) => number) => board.per_type.reduce((total, row) => total + pick(row), 0)
  const hidden = sum((row) => row.planted)
  const found = sum((row) => row.found)
  const falseAlarms = sum((row) => row.false_alarms)
  const traps = sum((row) => row.traps_planted)
  const flagged = sum((row) => row.traps_flagged)
  return (
    <div className="font-condensed text-title space-y-1 leading-tight">
      <p>
        FeeGuard found <Big>{formatNumber(found)}</Big> of the <Big>{formatNumber(hidden)}</Big> hidden mistakes.
      </p>
      <p>
        It raised <Big>{formatNumber(falseAlarms)}</Big> {falseAlarms === 1 ? 'false alarm' : 'false alarms'}.
      </p>
      {traps > 0 && (
        <p>
          It called <Big>{formatNumber(flagged)}</Big> of the <Big>{formatNumber(traps)}</Big> look-alike cases a
          mistake.
        </p>
      )}
    </div>
  )
}

function PerType({ board }: { board: Board }) {
  return (
    <section>
      <div className="border-line bg-sheet rounded-sheet overflow-x-auto border">
        <table className="text-table w-full min-w-[900px] border-collapse">
          <thead>
            <tr className="border-ink border-b-2 text-left">
              <th scope="col" className="px-3 py-2"><Label>Mistake</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>Hidden</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>Found</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>Missed</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>False alarms</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>Hidden, soʻm</Label></th>
              <th scope="col" className="px-3 py-2 text-right"><Label>Found, soʻm</Label></th>
              <th scope="col" className="px-3 py-2"><Label>Look-alike cases called a mistake</Label></th>
            </tr>
          </thead>
          <tbody>
            {board.per_type.map((row, index) => (
              <tr key={row.type} className={`border-line border-t ${index % 2 ? 'bg-stripe' : ''}`}>
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  {MISTAKE[row.type]}
                  {row.type === 'EARLY_DEBIT' && (
                    <span className="text-ink-soft text-small block">soʻm taken early, not money to return</span>
                  )}
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.planted)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.found)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.missed)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.false_alarms)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.amount_planted)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.amount_found)}</td>
                <td className="px-3 py-2 tabular-nums">
                  {row.traps_planted ? `${row.traps_flagged} of ${row.traps_planted}` : 'None hidden'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-small mt-2 max-w-[90ch]">
        A finding counts as found when its mistake, loan and installment match a row of the answer key. A false
        alarm is a finding with no such row. A look-alike case is correct but looks like a mistake; it should never
        be called one.
      </p>
    </section>
  )
}

function Language({ scores }: { scores: LanguageScore[] }) {
  return (
    <section className="max-w-[70ch]">
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>Does it understand real language?</Label></h2>
      {scores.length === 0 ? (
        <p>
          Not measured yet. This test needs the 100 complaints the team writes by hand, in Uzbek (Latin and
          Cyrillic), Russian and a mix. Nobody may generate them.
        </p>
      ) : (
        <ul className="space-y-1">
          {scores.map((score) => (
            <li key={score.mode}>
              Read by {READ_BY[score.mode]}: the kind of complaint was right for {score.type_correct} of {score.n},
              the amount for {score.amount_correct} of {score.n}.
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}

function Speed({ timings }: { timings: Timings }) {
  return (
    <section className="max-w-[70ch]">
      <h2 className="border-ink mb-2 border-b-2 pb-1"><Label>How fast, on this demo bank</Label></h2>
      <ul className="space-y-1">
        <li>
          Building it: {timings.world_build_ms === null ? 'not measured (it was built before timing was added)' : seconds(timings.world_build_ms)}.
        </li>
        <li>
          Checking one complaint:{' '}
          {timings.investigate_ms === null ? 'no complaint checked yet' : `${seconds(timings.investigate_ms)}, the middle value of all checks`}.
        </li>
        <li>
          Finding others:{' '}
          {timings.scan_ms === null ? 'not done yet' : `${seconds(timings.scan_ms)}, the middle value of all searches`}.
        </li>
      </ul>
    </section>
  )
}

export default function Scoreboard() {
  const { worldId, worlds } = useSession()
  const { state, reload } = useLoad(() => api.scoreboard(worldId), [worldId])
  const world = worlds?.find((item) => item.world_id === worldId)

  return (
    <>
      <PageHead title="Scoreboard" sentence="What FeeGuard found, next to what was hidden." />
      {state.status === 'loading' && (
        <Loading lines={6} words={`Checking ${world ? formatNumber(world.size) : 'all'} loans against the answer key…`} />
      )}
      {state.status === 'error' && <Problem error={state.error} onRetry={reload} />}
      {state.status === 'ready' && (
        <div className="space-y-8">
          <p className="text-ink-soft text-small -mt-4">
            Demo bank {state.data.world_id === 'default' ? 'Default' : state.data.world_id} · seed {state.data.seed} ·{' '}
            {formatNumber(state.data.size)} loans · scored in {seconds(state.data.elapsed_ms)}
          </p>
          <Headline board={state.data} />
          <PerType board={state.data} />
          <Language scores={state.data.language_test} />
          <Speed timings={state.data.timings} />
          <div className="flex flex-wrap items-center gap-4">
            <Link
              to="/sandbox/build#answer-key"
              className="rounded-field border-ink bg-ink text-sheet inline-flex min-h-10 items-center border px-4 font-semibold"
            >
              Show the answer key
            </Link>
            <p className="max-w-[50ch]">See every hidden mistake and the hidden settings, row by row.</p>
          </div>
        </div>
      )}
    </>
  )
}
