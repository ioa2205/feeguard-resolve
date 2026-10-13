// The money timeline of the landing page, on one canvas (V2_PLAN W1.1, W2).
//
// One loan's payment (the case) and every affected loan (the strip) share one time axis, so
// "zoom out" is a real change of scale: the customer's row becomes one row among the 400.
// Its state, each from 0 to 1: draw (the case drawing itself), zoom (case to strip),
// reveal (the other loans arriving), cause (the billing runs named).

export interface ChartRow {
  date: string
  run: string | null
  /** Minutes after midnight of each kept debit, oldest first. */
  m: number[]
  contract: string
  name: string
  you: boolean
}

export interface ChartEvent {
  kind: 'TAKEN' | 'RECORDED' | string
  at: string
  amount: number | null
  card: string | null
}

export interface ChartData {
  rows: ChartRow[]
  dueDate: string
  owed: number
  events: ChartEvent[]
  /** How many times more often than normal the first billing run shows up. */
  lift: number
}

export interface ChartTheme {
  bg: string
  ink: string
  ink2: string
  ink3: string
  rule: string
  band: string
  wrong: string
}

export interface ChartWords {
  due: (owed: number) => string
  taken: string
  recorded: string
  notRecorded: string
  minutes: (n: number) => string
  night: (date: string, count: number) => string
  share: (pct: number, lift: number, total: number) => string
}

export interface ChartLayout {
  L: number
  R: number
  caseTop: number
  caseBottom: number
  stripTop: number
  stripBottom: number
  gap?: number
  caseR?: number
  textScale?: number
  /** false: the case shows no time or amount labels (the ledger beside it does). */
  labels?: boolean
  /** With labels off, still name the two lanes. */
  lanes?: boolean
  /** A line with the billing run's clock moves down with the rows as they arrive. */
  sweep?: boolean
}

export interface ChartState {
  draw: number
  zoom: number
  reveal: number
  cause: number
  hover: number
}

type Ease = (t: number) => number

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** The progress of t within [a, b]. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
export const EASE: Record<'linear' | 'inOut' | 'out' | 'back', Ease> = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  back: (t) => {
    const c = 1.9
    return t <= 0 ? 0 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2)
  },
}

/** A thin gap between digit groups: the font's own thin space is too narrow to see. */
const GROUP = ' '
export const grouped = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, GROUP)
export const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
export const minuteOf = (at: string) => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16))
export const lessMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Tween {
  from: number
  to: number
  start: number
  ms: number
  ease: Ease
}

export interface Chart {
  rows: ChartRow[]
  state: ChartState
  set: (values: Partial<ChartState>) => void
  to: (key: keyof ChartState, value: number, ms?: number, delay?: number, ease?: keyof typeof EASE) => void
  rowAt: (clientX: number, clientY: number) => number
  hover: (i: number) => void
  resize: () => void
  destroy: () => void
}

interface Geometry extends ChartLayout {
  k: number
  caseR: number
  c: { due: number; takenLabel: number; taken: number; recLabel: number; rec: number; axis: number }
  rowH: number
  rowY: (i: number) => number
  dotR: number
}

