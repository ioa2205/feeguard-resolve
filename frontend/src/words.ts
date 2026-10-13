// The word list of DESIGN section 8.1, in English, Uzbek (Latin) and Russian (DECISIONS D-041).
// The screen says these words, always the same ones. Show one with `t(WORD[key])`.

import type { Words } from './i18n'
import type {
  Actor,
  CheckTrigger,
  ClaimType,
  ComplaintChannel,
  DecisionAction,
  DefectType,
  DraftSource,
  IncidentStatus,
  Lang,
  Mode,
  PaymentChannel,
  Verdict,
} from './types'
import { TO_VERIFY } from './types'

export const VERDICT: Record<Verdict, Words> = {
  SUPPORTED: { en: 'Customer is right', uz: 'Mijoz haq', ru: 'Клиент прав' },
  NOT_SUPPORTED: { en: 'Bank was right', uz: 'Bank haq edi', ru: 'Банк был прав' },
  NEEDS_INFO: { en: 'More information needed', uz: 'Qoʻshimcha maʼlumot kerak', ru: 'Нужна дополнительная информация' },
  OUT_OF_SCOPE: { en: 'Not one of the four checks', uz: 'Toʻrt tekshiruvga kirmaydi', ru: 'Не входит в четыре проверки' },
}

export const MISTAKE: Record<DefectType, Words> = {
  DOUBLE_DEBIT: { en: 'Taken twice', uz: 'Ikki marta yechilgan', ru: 'Списано дважды' },
  EARLY_DEBIT: { en: 'Taken early', uz: 'Muddatidan oldin yechilgan', ru: 'Списано раньше срока' },
  LATE_POSTING: { en: 'Recorded late, then fined', uz: 'Kech qayd etilib, jarima solingan', ru: 'Зачислено поздно, затем штраф' },
  ILLEGAL_FEE: { en: 'Fee not allowed', uz: 'Ruxsat etilmagan komissiya', ru: 'Недопустимая комиссия' },
}

/** The mistake as a sentence, for titles: "A payment taken twice". */
export const MISTAKE_LONG: Record<DefectType, Words> = {
  DOUBLE_DEBIT: { en: 'A payment taken twice', uz: 'Toʻlov ikki marta yechilgan', ru: 'Платёж списан дважды' },
  EARLY_DEBIT: { en: 'A payment taken before its date', uz: 'Toʻlov muddatidan oldin yechilgan', ru: 'Платёж списан раньше срока' },
  LATE_POSTING: { en: 'A payment recorded late, then fined', uz: 'Toʻlov kech yozilib, jarima solingan', ru: 'Платёж зачислен поздно, затем штраф' },
  ILLEGAL_FEE: { en: 'A fee that is not allowed', uz: 'Ruxsat etilmagan komissiya', ru: 'Недопустимая комиссия' },
}

export const CLAIM: Record<ClaimType, Words> = {
  ...MISTAKE,
  OTHER: { en: 'Something else', uz: 'Boshqa masala', ru: 'Другое' },
}

/** Who read a complaint: the AI fills a form, or simple rules do when it is off or too slow. */
export const READ_BY: Record<Mode, Words> = {
  llm: { en: 'Read by the AI', uz: 'Sunʼiy intellekt oʻqidi', ru: 'Прочитал ИИ' },
  rules: { en: 'Read by rules', uz: 'Qoidalar oʻqidi', ru: 'Прочитали правила' },
}

export const ACTING_AS: Record<Actor, Words> = {
  officer: { en: 'Complaints officer', uz: 'Shikoyatlar xodimi', ru: 'Сотрудник по жалобам' },
  compliance: { en: 'Compliance head', uz: 'Komplayens rahbari', ru: 'Руководитель комплаенса' },
  jury: { en: 'Visitor', uz: 'Tashrif buyuruvchi', ru: 'Посетитель' },
}

export const RECEIVED_BY: Record<ComplaintChannel, Words> = {
  APP: { en: 'bank app', uz: 'bank ilovasi', ru: 'приложение банка' },
  CALL_CENTER: { en: 'call centre', uz: 'call-markaz', ru: 'колл-центр' },
  BRANCH: { en: 'bank branch', uz: 'bank filiali', ru: 'отделение банка' },
  WEB: { en: 'website', uz: 'veb-sayt', ru: 'сайт' },
}

export const PAID_BY: Record<PaymentChannel, Words> = {
  AUTO_DEBIT: { en: 'automatic debit', uz: 'avtomatik yechim', ru: 'автосписание' },
  PAYNET: { en: 'Paynet', uz: 'Paynet', ru: 'Paynet' },
  CLICK: { en: 'Click', uz: 'Click', ru: 'Click' },
  BRANCH: { en: 'bank branch', uz: 'bank filiali', ru: 'отделение банка' },
  APP: { en: 'bank app', uz: 'bank ilovasi', ru: 'приложение банка' },
}

