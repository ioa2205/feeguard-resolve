// Every word of the landing page in English, Uzbek (Latin) and Russian (V2_PLAN W2, GATE 2).
// Numbers come from the story (the API) or from docs/EVAL.md; none is written here except the
// measured ones that EVAL.md holds. The customer's own words are shown as written, and their
// translation is marked as one.

import type { ReactNode } from 'react'

import type { UiLang } from '../i18n'

export type L = Record<UiLang, string>
type Rich<A extends unknown[] = []> = Record<UiLang, (...args: A) => ReactNode>

// --- Words that change with a number ------------------------------------------------------

/** Russian picks one of three forms by the number. */
export function ru3(n: number, one: string, few: string, many: string): string {
  const tail = n % 10
  const tens = n % 100
  if (tail === 1 && tens !== 11) return one
  if (tail >= 2 && tail <= 4 && (tens < 12 || tens > 14)) return few
  return many
}

const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr']
const MONTH_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTH_RU_ONE = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

const parts = (iso: string) => ({ y: iso.slice(0, 4), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) })

/** "2026-07-05" -> "5 July" · "5-iyul" · "5 июля". */
export function dayMonth(iso: string, lang: UiLang): string {
  const { m, d } = parts(iso)
  if (lang === 'uz') return `${d}-${MONTH_UZ[m]}`
  if (lang === 'ru') return `${d} ${MONTH_RU[m]}`
  return `${d} ${MONTH_EN[m]}`
}

/** "2026-07-05" -> "5 July 2026" · "2026-yil 5-iyul" · "5 июля 2026". */
export function fullDate(iso: string, lang: UiLang): string {
  const { y } = parts(iso)
  if (lang === 'uz') return `${y}-yil ${dayMonth(iso, lang)}`
  return `${dayMonth(iso, lang)} ${y}`
}

/** "2026-07" -> "July 2026" · "2026-yil iyul" · "июль 2026". */
export function monthYear(period: string, lang: UiLang): string {
  const y = period.slice(0, 4)
  const m = Number(period.slice(5, 7)) - 1
  if (lang === 'uz') return `${y}-yil ${MONTH_UZ[m]}`
  if (lang === 'ru') return `${MONTH_RU_ONE[m]} ${y}`
  return `${MONTH_EN[m]} ${y}`
}

/** The span of records searched: "1 June to 31 August 2026" · "2026-yil 1-iyundan 31-avgustgacha" · "с 1 июня по 31 августа 2026". */
export function span(from: string, to: string, lang: UiLang): string {
  if (lang === 'uz') return `${to.slice(0, 4)}-yil ${dayMonth(from, lang)}dan ${dayMonth(to, lang)}gacha`
  if (lang === 'ru') return `с ${dayMonth(from, lang)} по ${dayMonth(to, lang)} ${to.slice(0, 4)}`
  return `${dayMonth(from, lang)} to ${dayMonth(to, lang)} ${to.slice(0, 4)}`
}

export const minutes = (n: number, lang: UiLang) =>
  lang === 'uz' ? `${n} daqiqa` : lang === 'ru' ? `${n} ${ru3(n, 'минута', 'минуты', 'минут')}` : `${n} ${n === 1 ? 'minute' : 'minutes'}`

export const seconds = (ms: number, lang: UiLang) => {
  const value = (ms / 1000).toFixed(1)
  return lang === 'en' ? value : value.replace('.', ',')
}

// --- The customer's complaint -------------------------------------------------------------

/** The words the story tells, as the customer wrote them (Uzbek), and their translations.
 * `hit` is the part about the money taken twice; the page underlines it. */
export const QUOTE = {
  original: 'Assalomu alaykum. Iyul oyida HUMO kartamdan kredit toʻlovi ikki marta yechib olindi. Pulimni qaytarib bering.',
  uz: { text: 'Assalomu alaykum. Iyul oyida HUMO kartamdan kredit toʻlovi ikki marta yechib olindi. Pulimni qaytarib bering.', hit: 'ikki marta yechib olindi' },
  en: { text: 'Hello. In July my loan payment was taken twice from my HUMO card. Please give my money back.', hit: 'taken twice' },
  ru: { text: 'Здравствуйте. В июле с моей карты HUMO дважды списали платёж по кредиту. Верните мои деньги.', hit: 'дважды списали' },
  /** The parts of the original the reading used, in the order the form fills in. */
  used: { problem: 'ikki marta yechib olindi', month: 'Iyul oyida' },
}

// --- Who to talk to (V2_PLAN W2 block 9: given by the user on 13 Oct 2026) -----------------

export const CONTACT = {
  name: 'Ibodulloxon Axmadxonov',
  links: [
    { name: 'Telegram', href: 'https://t.me/ibodullo' },
    { name: 'LinkedIn', href: 'https://www.linkedin.com/in/ibodullo' },
    { name: 'GitHub', href: 'https://github.com/ioa2205' },
  ],
}

// --- The page -----------------------------------------------------------------------------