export function createChart(canvas: HTMLCanvasElement, data: ChartData, opts: {
  theme: ChartTheme
  words: ChartWords
  layout: (W: number, H: number) => ChartLayout
  font?: string
}): Chart {
  const ctx = canvas.getContext('2d')!
  const { theme, words } = opts
  const font = opts.font ?? 'Onest'
  const state: ChartState = { draw: 0, zoom: 0, reveal: 0, cause: 0, hover: -1 }
  const tweens: Partial<Record<keyof ChartState, Tween>> = {}
  let W = 0
  let H = 0
  let frame = 0
  let last: Geometry | null = null

  // The loans in the order the billing runs reached them, the biggest night first.
  const byNight = new Map<string, ChartRow[]>()
  for (const row of data.rows) byNight.set(row.date, [...(byNight.get(row.date) ?? []), row])
  const nights = [...byNight.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  for (const [, list] of nights) list.sort((a, b) => a.m[0] - b.m[0] || a.contract.localeCompare(b.contract))
  const rows = nights.flatMap(([, list]) => list)
  const firstNight = nights[0]?.[1].length ?? 0
  const youAt = Math.max(0, rows.findIndex((row) => row.you))
  const you = rows[youAt]
  const taken = data.events.filter((e) => e.kind === 'TAKEN')
  const recorded = data.events.filter((e) => e.kind === 'RECORDED')
  const caseDomain = [you.m[0] - 3, you.m[you.m.length - 1] + 3]
  const lo = Math.min(...rows.map((r) => r.m[0]))
  const hi = Math.max(...rows.map((r) => r.m[r.m.length - 1]))
  const stripDomain = [Math.floor((lo - 4) / 5) * 5, Math.ceil((hi + 2) / 5) * 5]

  const setFont = (weight: number, size: number) => {
    ctx.font = `${weight} ${size}px ${font}`
  }
  function text(str: string, x: number, y: number, o: { weight?: number; size?: number; color?: string; align?: 'left' | 'right' | 'center'; alpha?: number; halo?: boolean } = {}) {
    const { weight = 500, size = 12, color = theme.ink, align = 'left', alpha = 1, halo = false } = o
    if (alpha <= 0.001) return
    setFont(weight, size)
    ctx.globalAlpha = alpha
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = theme.bg
    ctx.fillStyle = color
    const parts = str.split(GROUP)
    const gap = size * 0.2
    const widths = parts.map((part) => ctx.measureText(part).width)
    const total = widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)
    let at = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x
    ctx.textAlign = 'left'
    parts.forEach((part, i) => {
      if (halo) ctx.strokeText(part, at, y)
      ctx.fillText(part, at, y)
      at += widths[i] + gap
    })
    ctx.globalAlpha = 1
  }
  function dot(x: number, y: number, r: number, color: string, alpha = 1) {
    if (r <= 0 || alpha <= 0.001) return
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }
  function ring(x: number, y: number, r: number, color: string, alpha = 1, dash: number[] | null = null, width = 1.5) {
    if (r <= 0 || alpha <= 0.001) return
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }
  function line(x1: number, y1: number, x2: number, y2: number, color: string, alpha = 1, width = 1, dash: number[] | null = null) {
    if (alpha <= 0.001) return
    ctx.globalAlpha = alpha
    ctx.strokeStyle = color
    ctx.lineWidth = width
    if (dash) ctx.setLineDash(dash)
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.globalAlpha = 1
  }

  function geometry(): Geometry {
    const layout = opts.layout(W, H)
    const ch = layout.caseBottom - layout.caseTop
    const gap = nights.length > 1 ? layout.gap ?? 42 : 0
    const rowH = (layout.stripBottom - layout.stripTop - gap) / rows.length
    return {
      ...layout,
      k: layout.textScale ?? 1,
      caseR: layout.caseR ?? 7,
      c: {
        due: layout.caseTop + 6,
        takenLabel: layout.caseTop + ch * 0.17,
        taken: layout.caseTop + ch * 0.34,
        recLabel: layout.caseTop + ch * 0.62,
        rec: layout.caseTop + ch * 0.74,
        axis: layout.caseTop + ch * 0.95,
      },
      rowH,
      rowY: (i) => layout.stripTop + (i + 0.5) * rowH + (i >= firstNight ? gap : 0),
      dotR: clamp(rowH * 0.95, 1.35, 2.6),
    }
  }

  function render() {
    if (!W || !H) return
    const g = geometry()
    last = g
    ctx.clearRect(0, 0, W, H)
    const d = state.draw
    const z = EASE.inOut(state.zoom)
    const caseA = 1 - seg(state.zoom, 0, 0.3)
    const stripA = seg(state.zoom, 0.65, 1)
    const d0 = lerp(caseDomain[0], stripDomain[0], z)
    const d1 = lerp(caseDomain[1], stripDomain[1], z)
    const x = (m: number) => g.L + ((m - d0) / (d1 - d0)) * (g.R - g.L)
    const xs = (m: number) => g.L + ((m - stripDomain[0]) / (stripDomain[1] - stripDomain[0])) * (g.R - g.L)
    const labels = g.labels !== false

    // The time axis.
    const axisY = lerp(g.c.axis, g.stripBottom + 16, z)
    const grow = Math.max(EASE.out(seg(d, 0, 0.22)), state.zoom > 0 ? 1 : 0)
    if (grow > 0) {
      line(g.L, axisY, lerp(g.L, g.R, grow), axisY, theme.rule, 1, 1)
      for (let m = Math.ceil(d0); m <= Math.floor(d1); m++) {
        const tx = x(m)
        if (tx > lerp(g.L, g.R, grow) + 0.5) continue
        const major = lerp(m % 2 === 0 ? 1 : 0.55, m % 5 === 0 ? 1 : 0, z)
        line(tx, axisY, tx, axisY + 5, theme.ink3, major * grow, 1)
        const labelA = Math.max((m % 2 === 0 ? 1 : 0) * (1 - seg(state.zoom, 0, 0.4)), (m % 5 === 0 ? 1 : 0) * seg(state.zoom, 0.55, 1))
        const edge = tx < g.L + 18 ? 'left' : tx > g.R - 18 ? 'right' : 'center'
        const ex = edge === 'left' ? Math.max(tx, g.L) - 1 : edge === 'right' ? Math.min(tx, g.R) + 1 : tx
        text(clock(m), ex, axisY + 19, { size: 12, weight: 500, color: theme.ink2, align: edge, alpha: labelA * grow })
      }
    }

    // The case: the due date, both debits, what reached the loan.
    if (caseA > 0 && (labels || g.lanes)) {
      if (labels) text(words.due(data.owed), g.L, g.c.due, { size: 13 * g.k, weight: 500, color: theme.ink, alpha: caseA * seg(d, 0.1, 0.24) })
      text(words.taken, g.L, g.c.takenLabel, { size: 12 * g.k, weight: 500, color: theme.ink2, alpha: caseA * seg(d, 0.14, 0.28) })
      text(words.recorded, g.L, g.c.recLabel, { size: 12 * g.k, weight: 500, color: theme.ink2, alpha: caseA * seg(d, 0.36, 0.48) })
    }

    // The other loans of the bank, arriving row by row in the order the billing run took them.
    const span = 0.32
    if (state.reveal > 0) {
      for (let i = 0; i < rows.length; i++) {
        if (i === youAt) continue
        const start = (i / rows.length) * (1 - span)
        const p = EASE.out(seg(state.reveal, start, start + span))
        if (p <= 0) continue
        const row = rows[i]
        const y = g.rowY(i)
        const xa = xs(row.m[0])
        const xb = xs(row.m[row.m.length - 1])
        const hovered = state.hover === i
        if (hovered) {
          ctx.fillStyle = theme.band
          ctx.fillRect(g.L - 8, y - Math.max(g.rowH, 6) / 2, g.R - g.L + 16, Math.max(g.rowH, 6))
        }
        line(xa, y, lerp(xa, xb, p), y, theme.wrong, (hovered ? 0.5 : 0.13) * p, hovered ? 1.5 : 0.8)
        dot(xa, y, (hovered ? 3.4 : g.dotR) * p, theme.ink, p)
        const pb = EASE.out(seg(state.reveal, start + 0.04, start + span + 0.04))
        dot(xb, y, (hovered ? 3.4 : g.dotR) * pb, theme.wrong, pb)
      }
    }

    // The billing run at work: a line with its clock moves down with the rows as they arrive.
    if (g.sweep && state.reveal > 0 && state.reveal < 1) {
      const front = clamp(Math.floor((state.reveal / (1 - span)) * rows.length), 0, rows.length - 1)
      const fy = g.rowY(front)
      const fade = Math.min(1, state.reveal * 12, (1 - state.reveal) * 10)
      line(g.L - 8, fy, g.R + 8, fy, theme.ink, 0.35 * fade, 1)
      text(clock(rows[front].m[0]), g.R + 8, fy - 11, { size: 13, weight: 600, color: theme.ink, align: 'right', alpha: fade, halo: true })
    }

    // The customer's own row: big in the case, one thin row in the strip.
    const y = lerp(g.c.taken, g.rowY(youAt), z)
    const x1 = x(you.m[0])
    const x2 = x(you.m[you.m.length - 1])
    const big = lerp(g.caseR, 3.4, z)
    const p1 = EASE.back(seg(d, 0.28, 0.4))
    const pc = EASE.inOut(seg(d, 0.44, 0.58))
    const p2 = EASE.back(seg(d, 0.56, 0.68))
    if (state.hover === youAt && z > 0.99) {
      ctx.fillStyle = theme.band
      ctx.fillRect(g.L - 8, y - Math.max(g.rowH, 6) / 2, g.R - g.L + 16, Math.max(g.rowH, 6))
    }
    if (pc > 0) line(x1 + big, y, lerp(x1 + big, x2 - big, pc), y, z > 0.5 ? theme.wrong : theme.ink3, lerp(0.7, 0.35, z), lerp(1.5, 1, z))
    dot(x1, y, big * p1, theme.ink)
    dot(x2, y, big * p2, theme.wrong)
    const pulse = seg(d, 0.6, 0.95)
    if (pulse > 0 && pulse < 1) ring(x2, y, big + 18 * EASE.out(pulse), theme.wrong, (1 - pulse) * 0.55 * caseA, null, 1.5)

    if (caseA > 0 && taken.length >= 2) {
      const [first, second] = taken
      const k = g.k
      const la = labels ? caseA * seg(d, 0.32, 0.44) : 0
      text(clock(minuteOf(first.at)), x1 + 9, y + 28 * k, { weight: 600, size: 13 * k, align: 'right', alpha: la })
      text(first.card ?? '', x1 + 9, y + 46 * k, { weight: 400, size: 12 * k, color: theme.ink2, align: 'right', alpha: la })
      text('−' + grouped(first.amount ?? 0), x1 + 9, y + 64 * k, { weight: 500, size: 13 * k, align: 'right', alpha: la })
      const lb = labels ? caseA * seg(d, 0.6, 0.72) : 0
      text(clock(minuteOf(second.at)), x2 - 9, y + 28 * k, { weight: 600, size: 13 * k, color: theme.wrong, alpha: lb })
      text(second.card ?? '', x2 - 9, y + 46 * k, { weight: 400, size: 12 * k, color: theme.ink2, alpha: lb })
      text('−' + grouped(second.amount ?? 0), x2 - 9, y + 64 * k, { weight: 500, size: 13 * k, color: theme.wrong, alpha: lb })

      // "2 minutes", drawn from the middle outwards.
      const pb = EASE.out(seg(d, 0.72, 0.86))
      if (pb > 0) {
        const by = y - 26 * k
        const mid = (x1 + x2) / 2
        const half = ((x2 - x1) / 2) * pb
        line(mid - half, by, mid + half, by, theme.ink2, caseA, 1)
        line(mid - half, by, mid - half, by + 5, theme.ink2, caseA * pb, 1)
        line(mid + half, by, mid + half, by + 5, theme.ink2, caseA * pb, 1)
        text(words.minutes(minuteOf(second.at) - minuteOf(first.at)), mid, by - 11 * k, { size: 12 * k, weight: 500, color: theme.ink2, align: 'center', alpha: caseA * pb })
      }

      // What reached the loan: one payment, at the first debit; nothing for the second.
      const rec = recorded[0]
      if (rec) {
        const rx = x(minuteOf(rec.at))
        const pr = EASE.back(seg(d, 0.4, 0.5))
        const drop = labels ? 74 * k : 12
        line(x1, y + drop, x1, g.c.rec - 10, theme.ink3, caseA * seg(d, 0.4, 0.5) * 0.7, 1, [2, 3])
        ring(rx, g.c.rec, 6 * pr, theme.ink, caseA, null, 1.6)
        const lr = labels ? caseA * seg(d, 0.44, 0.56) : 0
        text(clock(minuteOf(rec.at)), rx + 9, g.c.rec + 26 * k, { weight: 600, size: 13 * k, align: 'right', alpha: lr })
        text('+' + grouped(rec.amount ?? 0), rx + 9, g.c.rec + 44 * k, { weight: 500, size: 13 * k, align: 'right', alpha: lr })
        const pn = seg(d, 0.78, 0.9)
        line(x2, y + drop, x2, g.c.rec - 10, theme.wrong, caseA * pn * 0.6, 1, [2, 3])
        ring(x2, g.c.rec, 6 * EASE.back(pn), theme.wrong, caseA * 0.9, [2.2, 2.2], 1.4)
        text(words.notRecorded, x2 - 9, g.c.rec + 26 * k, { weight: 600, size: 13 * k, color: theme.wrong, alpha: labels ? caseA * pn : 0 })
      }
    }

    // Strip labels: the nights, the customer, the billing runs.
    if (stripA > 0) {
      text(words.night(nights[0][0], nights[0][1].length), g.L, g.stripTop - 14, { size: 13, weight: 600, color: theme.ink, alpha: stripA * seg(state.reveal, 0, 0.2) })
      if (nights[1]) {
        text(words.night(nights[1][0], nights[1][1].length), g.L, g.rowY(firstNight) - g.rowH / 2 - 15, { size: 13, weight: 600, color: theme.ink, alpha: stripA * seg(state.reveal, 0.75, 0.95) })
      }
      const ya = stripA * seg(state.zoom, 0.85, 1)
      const yy = g.rowY(youAt)
      setFont(600, 12)
      const nameEnd = g.L + ctx.measureText(you.name).width + 8
      if (nameEnd < xs(you.m[0]) - 12) line(nameEnd, yy, xs(you.m[0]) - 6, yy, theme.ink, ya * 0.45, 1)
      text(you.name, g.L, yy, { size: 12, weight: 600, color: theme.ink, alpha: ya, halo: true })
    }
    if (state.cause > 0) {
      const c = EASE.out(state.cause)
      const share = (n: number) => Math.round((n / rows.length) * 100)
      const top = g.stripTop + 10
      text(nights[0][1][0].run ?? '', g.R + (1 - c) * 12, top, { size: 14, weight: 600, align: 'right', alpha: c, halo: true })
      text(words.share(share(firstNight), data.lift, rows.length), g.R + (1 - c) * 12, top + 19, { size: 12, weight: 500, color: theme.ink2, align: 'right', alpha: c, halo: true })
      if (nights[1]) {
        const c2 = EASE.out(seg(state.cause, 0.3, 1))
        text(`${nights[1][1][0].run ?? ''} · ${share(rows.length - firstNight)}%`, g.R + (1 - c2) * 12, g.rowY(firstNight) - g.rowH / 2 - 15, { size: 12, weight: 600, color: theme.ink2, align: 'right', alpha: c2, halo: true })
      }
    }
  }

  function loop(now: number) {
    frame = 0
    let running = false
    for (const key of Object.keys(tweens) as (keyof ChartState)[]) {
      const t = tweens[key]!
      const p = clamp((now - t.start) / t.ms)
      state[key] = lerp(t.from, t.to, t.ease(p))
      if (p < 1) running = true
      else delete tweens[key]
    }
    render()
    if (running) frame = requestAnimationFrame(loop)
  }
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(loop)
  }

  function resize() {
    const box = canvas.getBoundingClientRect()
    W = Math.round(box.width)
    H = Math.round(box.height)
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(W * ratio)
    canvas.height = Math.round(H * ratio)
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    render()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  return {
    rows,
    state,
    set(values) {
      for (const key of Object.keys(values) as (keyof ChartState)[]) delete tweens[key]
      Object.assign(state, values)
      render()
    },
    to(key, value, ms = 800, delay = 0, ease = 'inOut') {
      const instant = lessMotion() || (ms <= 0 && delay <= 0)
      if (instant) {
        delete tweens[key]
        state[key] = value
        render()
        return
      }
      tweens[key] = { from: state[key], to: value, start: performance.now() + delay, ms: Math.max(ms, 1), ease: EASE[ease] }
      kick()
    },
    rowAt(clientX, clientY) {
      if (!last || state.zoom < 0.99) return -1
      const box = canvas.getBoundingClientRect()
      const px = clientX - box.left
      const py = clientY - box.top
      if (px < last.L - 8 || px > last.R + 8) return -1
      let best = -1
      let nearest = 5
      for (let i = 0; i < rows.length; i++) {
        const dy = Math.abs(last.rowY(i) - py)
        if (dy < nearest) {
          nearest = dy
          best = i
        }
      }
      return best
    },
    hover(i) {
      if (state.hover === i) return
      state.hover = i
      render()
    },
    resize,
    destroy() {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    },
  }
}