export const LANGUAGE: Record<Lang, Words> = {
  uz_latn: { en: 'Uzbek, Latin script', uz: 'oʻzbekcha, lotin yozuvi', ru: 'узбекский, латиница' },
  uz_cyrl: { en: 'Uzbek, Cyrillic script', uz: 'oʻzbekcha, kirill yozuvi', ru: 'узбекский, кириллица' },
  ru: { en: 'Russian', uz: 'ruscha', ru: 'русский' },
  mixed: { en: 'Uzbek and Russian, mixed', uz: 'oʻzbekcha va ruscha aralash', ru: 'узбекский и русский вперемешку' },
}

/** The `lang` attribute for a customer's or a contract's own words. */
export const LANG_ATTR: Record<Lang, string> = {
  uz_latn: 'uz-Latn',
  uz_cyrl: 'uz-Cyrl',
  ru: 'ru',
  mixed: 'mul',
}

export const LETTER: Record<DraftSource, Words> = {
  template: { en: 'Standard letter', uz: 'Standart xat', ru: 'Стандартное письмо' },
  llm: { en: 'Reworded by the AI', uz: 'SI qayta ifodalagan', ru: 'Переформулировано ИИ' },
}

export const DECIDED: Record<DecisionAction, Words> = {
  CONFIRM: { en: 'Confirmed', uz: 'Tasdiqlandi', ru: 'Подтверждено' },
  DISMISS: { en: 'Dismissed', uz: 'Rad etildi', ru: 'Отклонено' },
  CORRECT: { en: 'Corrected', uz: 'Tuzatildi', ru: 'Исправлено' },
}

export const INCIDENT_STATUS: Record<IncidentStatus, Words> = {
  OPEN: { en: 'Open: waiting for a refund proposal', uz: 'Ochiq: qaytarish taklifi kutilmoqda', ru: 'Открыт: ждёт предложения о возврате' },
  PROPOSED: { en: 'Refund proposed: waiting for approval', uz: 'Qaytarish taklif qilindi: tasdiq kutilmoqda', ru: 'Возврат предложен: ждёт утверждения' },
  APPROVED: { en: 'Refund approved: customers not told yet', uz: 'Qaytarish tasdiqlandi: mijozlarga hali xabar berilmagan', ru: 'Возврат утверждён: клиенты ещё не уведомлены' },
  NOTIFIED: { en: 'Every affected customer told', uz: 'Barcha zarar koʻrgan mijozlarga xabar berildi', ru: 'Все пострадавшие клиенты уведомлены' },
}

/** Which check of all loans found something: "found 11 Oct, by the first check of all loans". */
export const CHECK_TRIGGER: Record<CheckTrigger, Words> = {
  START: { en: 'by the first check of all loans', uz: 'barcha kreditlarning birinchi tekshiruvida', ru: 'первой проверкой всех кредитов' },
  FIRST_USE: { en: 'by the first check of all loans', uz: 'barcha kreditlarning birinchi tekshiruvida', ru: 'первой проверкой всех кредитов' },
  DAILY: { en: 'by the daily check', uz: 'kunlik tekshiruvda', ru: 'ежедневной проверкой' },
  AFTER_CHANGE: { en: 'by the check after a change in the bank', uz: 'bankdagi oʻzgarishdan keyingi tekshiruvda', ru: 'проверкой после изменения в банке' },
  BY_HAND: { en: 'by a check a person started', uz: 'xodim boshlagan tekshiruvda', ru: 'проверкой, запущенной вручную' },
}

/** The names of the bank's charges as the server sends them in English. */
const CHARGE_NAMES: Record<string, Words> = {
  'Late payment penalty': { en: 'Late payment penalty', uz: 'Kechikkan toʻlov uchun jarima', ru: 'Штраф за просрочку платежа' },
  'Loan issuance fee': { en: 'Loan issuance fee', uz: 'Kredit rasmiylashtirish komissiyasi', ru: 'Комиссия за выдачу кредита' },
  'Card reissue fee': { en: 'Card reissue fee', uz: 'Kartani qayta chiqarish komissiyasi', ru: 'Комиссия за перевыпуск карты' },
}

export function chargeName(name: string | null | undefined): Words | null {
  if (!name) return null
  return CHARGE_NAMES[name] ?? { en: name, uz: name, ru: name }
}

/** The bank's loan products, by their code. An unknown code shows the name the bank sent. */
const PRODUCTS: Record<string, Words> = {
  CONS: { en: 'Consumer loan', uz: 'Isteʼmol krediti', ru: 'Потребительский кредит' },
  MICRO: { en: 'Microloan', uz: 'Mikroqarz', ru: 'Микрозаём' },
  AUTO: { en: 'Car loan', uz: 'Avtokredit', ru: 'Автокредит' },
}

export function productName(code: string, sent: string): Words {
  return PRODUCTS[code] ?? { en: sent, uz: sent, ru: sent }
}

/** A legal text nobody has verified yet is shown as "To verify". */
export function verified(text: string | null): Words {
  if (text === null || text === TO_VERIFY) return { en: 'To verify', uz: 'Tekshirilishi kerak', ru: 'Требует проверки' }
  return { en: text, uz: text, ru: text }
}
