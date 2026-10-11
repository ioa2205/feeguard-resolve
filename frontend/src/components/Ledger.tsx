// The ledger with a day rail (DESIGN section 6): the main picture of FeeGuard.
//
// One row per installment answers two questions: was this amount owed, and was
// it on the right day. The first is in the amounts, the second on the rail.
// It is laid out for a narrow column: the installment and its amounts on the
// first line, then what happened next to the rail, then the sentence.

import { DAY, MONTH, countOf, formatDate, formatSom, formatTime } from '../format'
import { useLang } from '../i18n'
import type { ContractTimeline, OtherCharge, RowTreatment, TimelineEvent, TimelineRow } from '../types'
import { chargeName, MISTAKE, PAID_BY } from '../words'
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
  const { t } = useLang()
  const sameDay = event.at.slice(0, 10) === dueDate
  const when = sameDay ? formatTime(event.at) : `${formatDate(event.at)}, ${formatTime(event.at)}`
  let words: string
  if (event.kind === 'TAKEN') {
    const result =
      event.debit_status === 'FAILED'
        ? t({ en: ', failed', uz: ', amalga oshmadi', ru: ', не прошло' })
        : event.debit_status === 'REVERSED' ? t({ en: ', returned', uz: ', qaytarildi', ru: ', возвращено' }) : ''
    words = `${when} · ${event.card ?? t({ en: 'card', uz: 'karta', ru: 'карта' })}${result}`
  } else if (event.kind === 'RECORDED') {
    const channel = event.channel ? t(PAID_BY[event.channel]) : t({ en: 'payment', uz: 'toʻlov', ru: 'платёж' })
    words = sameDay
      ? `${t({ en: 'Recorded the same day', uz: 'Oʻsha kuni qayd etildi', ru: 'Зачислено в тот же день' })} · ${channel}`
      : `${t({ en: 'Recorded', uz: 'Qayd etildi', ru: 'Зачислено' })} ${formatDate(event.at)} · ${channel}`
  } else {
    const name = chargeName(event.charge_name)
    words = `${name ? t(name) : t({ en: 'Charge', uz: 'Undirma', ru: 'Начисление' })}${sameDay ? '' : ` · ${formatDate(event.at)}`}`
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
function Sentence({ treatment, name, sentence }: { treatment: RowTreatment; name: string; sentence: string }) {
  const { t } = useLang()
  if (treatment === 'CORRECT' || !sentence) return null
  return (
    <p className="mt-2">
      <strong>{treatment === 'CHECKED_CORRECT' ? t({ en: 'Checked, correct:', uz: 'Tekshirildi, toʻgʻri:', ru: 'Проверено, верно:' }) : `${name}.`}</strong> {sentence}
    </p>
  )
}

function NotOwed({ row }: { row: TimelineRow }) {
  const { t } = useLang()
  if (row.treatment === 'TAKEN_EARLY') {
    return (
      <span className="text-wrong font-semibold">
        <Mark kind="exclamation" /> {t({ en: 'Taken early', uz: 'Muddatidan oldin yechilgan', ru: 'Списано раньше срока' })} {formatSom(row.taken_early)}
        {row.days_early !== null && `, ${countOf(row.days_early, DAY)}`}
      </span>
    )
  }
  if (row.not_owed > 0) {
    return (
      <span className="text-wrong font-semibold">
        <Mark kind="exclamation" /> {t({ en: 'Not owed', uz: 'Qarz emas', ru: 'Не причиталось' })} {formatSom(row.not_owed)}
      </span>
    )
  }
  return null
}

function InstallmentRow({ row, striped }: { row: TimelineRow; striped: boolean }) {
  const { t, say } = useLang()
  const plain = row.treatment === 'CORRECT' || row.treatment === 'CHECKED_CORRECT'
  return (
    <li className={`border-line border-t border-l-4 px-3 py-3 ${BAR[row.treatment]} ${plain && striped ? 'bg-stripe' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span>
          <span className="text-ink-soft text-small">{t({ en: `No. ${row.n} · due`, uz: `${row.n}-toʻlov · muddati`, ru: `№ ${row.n} · срок` })}</span>{' '}
          <span className="font-semibold">{formatDate(row.due_date)}</span>
        </span>
        <span className="tabular-nums">
          <span className="text-ink-soft text-small">{t({ en: 'Owed', uz: 'Toʻlanishi kerak', ru: 'К оплате' })}</span> {formatSom(row.owed)}
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
          <p className="text-table text-ink-soft min-w-[15rem] flex-1">{t({ en: 'Nothing was taken or paid.', uz: 'Hech narsa yechilmagan yoki toʻlanmagan.', ru: 'Ничего не списано и не оплачено.' })}</p>
        )}
        <DayRail events={row.events} />
      </div>
      <Sentence
        treatment={row.treatment}
        name={row.finding_type ? t(MISTAKE[row.finding_type]) : t({ en: 'Mistake found', uz: 'Xato topildi', ru: 'Найдена ошибка' })}
        sentence={say(row.sentence, row.sentence_t)}
      />
    </li>
  )
}

/** A charge that belongs to no installment, such as a fee at the start. It has no rail. */
function ChargeRow({ charge }: { charge: OtherCharge }) {
  const { t, say } = useLang()
  const name = chargeName(charge.name)
  return (
    <li className={`border-line border-t border-l-4 px-3 py-3 ${BAR[charge.treatment]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-baseline gap-2">
          <Mark kind="charged" className="translate-y-px" />
          <span>
            {name ? t(name) : charge.name} · {formatDate(charge.charged_at)}
          </span>
        </span>
        <span className="tabular-nums">{formatSom(charge.amount)}</span>
        {charge.not_owed > 0 && (
          <span className="text-wrong font-semibold">
            <Mark kind="exclamation" /> {t({ en: 'Not owed', uz: 'Qarz emas', ru: 'Не причиталось' })} {formatSom(charge.not_owed)}
          </span>
        )}
      </div>
      <Sentence treatment={charge.treatment} name={t(MISTAKE.ILLEGAL_FEE)} sentence={say(charge.sentence, charge.sentence_t)} />
    </li>
  )
}

export function Ledger({ timeline }: { timeline: ContractTimeline }) {
  const { t } = useLang()
  const { totals } = timeline
  return (
    <section className="border-line bg-sheet rounded-sheet border">
      <header className="px-3 py-3">
        <h3 className="font-semibold">
          {t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <span className="font-normal">{timeline.contract_id}</span> · {formatSom(timeline.monthly_payment)},{' '}
          {t({ en: `due on day ${timeline.due_day} of each month`, uz: `har oyning ${timeline.due_day}-kuni`, ru: `платёж ${timeline.due_day}-го числа каждого месяца` })}
        </h3>
        <p className="text-ink-soft text-small">
          {timeline.product_name} · {formatSom(timeline.principal)},{' '}
          {t({ en: `${countOf(timeline.term_months, MONTH)}, from ${formatDate(timeline.start_date)}`, uz: `${countOf(timeline.term_months, MONTH)}, ${formatDate(timeline.start_date)}dan`, ru: `${countOf(timeline.term_months, MONTH)}, с ${formatDate(timeline.start_date)}` })}
          {timeline.schedule_changed_on && ` · ${t({ en: 'schedule changed on', uz: 'jadval oʻzgartirilgan sana:', ru: 'график изменён' })} ${formatDate(timeline.schedule_changed_on)}`}
          {timeline.early_repayment_requested_on &&
            ` · ${t({ en: 'early repayment asked on', uz: 'muddatidan oldin toʻlash soʻralgan sana:', ru: 'досрочное погашение запрошено' })} ${formatDate(timeline.early_repayment_requested_on)}`}
        </p>
        <p className="text-small mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <span><Mark kind="taken" /> {t({ en: 'Taken from card', uz: 'Kartadan yechildi', ru: 'Списано с карты' })}</span>
          <span><Mark kind="recorded" /> {t({ en: 'Recorded on the loan', uz: 'Kreditga qayd etildi', ru: 'Зачислено по кредиту' })}</span>
          <span><Mark kind="charged" /> {t({ en: 'Charged', uz: 'Undirildi', ru: 'Начислено' })}</span>
          <span className="text-ink-soft">{t({ en: 'The tall tick on the line is the due date. Each small tick is one day.', uz: 'Chiziqdagi baland belgi — toʻlov kuni. Har bir kichik belgi — bir kun.', ru: 'Высокая отметка на линии — срок платежа. Каждая маленькая — один день.' })}</span>
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
        <Label>{t({ en: `In these ${countOf(timeline.rows.length, MONTH)}`, uz: `Shu ${countOf(timeline.rows.length, MONTH)}da`, ru: `За эти месяцы: ${timeline.rows.length}` })}</Label>
        <span className="tabular-nums">{t({ en: 'Owed', uz: 'Toʻlanishi kerak', ru: 'К оплате' })} {formatSom(totals.owed)}</span>
        <span className="tabular-nums">{t({ en: 'Taken', uz: 'Yechildi', ru: 'Списано' })} {formatSom(totals.taken)}</span>
        {totals.taken_early > 0 && (
          <span className="text-wrong font-semibold tabular-nums">{t({ en: 'Taken early', uz: 'Muddatidan oldin', ru: 'Раньше срока' })} {formatSom(totals.taken_early)}</span>
        )}
        <span className={`tabular-nums ${totals.not_owed > 0 ? 'text-wrong font-semibold' : ''}`}>
          {t({ en: 'Not owed', uz: 'Qarz emas', ru: 'Не причиталось' })} {formatSom(totals.not_owed)}
        </span>
      </footer>
    </section>
  )
}
