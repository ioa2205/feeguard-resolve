// The ledger with a day rail (DESIGN section 6): the main picture of FeeGuard.
//
// One row per installment answers two questions: was this amount owed, and was
// it on the right day. The first is in the amounts, the second on the rail.
// It is laid out for a narrow column: the installment and its amounts on the
// first line, then what happened next to the rail, then the sentence.

import { count, formatDate, formatSom, formatTime } from '../format'
import type { ContractTimeline, OtherCharge, RowTreatment, TimelineEvent, TimelineRow } from '../types'
import { MISTAKE, PAID_BY } from '../words'
import { DayRail } from './DayRail'
import { Mark } from './Marks'
import type { MarkKind } from './Marks'
import { Label } from './Parts'

const EVENT_MARK: Record<TimelineEvent['kind'], MarkKind> = {
  TAKEN: 'taken',
  RECORDED: 'recorded',
  CHARGED: 'charged',
}

// A wrong row has a red bar and a wash; a checked row has a stamp-blue bar.
const BAR: Record<RowTreatment, string> = {
  CORRECT: 'border-l-transparent',
  WRONG: 'border-l-wrong bg-wrong-wash',
  TAKEN_EARLY: 'border-l-wrong bg-wrong-wash',
  CHECKED_CORRECT: 'border-l-stamp',
}

function EventLine({ event, dueDate }: { event: TimelineEvent; dueDate: string }) {
  const sameDay = event.at.slice(0, 10) === dueDate
  const when = sameDay ? formatTime(event.at) : `${formatDate(event.at)}, ${formatTime(event.at)}`
  let words: string
  if (event.kind === 'TAKEN') {
    const result =
      event.debit_status === 'FAILED' ? ', failed' : event.debit_status === 'REVERSED' ? ', returned' : ''
    words = `${when} · ${event.card ?? 'card'}${result}`
  } else if (event.kind === 'RECORDED') {
    const channel = event.channel ? PAID_BY[event.channel] : 'payment'
    words = sameDay ? `Recorded the same day · ${channel}` : `Recorded ${formatDate(event.at)} · ${channel}`
  } else {
    words = `${event.charge_name ?? 'Charge'}${sameDay ? '' : ` · ${formatDate(event.at)}`}`
  }
  const failed = event.kind === 'TAKEN' && event.debit_status === 'FAILED'
  return (
    <li className={`flex items-baseline gap-2 ${event.wrong ? 'text-wrong font-semibold' : ''}`}>
      <Mark kind={failed ? 'cross' : EVENT_MARK[event.kind]} className="translate-y-px" />
      <span className="flex-1">{words}</span>
      {event.amount !== null && event.kind !== 'RECORDED' && (
        <span className={`tabular-nums ${failed ? 'line-through' : ''}`}>{formatSom(event.amount)}</span>
      )}
    </li>
  )
}

/** The sentence under a row. It starts with the plain name of what was found. */
function Sentence({ treatment, name, sentence }: { treatment: RowTreatment; name: string; sentence: string | null }) {
  if (treatment === 'CORRECT' || !sentence) return null
  return (
    <p className="mt-2">
      <strong>{treatment === 'CHECKED_CORRECT' ? 'Checked, correct:' : `${name}.`}</strong> {sentence}
    </p>
  )
}

function NotOwed({ row }: { row: TimelineRow }) {
  if (row.treatment === 'TAKEN_EARLY') {
    return (
      <span className="text-wrong font-semibold">
        <Mark kind="exclamation" /> Taken early {formatSom(row.taken_early)}
        {row.days_early !== null && `, ${count(row.days_early, 'day')}`}
      </span>
    )
  }
  if (row.not_owed > 0) {
    return (
      <span className="text-wrong font-semibold">
        <Mark kind="exclamation" /> Not owed {formatSom(row.not_owed)}
      </span>
    )
  }
  return null
}

