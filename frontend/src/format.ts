// Money, dates and counts, formatted in one place (DESIGN sections 8.2 and 14), in the
// language of the screens (DECISIONS D-041). `LangProvider` sets the language.
//
// A date or time is read from the text the server sent and is never passed
// through `Date` parsing, so it cannot be shifted to the viewer's time zone.

import type { UiLang } from './i18n'

const NBSP = ' '
const MONTHS: Record<UiLang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'],
}
const MONTHS_LONG: Record<UiLang, string[]> = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  uz: MONTHS.uz,
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
}

let lang: UiLang = 'en'

/** Called by LangProvider before the screens draw. */
export function setFormatLang(next: UiLang): void {
  lang = next
}

/** 1500000 -> "1 500 000". For a table column whose head names the unit. */
export function formatNumber(amount: number): string {
  return String(Math.trunc(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
}

/** The name of the currency: "soʻm", or "сум" in Russian. */
export function somWord(): string {
  return lang === 'ru' ? 'сум' : 'soʻm'
}

/** 1500000 -> "1 500 000 soʻm", with spaces that never break a line. */
export function formatSom(amount: number): string {
  return `${formatNumber(amount)}${NBSP}${somWord()}`
}

/** "2026-08-25" -> "25 Aug 2026" · "25-avgust 2026" · "25 авг. 2026". */
export function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  const name = MONTHS[lang][Number(month) - 1]
  return lang === 'uz' ? `${Number(day)}-${name} ${year}` : `${Number(day)} ${name} ${year}`
}

/** "2026-08-25T02:14:00" -> "02:14". Tashkent time, as sent. */
export function formatTime(moment: string): string {
  return moment.slice(11, 16)
}

export function formatDateTime(moment: string): string {
  return `${formatDate(moment)}, ${formatTime(moment)}`
}

/** "2026-08" -> "August 2026" · "2026-yil avgust" · "август 2026". */
export function formatMonth(month: string): string {
  const [year, number] = month.split('-')
  const name = MONTHS_LONG[lang][Number(number) - 1]
  return lang === 'uz' ? `${year}-yil ${name}` : `${name} ${year}`
}

/** Whole calendar days from one date to another. */
export function daysBetween(from: string, to: string): number {
  const utc = (value: string) => {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** The forms of a counted word: English one and many; Uzbek one form; Russian one, few, many. */
export interface Forms {
  en: [string, string]
  uz: string
  ru: [string, string, string]
}

function russian(n: number, [one, few, many]: [string, string, string]): string {
  const tail = n % 10
  const tens = n % 100
  if (tail === 1 && tens !== 11) return one
  if (tail >= 2 && tail <= 4 && (tens < 12 || tens > 14)) return few
  return many
}

/** 3, day -> "3 days" · "3 kun" · "3 дня". */
export function countOf(n: number, forms: Forms): string {
  if (lang === 'uz') return `${formatNumber(n)} ${forms.uz}`
  if (lang === 'ru') return `${formatNumber(n)} ${russian(n, forms.ru)}`
  return `${formatNumber(n)} ${n === 1 ? forms.en[0] : forms.en[1]}`
}

export const DAY: Forms = { en: ['day', 'days'], uz: 'kun', ru: ['день', 'дня', 'дней'] }
export const LOAN: Forms = { en: ['loan', 'loans'], uz: 'kredit', ru: ['кредит', 'кредита', 'кредитов'] }
export const MONTH: Forms = { en: ['month', 'months'], uz: 'oy', ru: ['месяц', 'месяца', 'месяцев'] }
export const CUSTOMER: Forms = { en: ['customer', 'customers'], uz: 'mijoz', ru: ['клиент', 'клиента', 'клиентов'] }
export const COMPLAINT: Forms = { en: ['complaint', 'complaints'], uz: 'shikoyat', ru: ['жалоба', 'жалобы', 'жалоб'] }
export const ENTRY: Forms = { en: ['entry', 'entries'], uz: 'yozuv', ru: ['запись', 'записи', 'записей'] }

/** 0.93 -> "93%". */
export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`
}

/** 46.97 -> "47 times" · "47 baravar" · "в 47 раз". */
export function formatTimes(lift: number): string {
  const shown = lift >= 10 ? Math.round(lift) : Number(lift.toFixed(1))
  if (lang === 'uz') return `${shown} baravar`
  if (lang === 'ru') {
    const word = Number.isInteger(shown) ? russian(shown, ['раз', 'раза', 'раз']) : 'раза'
    return `в ${String(shown).replace('.', ',')} ${word}`
  }
  return `${shown} times`
}

/** "1.4 s" · "1,4 с" in Russian. Under a second it keeps two digits, so a fast answer is not "0.0 s". */
export function formatSeconds(ms: number, digits = 1): string {
  const value = (ms / 1000).toFixed(ms < 950 ? Math.max(digits, 2) : digits)
  return lang === 'ru' ? `${value.replace('.', ',')} с` : `${value} s`
}

/** Kept for the few English-only places, such as aria text built before the language is known. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