export const C = {
  title: {
    en: 'FeeGuard: check a complaint against the bank’s own records',
    uz: 'FeeGuard: shikoyatni bankning oʻz yozuvlari bilan tekshiring',
    ru: 'FeeGuard: проверьте жалобу по записям самого банка',
  } satisfies L,
  nav: {
    how: { en: 'How it works', uz: 'Qanday ishlaydi', ru: 'Как это работает' } satisfies L,
    bank: { en: 'What the bank gets', uz: 'Bank nima oladi', ru: 'Что получает банк' } satisfies L,
    inside: { en: 'Inside a bank', uz: 'Bank ichida', ru: 'Внутри банка' } satisfies L,
    contact: { en: 'Contact', uz: 'Aloqa', ru: 'Контакты' } satisfies L,
    demo: { en: 'Open the demo', uz: 'Demoni ochish', ru: 'Открыть демо' } satisfies L,
    demoShort: { en: 'Demo', uz: 'Demo', ru: 'Демо' } satisfies L,
    language: { en: 'Language', uz: 'Til', ru: 'Язык' } satisfies L,
  },

  hero: {
    kicker: { en: 'A customer writes to the bank:', uz: 'Mijoz bankka yozadi:', ru: 'Клиент пишет в банк:' } satisfies L,
    translated: { en: 'translated from Uzbek', uz: '', ru: 'перевод с узбекского' } satisfies L,
    lead: { en: 'FeeGuard checks it against the bank’s own records.', uz: 'FeeGuard buni bankning oʻz yozuvlari bilan tekshiradi.', ru: 'FeeGuard сверяет это с записями самого банка.' } satisfies L,
    then: {
      en: 'Then it finds every other customer the same mistake hit.',
      uz: 'Soʻng xuddi shu xato tekkan boshqa har bir mijozni topadi.',
      ru: 'Затем находит всех остальных клиентов, которых задела та же ошибка.',
    } satisfies L,
    how: { en: 'How it works', uz: 'Qanday ishlaydi', ru: 'Как это работает' } satisfies L,
    fine: {
      en: 'No sign-in. The bank, its customers and their payments are invented.',
      uz: 'Roʻyxatdan oʻtish shart emas. Bank, uning mijozlari va toʻlovlari oʻylab topilgan.',
      ru: 'Без регистрации. Банк, его клиенты и их платежи вымышлены.',
    } satisfies L,
  },

  how: {
    title: { en: 'How it works', uz: 'Qanday ishlaydi', ru: 'Как это работает' } satisfies L,
    sub: {
      en: 'Four steps, in seconds. The AI only reads the words. Code checks the records, and a person makes the decision.',
      uz: 'Toʻrt qadam, bir necha soniyada. Sunʼiy intellekt faqat soʻzlarni oʻqiydi. Yozuvlarni kod tekshiradi, qarorni esa inson qabul qiladi.',
      ru: 'Четыре шага, за секунды. ИИ только читает слова. Записи проверяет код, а решение принимает человек.',
    } satisfies L,
    glance: [
      { b: { en: 'Read', uz: 'Oʻqish', ru: 'Прочитать' }, s: { en: 'the complaint', uz: 'shikoyatni', ru: 'жалобу' } },
      { b: { en: 'Check', uz: 'Tekshirish', ru: 'Проверить' }, s: { en: 'the bank’s records', uz: 'bank yozuvlarini', ru: 'записи банка' } },
      { b: { en: 'Decide', uz: 'Qaror qilish', ru: 'Решить' }, s: { en: 'who is right, and how much', uz: 'kim haq va qancha qaytariladi', ru: 'кто прав и сколько вернуть' } },
      // The same name as the product's own button, so the step and the button are one thing.
      { b: { en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' }, s: { en: 'with the same mistake', uz: 'xuddi shu xato tekkanlarni', ru: 'с той же ошибкой' } },
    ] satisfies { b: L; s: L }[],
  },

  read: {
    title: { en: 'Read the complaint', uz: 'Shikoyatni oʻqish', ru: 'Прочитать жалобу' } satisfies L,
    p1: {
      en: () => <>The AI reads the customer’s own words and fills in a short form: <b>the problem, the month, the amount</b>.</>,
      uz: () => <>Sunʼiy intellekt mijozning oʻz soʻzlarini oʻqiydi va qisqa shaklni toʻldiradi: <b>muammo, oy, summa</b>.</>,
      ru: () => <>ИИ читает слова клиента и заполняет короткую форму: <b>проблема, месяц, сумма</b>.</>,
    } satisfies Rich,
    p2: {
      en: 'It only fills the form. If it does not answer, or takes more than 8 seconds, simple rules read the words instead, and the screen says so.',
      uz: 'U faqat shaklni toʻldiradi. Agar javob bermasa yoki 8 soniyadan uzoq choʻzilsa, soʻzlarni oddiy qoidalar oʻqiydi va ekranda bu aytiladi.',
      ru: 'Он только заполняет форму. Если он не ответит или задержится дольше 8 секунд, слова прочитают простые правила, и экран об этом скажет.',
    } satisfies L,
    bar: { en: 'Complaint', uz: 'Shikoyat', ru: 'Жалоба' } satisfies L,
    understood: { en: 'What FeeGuard understood', uz: 'FeeGuard nimani tushundi', ru: 'Что понял FeeGuard' } satisfies L,
    readBy: {
      llm: { en: 'Read by the AI (Gemini)', uz: 'Sunʼiy intellekt (Gemini) oʻqidi', ru: 'Прочитал ИИ (Gemini)' } satisfies L,
      rules: { en: 'Read by rules', uz: 'Qoidalar oʻqidi', ru: 'Прочитали правила' } satisfies L,
    },
    customer: { en: 'Customer', uz: 'Mijoz', ru: 'Клиент' } satisfies L,
    fromSender: { en: 'known from who sent it', uz: 'kim yuborganidan maʼlum', ru: 'известен по отправителю' } satisfies L,
    problem: { en: 'Problem', uz: 'Muammo', ru: 'Проблема' } satisfies L,
    month: { en: 'Month', uz: 'Oy', ru: 'Месяц' } satisfies L,
    amount: { en: 'Amount', uz: 'Summa', ru: 'Сумма' } satisfies L,
    notStated: { en: 'Not stated', uz: 'Koʻrsatilmagan', ru: 'Не указана' } satisfies L,
    records: { en: 'Records to check', uz: 'Tekshiriladigan yozuvlar', ru: 'Какие записи проверить' } satisfies L,
    from: {
      en: (words: ReactNode) => <>from {words}</>,
      uz: (words: ReactNode) => <>{words} soʻzlaridan</>,
      ru: (words: ReactNode) => <>из слов {words}</>,
    } satisfies Rich<[ReactNode]>,
    /** The problem the reading named, by claim type. */
    claim: {
      DOUBLE_DEBIT: { en: 'A payment taken twice', uz: 'Toʻlov ikki marta yechilgan', ru: 'Платёж списан дважды' },
      EARLY_DEBIT: { en: 'A payment taken before its date', uz: 'Toʻlov muddatidan oldin yechilgan', ru: 'Платёж списан раньше срока' },
      LATE_POSTING: { en: 'A payment recorded late', uz: 'Toʻlov kech yozilgan', ru: 'Платёж зачислен с опозданием' },
      ILLEGAL_FEE: { en: 'A fee that is not allowed', uz: 'Ruxsat etilmagan komissiya', ru: 'Недопустимая комиссия' },
    } as Record<string, L>,
  },

  check: {
    title: { en: 'Check the bank’s records', uz: 'Bank yozuvlarini tekshirish', ru: 'Проверить записи банка' } satisfies L,
    p1: {
      en: () => <>Code puts three records side by side: <b>what was due</b>, <b>what was taken</b> from the customer’s cards, and <b>what reached the loan</b>.</>,
      uz: () => <>Kod uchta yozuvni yonma-yon qoʻyadi: <b>qancha toʻlanishi kerak edi</b>, mijozning kartalaridan <b>qancha yechildi</b> va <b>kreditga qancha yetib bordi</b>.</>,
      ru: () => <>Код сравнивает три записи: <b>сколько нужно было заплатить</b>, <b>сколько списано</b> с карт клиента и <b>сколько дошло до кредита</b>.</>,
    } satisfies Rich,
    p2: {
      en: (gap: number) => `Here, one payment was due. It was taken twice, ${minutes(gap, 'en')} apart, from two cards. The loan recorded it once.`,
      uz: (gap: number) => `Bu yerda bitta toʻlov kerak edi. U ikki marta, ${minutes(gap, 'uz')} farq bilan, ikki xil kartadan yechildi. Kreditga esa bir marta yozildi.`,
      ru: (gap: number) => `Здесь нужно было заплатить один раз. Деньги списали дважды, с разницей в ${minutes(gap, 'ru')}, с двух карт. На кредит платёж зачислен один раз.`,
    } satisfies Rich<[number]>,
    fact: {
      en: 'FeeGuard only reads the records. It never changes them.',
      uz: 'FeeGuard yozuvlarni faqat oʻqiydi va ularni hech qachon oʻzgartirmaydi.',
      ru: 'FeeGuard только читает записи и никогда их не меняет.',
    } satisfies L,
    loan: {
      en: (contract: string, n: number) => `Loan ${contract} · payment ${n}`,
      uz: (contract: string, n: number) => `Kredit ${contract} · ${n}-toʻlov`,
      ru: (contract: string, n: number) => `Кредит ${contract} · платёж ${n}`,
    } satisfies Rich<[string, number]>,
    readOnly: { en: 'Bank records, read-only', uz: 'Bank yozuvlari, faqat oʻqish', ru: 'Записи банка, только чтение' } satisfies L,
    head: {
      time: { en: 'Time', uz: 'Vaqt', ru: 'Время' } satisfies L,
      record: { en: 'Record', uz: 'Yozuv', ru: 'Запись' } satisfies L,
      card: { en: 'Card or channel', uz: 'Karta yoki kanal', ru: 'Карта или канал' } satisfies L,
    },
    kind: {
      due: { en: 'Due', uz: 'Kerak', ru: 'К оплате' } satisfies L,
      taken: { en: 'Taken', uz: 'Yechildi', ru: 'Списано' } satisfies L,
      recorded: { en: 'Recorded', uz: 'Yozildi', ru: 'Зачислено' } satisfies L,
    },
    what: {
      payment: { en: (n: number) => `Payment ${n}`, uz: (n: number) => `${n}-toʻlov`, ru: (n: number) => `Платёж ${n}` } satisfies Rich<[number]>,
      fromCard: { en: 'from the card', uz: 'kartadan', ru: 'с карты' } satisfies L,
      onLoan: { en: 'on the loan', uz: 'kreditga', ru: 'на кредит' } satisfies L,
      again: { en: 'again, another card', uz: 'yana, boshqa kartadan', ru: 'снова, с другой карты' } satisfies L,
      nothing: { en: 'nothing', uz: 'hech narsa', ru: 'ничего' } satisfies L,
    },
    channel: { AUTO_DEBIT: { en: 'Automatic debit', uz: 'Avtomatik yechish', ru: 'Автосписание' } } as Record<string, L>,
    notOwed: { en: 'Taken, but not owed', uz: 'Yechilgan, lekin qarz emas', ru: 'Списано сверх долга' } satisfies L,
  },

  decide: {
    title: { en: 'Decide who is right, and how much', uz: 'Kim haqligini va qancha qaytarishni hal qilish', ru: 'Решить, кто прав и сколько вернуть' } satisfies L,
    p1: {
      en: () => <>FeeGuard gives the verdict, <b>the amount to return</b>, and the records that prove it. It drafts the reply in the customer’s language.</>,
      uz: () => <>FeeGuard xulosa, <b>qaytariladigan summa</b> va buni isbotlovchi yozuvlarni beradi. Javob xatini mijozning tilida tayyorlaydi.</>,
      ru: () => <>FeeGuard даёт вывод, <b>сумму к возврату</b> и записи, которые это доказывают. Готовит ответ на языке клиента.</>,
    } satisfies Rich,
    p2: {
      en: 'A person reads it and decides. Nothing is sent before that.',
      uz: 'Xodim uni oʻqib, qaror qabul qiladi. Ungacha hech narsa yuborilmaydi.',
      ru: 'Сотрудник читает и решает. До этого ничего не отправляется.',
    } satisfies L,
    bar: { en: 'Verdict', uz: 'Xulosa', ru: 'Вывод' } satisfies L,
    checkedIn: {
      en: (s: string) => `Checked in ${s} s`,
      uz: (s: string) => `${s} soniyada tekshirildi`,
      ru: (s: string) => `Проверено за ${s} с`,
    } satisfies Rich<[string]>,
    stamp: { en: 'Customer is right', uz: 'Mijoz haq', ru: 'Клиент прав' } satisfies L,
    /** The reason under the stamp, from the records alone: what was due, both debits, what the loan recorded. */
    why: {
      en: (due: string, owed: string, each: string, a: string, b: string, recorded: number) =>
        `${owed} soʻm was due on ${due}. Two debits of ${each} soʻm went through: ${a} and ${b}. The loan recorded ${recorded === 1 ? 'one' : recorded}.`,
      uz: (due: string, owed: string, each: string, a: string, b: string, recorded: number) =>
        `${due} kuni ${owed} soʻm toʻlanishi kerak edi. ${each} soʻmdan ikki marta yechildi: ${a} va ${b}. Kreditga ${recorded === 1 ? 'bittasi' : `${recorded} tasi`} yozildi.`,
      ru: (due: string, owed: string, each: string, a: string, b: string, recorded: number) =>
        `${due} нужно было заплатить ${owed} сум. Прошли два списания по ${each} сум: ${a} и ${b}. На кредит ${recorded === 1 ? 'зачислено одно' : `зачислено ${recorded}`}.`,
    },
    /** "UZCARD at 02:21" · "02:21 da UZCARD" · "UZCARD в 02:21". */
    debitAt: {
      en: (card: string, time: string) => `${card} at ${time}`,
      uz: (card: string, time: string) => `${time} da ${card}`,
      ru: (card: string, time: string) => `${card} в ${time}`,
    },
    toReturn: { en: 'to return to the customer', uz: 'mijozga qaytariladi', ru: 'вернуть клиенту' } satisfies L,
    approve: { en: 'Approve the reply', uz: 'Javobni tasdiqlash', ru: 'Одобрить ответ' } satisfies L,
    reword: { en: 'Reword it', uz: 'Qayta yozish', ru: 'Переписать' } satisfies L,
    others: { en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' } satisfies L,
    blue: {
      en: 'The blue button is the person’s decision. FeeGuard never sends anything on its own.',
      uz: 'Koʻk tugma — insonning qarori. FeeGuard oʻzi hech narsa yubormaydi.',
      ru: 'Синяя кнопка — решение человека. FeeGuard сам ничего не отправляет.',
    } satisfies L,
  },

  night: {
    step: { en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' } satisfies L,
    a: {
      en: 'Now the same check runs over the whole bank.',
      uz: 'Endi xuddi shu tekshiruv butun bank boʻyicha ishlaydi.',
      ru: 'Теперь та же проверка идёт по всему банку.',
    } satisfies L,
    aSub: {
      en: (loans: ReactNode, name: string) => <>All {loans} loans. First, {name}’s payment, minute by minute.</>,
      uz: (loans: ReactNode, name: string) => <>Barcha {loans} ta kredit. Avval {name}ning toʻlovi, daqiqama-daqiqa.</>,
      ru: (loans: ReactNode, name: string, n: number) => <>{ru3(n, 'Весь', 'Все', 'Все')} {loans} {ru3(n, 'кредит', 'кредита', 'кредитов')}. Сначала платёж клиента {name}, минута за минутой.</>,
    } satisfies Rich<[ReactNode, string, number]>,
    b: { en: 'It was not one customer.', uz: 'Bu bitta mijoz emas edi.', ru: 'Это был не один клиент.' } satisfies L,
    key: {
      en: (dot: ReactNode, red: ReactNode, gap: string) => <>Each row is one loan. {dot}the payment, {red}the same payment, taken again {gap} later.</>,
      uz: (dot: ReactNode, red: ReactNode, gap: string) => <>Har bir qator bitta kredit. {dot}toʻlov, {red}oʻsha toʻlov, {gap}dan keyin yana yechilgan.</>,
      ru: (dot: ReactNode, red: ReactNode, gap: string) => <>Каждая строка — один кредит. {dot}платёж, {red}тот же платёж, списанный снова через {gap}.</>,
    } satisfies Rich<[ReactNode, ReactNode, string]>,
    c: { en: 'The pattern points to one cause.', uz: 'Qonuniyat bitta sababga ishora qiladi.', ru: 'Картина указывает на одну причину.' } satisfies L,
    /** From the cause finder's first trait, the billing run: its share of the cases and how much more often than normal. */
    cause: {
      en: (pct: number, total: number, run: string, lift: number) => `${pct}% of the ${total} payments taken twice came from one billing run, ${run}. That is ${Math.round(lift)} times more often than normal.`,
      uz: (pct: number, total: number, run: string, lift: number) => `Ikki marta yechilgan ${total} ta toʻlovning ${pct} foizi bitta hisob-kitob jarayonida, ${run} da yechilgan. Bu odatdagidan ${Math.round(lift)} baravar koʻp.`,
      ru: (pct: number, total: number, run: string, lift: number) => `${pct}% из ${total} платежей, списанных дважды, пришлись на один прогон списаний — ${run}. Это в ${Math.round(lift)} ${ru3(Math.round(lift), 'раз', 'раза', 'раз')} чаще обычного.`,
    },
  },

  chart: {
    due: {
      en: (date: string, n: number, owed: string) => `${date} · payment ${n} · due ${owed} soʻm`,
      uz: (date: string, n: number, owed: string) => `${date} · ${n}-toʻlov · ${owed} soʻm toʻlanishi kerak`,
      ru: (date: string, n: number, owed: string) => `${date} · платёж ${n} · к оплате ${owed} сум`,
    },
    taken: { en: 'Taken from a card', uz: 'Kartadan yechildi', ru: 'Списано с карты' } satisfies L,
    recorded: { en: 'Recorded on the loan', uz: 'Kreditga yozildi', ru: 'Зачислено на кредит' } satisfies L,
    notRecorded: { en: 'not recorded', uz: 'yozilmadi', ru: 'не зачислено' } satisfies L,
    night: {
      en: (date: string, n: number) => `Night of ${date} · ${n} payments`,
      uz: (date: string, n: number) => `${date}ga oʻtar kecha · ${n} ta toʻlov`,
      ru: (date: string, n: number) => `Ночь на ${date} · ${n} ${ru3(n, 'платёж', 'платежа', 'платежей')}`,
    },
    share: {
      en: (pct: number, lift: number, total: number) => `${pct}% of the ${total} · ${Math.round(lift)} times normal`,
      uz: (pct: number, lift: number, total: number) => `${total} tadan ${pct}% · odatdagidan ${Math.round(lift)} baravar koʻp`,
      ru: (pct: number, lift: number, total: number) => `${pct}% из ${total} · в ${Math.round(lift)} ${ru3(Math.round(lift), 'раз', 'раза', 'раз')} чаще обычного`,
    },
  },

  money: {
    kicker: { en: 'Found from one complaint', uz: 'Bitta shikoyatdan topildi', ru: 'Найдено по одной жалобе' } satisfies L,
    line: {
      en: (customers: ReactNode, silent: ReactNode) => <>to return to {customers} customers. {silent} of them never complained, so without FeeGuard no one would have looked.</>,
      uz: (customers: ReactNode, silent: ReactNode) => <>{customers} mijozga qaytarilishi kerak. Ulardan {silent} tasi hech qachon shikoyat qilmagan: FeeGuard boʻlmasa, ularni hech kim tekshirmas edi.</>,
      ru: (customers: ReactNode, silent: ReactNode, n: number) => <>нужно вернуть {customers} {ru3(n, 'клиенту', 'клиентам', 'клиентам')}. {silent} из них ни разу не жаловались: без FeeGuard их бы никто не проверил.</>,
    } satisfies Rich<[ReactNode, ReactNode, number]>,
  },

  gets: {
    title: { en: 'What the bank gets', uz: 'Bank nima oladi', ru: 'Что получает банк' } satisfies L,
    sub: {
      en: 'From one complaint, everything needed to put it right, and to show the regulator it was put right.',
      uz: 'Bitta shikoyatdan xatoni tuzatish va buni regulyatorga koʻrsatish uchun kerak boʻlgan hamma narsa.',
      ru: 'Из одной жалобы — всё, чтобы исправить ошибку и показать регулятору, что она исправлена.',
    } satisfies L,
    letter: {
      h: { en: 'A reply in the customer’s language', uz: 'Mijozning tilida javob', ru: 'Ответ на языке клиента' } satisfies L,
      p: {
        en: 'Drafted from the records, in Uzbek here. A person approves it before it goes out.',
        uz: 'Yozuvlar asosida tayyorlangan, bu yerda oʻzbek tilida. Yuborishdan oldin uni xodim tasdiqlaydi.',
        ru: 'Составлен по записям, здесь на узбекском. Перед отправкой его одобряет сотрудник.',
      } satisfies L,
    },
    refunds: {
      h: { en: 'The refund list', uz: 'Qaytarish roʻyxati', ru: 'Список возвратов' } satisfies L,
      p: {
        en: 'Every affected loan and the exact amount, as a file for the payments team.',
        uz: 'Har bir zarar koʻrgan kredit va aniq summa, toʻlovlar boʻlimi uchun fayl koʻrinishida.',
        ru: 'Каждый пострадавший кредит и точная сумма, файлом для отдела платежей.',
      } satisfies L,
      more: {
        en: (n: number) => `and ${n} more loans`,
        uz: (n: number) => `va yana ${n} ta kredit`,
        ru: (n: number) => `и ещё ${n} ${ru3(n, 'кредит', 'кредита', 'кредитов')}`,
      },
      total: { en: 'Total', uz: 'Jami', ru: 'Итого' } satisfies L,
    },
    fix: {
      h: { en: 'A fix plan', uz: 'Tuzatish rejasi', ru: 'План исправления' } satisfies L,
      p: {
        en: 'What to change so it does not happen again, and the cause it rests on.',
        uz: 'Bu takrorlanmasligi uchun nimani oʻzgartirish kerak va bu qaysi sababga asoslanadi.',
        ru: 'Что изменить, чтобы это не повторилось, и на какой причине это основано.',
      } satisfies L,
      cause: { en: 'Cause', uz: 'Sabab', ru: 'Причина' } satisfies L,
      suggested: { en: 'Suggested fix', uz: 'Tuzatish taklifi', ru: 'Как исправить' } satisfies L,
      run: {
        en: (run: string, pct: number, lift: number) => `Billing run ${run}: ${pct}% of the cases, ${Math.round(lift)} times more often than normal.`,
        uz: (run: string, pct: number, lift: number) => `${run} hisob-kitob jarayoni: holatlarning ${pct} foizi, odatdagidan ${Math.round(lift)} baravar koʻp.`,
        ru: (run: string, pct: number, lift: number) => `Прогон списаний ${run}: ${pct}% случаев, в ${Math.round(lift)} ${ru3(Math.round(lift), 'раз', 'раза', 'раз')} чаще обычного.`,
      },
    },
    one: {
      h: { en: 'One decision for everyone', uz: 'Hamma uchun bitta qaror', ru: 'Одно решение для всех' } satisfies L,
      p: {
        en: (n: ReactNode) => <>All {n} customers become one incident, decided once.</>,
        uz: (n: ReactNode) => <>Barcha {n} mijoz bitta hodisaga birlashadi va bir marta hal qilinadi.</>,
        ru: (n: ReactNode) => <>Все {n} клиентов — один инцидент, решение принимается один раз.</>,
      } satisfies Rich<[ReactNode]>,
      steps: [
        { b: { en: 'FeeGuard proposes the refund', uz: 'FeeGuard qaytarishni taklif qiladi', ru: 'FeeGuard предлагает возврат' } },
        { b: { en: 'A person approves it', uz: 'Xodim uni tasdiqlaydi', ru: 'Сотрудник его одобряет' }, s: { en: 'once, for all of them', uz: 'bir marta, hammasi uchun', ru: 'один раз, для всех' } },
        { b: { en: 'Every customer is told', uz: 'Har bir mijozga xabar beriladi', ru: 'Каждому клиенту сообщают' }, s: { en: 'in their own language', uz: 'oʻz tilida', ru: 'на его языке' } },
      ] as { b: L; s?: L }[],
      customersWord: { en: 'customers', uz: 'mijoz', ru: 'клиентов' } satisfies L,
    },
    log: {
      h: { en: 'A log nobody can quietly change', uz: 'Hech kim yashirincha oʻzgartira olmaydigan jurnal', ru: 'Журнал, который нельзя незаметно изменить' } satisfies L,
      p: {
        en: 'Each entry carries the code of the one before it. Change one, and the chain breaks.',
        uz: 'Har bir yozuv oʻzidan oldingisining kodini saqlaydi. Bittasini oʻzgartirsangiz, zanjir uziladi.',
        ru: 'Каждая запись хранит код предыдущей. Измените одну, и цепочка порвётся.',
      } satisfies L,
      before: { en: 'before', uz: 'oldingi', ru: 'до' } satisfies L,
      self: { en: 'this', uz: 'bu', ru: 'эта' } satisfies L,
      action: {
        COMPLAINT_RECEIVED: { en: 'Complaint received', uz: 'Shikoyat qabul qilindi', ru: 'Жалоба получена' },
        COMPLAINT_CHECKED: { en: 'Complaint checked', uz: 'Shikoyat tekshirildi', ru: 'Жалоба проверена' },
        COMPLAINT_CHECKED_RIGHT: { en: 'Complaint checked: customer is right', uz: 'Shikoyat tekshirildi: mijoz haq', ru: 'Жалоба проверена: клиент прав' },
        OTHERS_SEARCHED: { en: 'Others with the same mistake searched', uz: 'Xuddi shu xato boʻyicha boshqalar qidirildi', ru: 'Поиск других с той же ошибкой' },
        LETTER_REWORDING_ASKED: { en: 'Reply reworded', uz: 'Javob qayta yozildi', ru: 'Ответ переписан' },
      } as Record<string, L>,
    },
  },

  here: {
    title: { en: 'It has happened in Uzbekistan', uz: 'Bu Oʻzbekistonda boʻlgan', ru: 'Это уже было в Узбекистане' } satisfies L,
    sub: {
      en: 'Two patterns from public news, rebuilt in invented banks. FeeGuard found every case we planted, with no false alarms.',
      uz: 'Ommaviy yangiliklardagi ikki holat oʻylab topilgan banklarda qayta yaratildi. FeeGuard biz joylagan har bir holatni topdi, birorta ham notoʻgʻri signalsiz.',
      ru: 'Две схемы из публичных новостей, воссозданные в вымышленных банках. FeeGuard нашёл каждый заложенный случай без ложных срабатываний.',
    } satisfies L,
    fee: { en: 'An issuance fee that is not allowed', uz: 'Ruxsat etilmagan kredit berish komissiyasi', ru: 'Недопустимая комиссия за выдачу' } satisfies L,
    late: { en: 'A payment recorded late, then fined', uz: 'Toʻlov kech yozilib, keyin jarima solingan', ru: 'Платёж зачислен с опозданием, затем штраф' } satisfies L,
    customers: { en: 'Customers', uz: 'Mijozlar', ru: 'Клиенты' } satisfies L,
    silent: { en: 'Never complained', uz: 'Shikoyat qilmagan', ru: 'Не жаловались' } satisfies L,
    toReturn: { en: 'To return', uz: 'Qaytariladi', ru: 'Вернуть' } satisfies L,
    sources: { en: 'Sources:', uz: 'Manbalar:', ru: 'Источники:' } satisfies L,
    and: { en: 'and', uz: 'va', ru: 'и' } satisfies L,
    newsDate: { en: '3 Oct 2025', uz: '2025-yil 3-oktabr', ru: '3 октября 2025' } satisfies L,
    fine: {
      en: 'The customers are invented. We do not claim to know those banks’ internal causes. Measured 11 Oct 2026.',
      uz: 'Mijozlar oʻylab topilgan. Biz u banklardagi ichki sabablarni bilamiz, deb daʼvo qilmaymiz. 2026-yil 11-oktabrda oʻlchangan.',
      ru: 'Клиенты вымышлены. Мы не утверждаем, что знаем внутренние причины в этих банках. Измерено 11 октября 2026.',
    } satisfies L,
  },

  inside: {
    title: { en: 'How it runs inside a bank', uz: 'Bank ichida qanday ishlaydi', ru: 'Как это работает внутри банка' } satisfies L,
    rules: [
      {
        b: { en: 'It reads, it never writes.', uz: 'Faqat oʻqiydi, hech narsa yozmaydi.', ru: 'Только читает, ничего не пишет.' },
        s: { en: 'FeeGuard reads the bank’s records with read-only access.', uz: 'FeeGuard bank yozuvlarini faqat oʻqish huquqi bilan oʻqiydi.', ru: 'FeeGuard читает записи банка с доступом только на чтение.' },
      },
      {
        b: { en: 'The AI only reads the complaint.', uz: 'Sunʼiy intellekt faqat shikoyatni oʻqiydi.', ru: 'ИИ только читает жалобу.' },
        s: { en: 'Every number and every verdict comes from code you can check.', uz: 'Har bir raqam va har bir xulosa tekshirish mumkin boʻlgan koddan chiqadi.', ru: 'Каждое число и каждый вывод дают код, который можно проверить.' },
      },
      {
        b: { en: 'A person decides.', uz: 'Qarorni inson qabul qiladi.', ru: 'Решает человек.' },
        s: { en: 'No letter, refund or message goes out before a person approves it.', uz: 'Xodim tasdiqlamaguncha hech qanday xat, qaytarish yoki xabar yuborilmaydi.', ru: 'Ни письмо, ни возврат, ни сообщение не уходят без одобрения сотрудника.' },
      },
      {
        b: { en: 'Everything is logged.', uz: 'Hamma narsa jurnalga yoziladi.', ru: 'Всё записывается в журнал.' },
        s: { en: 'Each action is chained to the one before it, so a changed entry shows.', uz: 'Har bir harakat oldingisiga bogʻlangan, shuning uchun oʻzgartirilgan yozuv darhol koʻrinadi.', ru: 'Каждое действие связано с предыдущим, поэтому изменённая запись сразу видна.' },
      },
    ] as { b: L; s: L }[],
  },

  measured: {
    title: { en: 'Measured, not promised', uz: 'Vaʼda emas, oʻlchov', ru: 'Измерено, а не обещано' } satisfies L,
    // docs/EVAL.md, Proof 1 (11 Oct 2026): 400 + 1 523 + 469 + 440 planted and found, 0 false alarms, 20 of 20 traps cleared.
    claim: {
      en: (n: (v: string) => ReactNode) => <>{n('2 832 of 2 832')} planted mistakes found. {n('0')} false alarms. {n('20 of 20')} look-alike cases cleared.</>,
      uz: (n: (v: string) => ReactNode) => <>Joylangan {n('2 832')} ta xatoning {n('2 832')} tasi topildi. {n('0')} ta notoʻgʻri signal. {n('20')} ta oʻxshash holatning {n('20')} tasi toʻgʻri rad etildi.</>,
      ru: (n: (v: string) => ReactNode) => <>Найдено {n('2 832 из 2 832')} заложенных ошибок. {n('0')} ложных срабатываний. {n('20 из 20')} похожих случаев верно отклонены.</>,
    } satisfies Rich<[(v: string) => ReactNode]>,
    fine: {
      en: 'On an invented bank we built: 20 000 loans, four kinds of mistake, measured 11 Oct 2026. Not measured yet: complaints written by hand, and the time it saves.',
      uz: 'Biz yaratgan oʻylab topilgan bankda: 20 000 ta kredit, toʻrt turdagi xato, 2026-yil 11-oktabrda oʻlchangan. Hali oʻlchanmagan: qoʻlda yozilgan shikoyatlar va tejaladigan vaqt.',
      ru: 'На вымышленном банке, который мы построили: 20 000 кредитов, четыре вида ошибок, измерено 11 октября 2026. Ещё не измерено: жалобы, написанные людьми, и сэкономленное время.',
    } satisfies L,
  },

  cta: {
    title: { en: 'Check it yourself.', uz: 'Oʻzingiz tekshirib koʻring.', ru: 'Проверьте сами.' } satisfies L,
    p: {
      en: 'Open the demo bank, write a complaint as a customer, and watch FeeGuard check it.',
      uz: 'Demo bankni oching, mijoz sifatida shikoyat yozing va FeeGuard uni qanday tekshirishini kuzating.',
      ru: 'Откройте демо-банк, напишите жалобу от имени клиента и посмотрите, как FeeGuard её проверит.',
    } satisfies L,
    talk: { en: 'Talk to us', uz: 'Biz bilan bogʻlaning', ru: 'Свяжитесь с нами' } satisfies L,
  },

  foot: {
    invented: {
      en: 'The bank, customers and payments on this page are invented.',
      uz: 'Bu sahifadagi bank, mijozlar va toʻlovlar oʻylab topilgan.',
      ru: 'Банк, клиенты и платежи на этой странице вымышлены.',
    } satisfies L,
    saved: {
      en: (when: string) => `The demo bank did not answer, so these numbers come from a copy of its answer saved on ${when}.`,
      uz: (when: string) => `Demo bank javob bermadi, shuning uchun bu raqamlar uning ${when} kuni saqlangan javobidan olindi.`,
      ru: (when: string) => `Демо-банк не ответил, поэтому эти числа взяты из копии его ответа, сохранённой ${when}.`,
    },
  },
}
