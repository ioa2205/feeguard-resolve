// The day rail of DESIGN section 6.2: one small SVG. It gets the events of one
// installment and draws nothing else.
//
// The tick in the middle is the due date and each small tick is one day. Money
// that left the card sits above the line; recording and charges sit below it.
// An event more than 6 days away sits at the end with its day count beside it.
// The rail never carries the message alone: the row always has a sentence too.

import { DAY, countOf } from '../format'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import type { TimelineEvent } from '../types'

const SPAN = 6 // days shown on each side of the due date
const STEP = 11 // pixels for one day
const SIDE = 58 // room at each end for a day count
const WIDTH = SIDE * 2 + STEP * SPAN * 2
const LINE_Y = 24
const ABOVE_Y = 12
const BELOW_Y = 36

function where(offset: number, t: (words: Words) => string): string {
  if (offset === 0) return t({ en: 'on the due date', uz: 'toʻlov kuni', ru: 'в день платежа' })
  const days = countOf(Math.abs(offset), DAY)
  return offset < 0
    ? t({ en: `${days} before the due date`, uz: `toʻlov kunidan ${days} oldin`, ru: `за ${days} до срока` })
    : t({ en: `${days} after the due date`, uz: `toʻlov kunidan ${days} keyin`, ru: `через ${days} после срока` })
}

function spoken(event: TimelineEvent, t: (words: Words) => string): string {
  const what =
    event.kind === 'TAKEN'
      ? event.debit_status === 'FAILED'
        ? t({ en: 'A debit failed', uz: 'Yechim amalga oshmadi', ru: 'Списание не прошло' })
        : event.debit_status === 'REVERSED'
          ? t({ en: 'A debit that was returned', uz: 'Qaytarilgan yechim', ru: 'Возвращённое списание' })
          : t({ en: 'Taken from card', uz: 'Kartadan yechildi', ru: 'Списано с карты' })
      : event.kind === 'RECORDED'
        ? t({ en: 'Recorded on the loan', uz: 'Kreditga qayd etildi', ru: 'Зачислено по кредиту' })
        : t({ en: 'Charged', uz: 'Undirildi', ru: 'Начислено' })
  return `${what} ${where(event.day_offset, t)}${event.wrong ? t({ en: ', the mistake', uz: ', xato', ru: ', ошибка' }) : ''}`
}

function shape(event: TimelineEvent, x: number) {
  const colour = event.wrong ? 'var(--wrong)' : 'var(--ink)'
  if (event.kind === 'TAKEN') {
    if (event.debit_status === 'SUCCESS' || event.debit_status === null) {
      return <circle cx={x} cy={ABOVE_Y} r="4.5" fill={colour} />
    }
    // A debit that failed or was returned took nothing: a cross, not a filled mark.
    const d = `M${x - 4} ${ABOVE_Y - 4} ${x + 4} ${ABOVE_Y + 4}M${x + 4} ${ABOVE_Y - 4} ${x - 4} ${ABOVE_Y + 4}`
    return <path d={d} fill="none" stroke={colour} strokeWidth="1.75" />
  }
  if (event.kind === 'RECORDED') {
    return <circle cx={x} cy={BELOW_Y} r="3.75" fill="none" stroke={colour} strokeWidth="1.5" />
  }
  return <path d={`M${x} ${BELOW_Y - 5} ${x + 5} ${BELOW_Y + 4}H${x - 5}Z`} fill={colour} />
}

export function DayRail({ events }: { events: TimelineEvent[] }) {
  const { t } = useLang()
  // Marks on the same day and the same side stand next to each other.
  const used = new Map<string, number>()
  const far = new Map<string, number>() // "above:1" -> the largest day count out there

  const marks = events.map((event, index) => {
    const clamped = Math.max(-SPAN, Math.min(SPAN, event.day_offset))
    const side = event.kind === 'TAKEN' ? 'above' : 'below'
    const slot = `${side}:${clamped}`
    const position = used.get(slot) ?? 0
    used.set(slot, position + 1)
    if (Math.abs(event.day_offset) > SPAN) {
      const end = `${side}:${Math.sign(event.day_offset)}`
      far.set(end, Math.max(far.get(end) ?? 0, Math.abs(event.day_offset)))
    }
    const direction = clamped < 0 ? -1 : 1
    const x = SIDE + (clamped + SPAN) * STEP + position * 10 * (Math.abs(clamped) === SPAN ? -direction : 1)
    return <g key={index}>{shape(event, x)}</g>
  })

  return (
    <svg
      viewBox={`0 0 ${WIDTH} 48`}
      width={WIDTH}
      height="48"
      role="img"
      aria-label={events.length ? `${events.map((event) => spoken(event, t)).join('. ')}.` : t({ en: 'Nothing happened.', uz: 'Hech narsa boʻlmadi.', ru: 'Ничего не произошло.' })}
      className="max-w-full shrink-0"
    >
      <line x1={SIDE} x2={WIDTH - SIDE} y1={LINE_Y} y2={LINE_Y} stroke="var(--ink-soft)" strokeWidth="1" />
      {Array.from({ length: SPAN * 2 + 1 }, (_, index) => {
        const due = index === SPAN
        const x = SIDE + index * STEP
        return (
          <line
            key={index}
            x1={x}
            x2={x}
            y1={LINE_Y - (due ? 7 : 3)}
            y2={LINE_Y + (due ? 7 : 3)}
            stroke={due ? 'var(--ink)' : 'var(--ink-soft)'}
            strokeWidth={due ? 2 : 1}
          />
        )
      })}
      {marks}
      {[...far].map(([end, days]) => {
        const [side, sign] = end.split(':')
        const after = sign === '1'
        return (
          <text
            key={end}
            x={after ? WIDTH - SIDE + 8 : SIDE - 8}
            y={(side === 'above' ? ABOVE_Y : BELOW_Y) + 4}
            textAnchor={after ? 'start' : 'end'}
            fontSize="13"
            fill="var(--ink)"
          >
            {countOf(days, DAY)}
          </text>
        )
      })}
    </svg>
  )
}
