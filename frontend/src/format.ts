// Money, dates and counts, formatted in one place (DESIGN sections 8.2 and 14).
//
// A date or time is read from the text the server sent and is never passed
// through `Date` parsing, so it cannot be shifted to the viewer's time zone.

const NBSP = ' '
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** 1500000 -> "1 500 000". For a table column whose head names the unit. */
export function formatNumber(amount: number): string {
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

/** 1500000 -> "1 500 000 soʻm", with spaces that never break a line. */
export function formatSom(amount: number): string {
  return `${formatNumber(amount)}${NBSP}soʻm`
}

/** "2026-08-25" or "2026-08-25T02:14:00" -> "25 Aug 2026". */
export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`
}

/** "2026-08-25T02:14:00" -> "02:14". Tashkent time, as sent. */
export function formatTime(moment: string): string {
  return moment.slice(11, 16)
}

export function formatDateTime(moment: string): string {
  return `${formatDate(moment)}, ${formatTime(moment)}`
}

/** "2026-08" -> "August 2026". */
export function formatMonth(month: string): string {
  const [year, number] = month.split('-')
  return `${MONTHS_LONG[Number(number) - 1]} ${year}`
}

/** Whole calendar days from one date to another. */
export function daysBetween(from: string, to: string): number {
  const utc = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** 1 -> "1 day", 3 -> "3 days". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** 0.93 -> "93%". */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`
}
