// The money timeline in the product (V2_PLAN W1.1): the same canvas chart as the landing page.
// On a complaint it draws one installment, minute by minute. On Find others it draws every
// affected loan on one clock, so the shared night shows before a word is read.

import { useEffect, useRef } from 'react'

import { useLang } from '../i18n'
import { createChart, grouped, minuteOf } from '../landing/chart'
import type { ChartData, ChartTheme, ChartWords } from '../landing/chart'
import { C, dayMonth, fullDate, minutes } from '../landing/copy'
import type { ScanItem, TimelineEvent, TimelineRow } from '../types'

const LIGHT: ChartTheme = { bg: '#ffffff', ink: '#000000', ink2: '#5c5c5c', ink3: '#a3a3a3', rule: '#e6e6e6', band: '#f4f4f4', wrong: '#e71336' }
const DARK: ChartTheme = { bg: '#000000', ink: '#ffffff', ink2: '#a3a3a3', ink3: '#5c5c5c', rule: '#2e2e2e', band: '#141414', wrong: '#e71336' }

const kept = (event: TimelineEvent) => event.kind === 'TAKEN' && event.debit_status === 'SUCCESS'

/** The chart of one installment taken twice on its due night; null when the row is not that. */
export function caseChart(row: TimelineRow, contract: string, name: string): ChartData | null {
  if (row.finding_type !== 'DOUBLE_DEBIT') return null
  const sameDay = (event: TimelineEvent) => event.at.slice(0, 10) === row.due_date.slice(0, 10)
  const taken = row.events.filter((event) => kept(event) && sameDay(event)).sort((a, b) => a.at.localeCompare(b.at))
  if (taken.length < 2) return null
  const recorded = row.events.filter((event) => event.kind === 'RECORDED' && sameDay(event))
  return {
    rows: [{ date: row.due_date, run: null, m: taken.map((event) => minuteOf(event.at)), contract, name, you: true }],
    dueDate: row.due_date,
    owed: row.owed,
    events: [...taken, ...recorded].map((event) => ({ kind: event.kind, at: event.at, amount: event.amount, card: event.card })),
    lift: 0,
  }
}

/** Every loan a search found, as rows of one clock. Only loans debited twice in one night can be drawn. */
export function stripChart(items: ScanItem[], you: { contract: string; row: TimelineRow | null }, lift: number): ChartData | null {
  const rows = items.flatMap((item) => {
    const taken = (item.debits ?? []).filter((debit) => debit.status === 'SUCCESS' && !debit.returned)
    if (taken.length < 2 || !item.due_date) return []
    return [{ date: item.due_date, run: taken[0].batch_run_id ?? null, m: taken.map((debit) => minuteOf(debit.at)), contract: item.contract_id, name: item.customer_name, you: item.contract_id === you.contract }]
  })
  if (rows.length < 2) return null
  const own = you.row ? caseChart(you.row, you.contract, '') : null
  const first = rows.find((row) => row.you) ?? rows[0]
  return {
    rows,
    dueDate: own?.dueDate ?? first.date,
    owed: own?.owed ?? 0,
    events: own?.events ?? [],
    lift,
  }
}

function useWords(data: ChartData, installment: number): ChartWords {
  const { ui } = useLang()
  return {
    due: (owed) => C.chart.due[ui](fullDate(data.dueDate, ui), installment, grouped(owed)),
    taken: C.chart.taken[ui],
    recorded: C.chart.recorded[ui],
    notRecorded: C.chart.notRecorded[ui],
    minutes: (n) => minutes(n, ui),
    night: (date, count) => C.chart.night[ui](dayMonth(date, ui), count),
    share: (pct, lift, total) => C.chart.share[ui](pct, lift, total),
  }
}

/** One installment, minute by minute: due, taken, taken again, recorded once. It draws itself once. */
export function CaseTimeline({ data, installment, label }: { data: ChartData; installment: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const words = useWords(data, installment)
  const { ui } = useLang()
  useEffect(() => {
    if (!canvas.current) return
    let gone = false
    let chart: ReturnType<typeof createChart> | null = null
    document.fonts.load('500 12px Onest').catch(() => undefined).then(() => {
      if (gone || !canvas.current) return
      chart = createChart(canvas.current, data, {
        theme: LIGHT,
        words,
        layout: (W, H) => ({ L: 16, R: W - 16, caseTop: -6, caseBottom: H - 26, stripTop: 30, stripBottom: H - 40, labels: false, lanes: true, caseR: 6.5 }),
      })
      chart.to('draw', 1, 1800, 250, 'linear')
    })
    return () => {
      gone = true
      chart?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ui])
  return <div className="mini"><canvas ref={canvas} role="img" aria-label={label} /></div>
}

/** Every affected loan on one clock. The rows arrive in the order the billing run reached them. */
export function StripTimeline({ data, installment, label }: { data: ChartData; installment: number; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const words = useWords(data, installment)
  const { ui } = useLang()
  useEffect(() => {
    if (!canvas.current) return
    let gone = false
    let chart: ReturnType<typeof createChart> | null = null
    Promise.all(['500 12px Onest', '600 13px Onest'].map((face) => document.fonts.load(face))).catch(() => undefined).then(() => {
      if (gone || !canvas.current) return
      chart = createChart(canvas.current, data, {
        theme: DARK,
        words,
        layout: (W, H) => ({ L: 0, R: W, caseTop: 40, caseBottom: H - 60, stripTop: 22, stripBottom: H - 44, gap: 40, caseR: 7, textScale: W < 600 ? 1 : 1.05, sweep: false }),
      })
      chart.set({ draw: 1, zoom: 1, reveal: 0, cause: 0 })
      chart.to('reveal', 1, 1600, 200, 'out')
      chart.to('cause', 1, 700, 1700, 'out')
    })
    return () => {
      gone = true
      chart?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ui])
  return <div className="stage"><canvas ref={canvas} role="img" aria-label={label} /></div>
}