function InstallmentRow({ row, striped }: { row: TimelineRow; striped: boolean }) {
  const plain = row.treatment === 'CORRECT' || row.treatment === 'CHECKED_CORRECT'
  return (
    <li className={`border-line border-t border-l-4 px-3 py-3 ${BAR[row.treatment]} ${plain && striped ? 'bg-stripe' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          <span className="text-ink-soft text-small">No. {row.n} · due</span>{' '}
          <span className="font-semibold">{formatDate(row.due_date)}</span>
        </span>
        <span className="tabular-nums">
          <span className="text-ink-soft text-small">Owed</span> {formatSom(row.owed)}
        </span>
        <NotOwed row={row} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {row.events.length ? (
          <ul className="text-table min-w-[15rem] flex-1 space-y-1">
            {row.events.map((event) => (
              <EventLine key={event.source_id + event.kind} event={event} dueDate={row.due_date} />
            ))}
          </ul>
        ) : (
          <p className="text-table text-ink-soft min-w-[15rem] flex-1">Nothing was taken or paid.</p>
        )}
        <DayRail events={row.events} />
      </div>
      <Sentence
        treatment={row.treatment}
        name={row.finding_type ? MISTAKE[row.finding_type] : 'Mistake found'}
        sentence={row.sentence}
      />
    </li>
  )
}

/** A charge that belongs to no installment, such as a fee at the start. It has no rail. */
function ChargeRow({ charge }: { charge: OtherCharge }) {
  return (
    <li className={`border-line border-t border-l-4 px-3 py-3 ${BAR[charge.treatment]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2">
          <Mark kind="charged" className="translate-y-px" />
          <span>
            {charge.name} · {formatDate(charge.charged_at)}
          </span>
        </span>
        <span className="tabular-nums">{formatSom(charge.amount)}</span>
        {charge.not_owed > 0 && (
          <span className="text-wrong font-semibold">
            <Mark kind="exclamation" /> Not owed {formatSom(charge.not_owed)}
          </span>
        )}
      </div>
      <Sentence treatment={charge.treatment} name="Fee not allowed" sentence={charge.sentence} />
    </li>
  )
}

export function Ledger({ timeline }: { timeline: ContractTimeline }) {
  const { totals } = timeline
  return (
    <section className="border-line bg-sheet rounded-sheet border">
      <header className="px-3 py-3">
        <h3 className="font-semibold">
          Loan <span className="font-normal">{timeline.contract_id}</span> · {formatSom(timeline.monthly_payment)}, due
          on day {timeline.due_day} of each month
        </h3>
        <p className="text-ink-soft text-small">
          {timeline.product_name} · {formatSom(timeline.principal)} for {timeline.term_months} months, from{' '}
          {formatDate(timeline.start_date)}
          {timeline.schedule_changed_on && ` · schedule changed on ${formatDate(timeline.schedule_changed_on)}`}
          {timeline.early_repayment_requested_on &&
            ` · early repayment asked on ${formatDate(timeline.early_repayment_requested_on)}`}
        </p>
        <p className="text-small mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span><Mark kind="taken" /> Taken from card</span>
          <span><Mark kind="recorded" /> Recorded on the loan</span>
          <span><Mark kind="charged" /> Charged</span>
          <span className="text-ink-soft">The tall tick on the line is the due date. Each small tick is one day.</span>
        </p>
      </header>
      <ol>
        {timeline.rows.map((row, index) => (
          <InstallmentRow key={row.n} row={row} striped={index % 2 === 1} />
        ))}
        {timeline.other_charges.map((charge) => (
          <ChargeRow key={charge.charge_id} charge={charge} />
        ))}
      </ol>
      <footer className="border-ink flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 px-3 py-3">
        <Label>In these {count(timeline.rows.length, 'month')}</Label>
        <span className="tabular-nums">Owed {formatSom(totals.owed)}</span>
        <span className="tabular-nums">Taken {formatSom(totals.taken)}</span>
        {totals.taken_early > 0 && (
          <span className="text-wrong font-semibold tabular-nums">Taken early {formatSom(totals.taken_early)}</span>
        )}
        <span className={`tabular-nums ${totals.not_owed > 0 ? 'text-wrong font-semibold' : ''}`}>
          Not owed {formatSom(totals.not_owed)}
        </span>
      </footer>
    </section>
  )
}
