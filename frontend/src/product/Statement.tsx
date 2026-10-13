// The bank's records of one loan, set like a statement (V2_PLAN W1.1): what was due, what was
// taken from the cards and what reached the loan, grouped by installment. A wrong row is red;
// nothing else is. On a phone the table becomes a list.

import type { CSSProperties, ReactNode } from 'react'

import { DAY, MONTH, countOf, formatDate, formatTime } from '../format'
import { useLang } from '../i18n'
import type { ContractTimeline, OtherCharge, TimelineEvent, TimelineRow } from '../types'
import { MISTAKE, PAID_BY, chargeName, productName } from '../words'
import { CaseTimeline, caseChart } from './Timeline'
import { Figures, Num, Som } from './ui'

function Line({ index, className = '', time, kind, where, amount }: { index: number; className?: string; time: ReactNode; kind: string; where: ReactNode; amount: ReactNode }) {
  return (
    <tr className={`in ${className}`} style={{ '--i': index } as CSSProperties}>
      <td className="t">{time}</td>
      <td className="k">{kind}</td>
      <td className="c">{where}</td>
      <td className="n">{amount}</td>
    </tr>
  )
}

export function Statement({ timeline, customer, skip }: { timeline: ContractTimeline; customer: string; skip?: string }) {
  const { t, say } = useLang()
  const { totals } = timeline
  let index = 0
  const wrongRow = timeline.rows.find((row) => row.treatment === 'WRONG' && caseChart(row, timeline.contract_id, customer))
  const chart = wrongRow ? caseChart(wrongRow, timeline.contract_id, customer) : null

  function events(row: TimelineRow) {
    const ordered = [...row.events].sort((a, b) => a.at.localeCompare(b.at) || (a.kind === 'TAKEN' ? -1 : 1))
    if (!ordered.length) {
      return [<tr key={`${row.n}-none`} className="note"><td /><td colSpan={3}>{t({ en: 'Nothing was taken or paid.', uz: 'Hech narsa yechilmagan yoki toʻlanmagan.', ru: 'Ничего не списано и не оплачено.' })}</td></tr>]
    }
    return ordered.map((event: TimelineEvent) => {
      const sameDay = event.at.slice(0, 10) === row.due_date.slice(0, 10)
      const when = sameDay ? formatTime(event.at) : `${formatDate(event.at)}, ${formatTime(event.at)}`
      const key = `${row.n}-${event.source_id}-${event.kind}`
      if (event.kind === 'TAKEN') {
        const failed = event.debit_status === 'FAILED'
        const result = failed
          ? t({ en: ' · failed', uz: ' · amalga oshmadi', ru: ' · не прошло' })
          : event.debit_status === 'REVERSED' ? t({ en: ' · returned', uz: ' · qaytarildi', ru: ' · возвращено' }) : ''
        return <Line key={key} index={index++} className={`${event.wrong ? 'bad' : ''}${failed ? ' failed' : ''}`} time={when}
          kind={t({ en: 'Taken', uz: 'Yechildi', ru: 'Списано' })} where={<>{event.card ?? t({ en: 'card', uz: 'karta', ru: 'карта' })}{result}</>}
          amount={<>−<Num n={event.amount ?? 0} /></>} />
      }
      if (event.kind === 'RECORDED') {
        return <Line key={key} index={index++} className={event.wrong ? 'bad' : ''} time={when}
          kind={t({ en: 'Recorded', uz: 'Yozildi', ru: 'Зачислено' })} where={event.channel ? t(PAID_BY[event.channel]) : ''}
          amount={<>+<Num n={event.amount ?? 0} /></>} />
      }
      const name = chargeName(event.charge_name)
      return <Line key={key} index={index++} className={event.wrong ? 'bad' : ''} time={when}
        kind={t({ en: 'Charged', uz: 'Undirildi', ru: 'Начислено' })} where={name ? t(name) : ''}
        amount={<>−<Num n={event.amount ?? 0} /></>} />
    })
  }

  function sentence(row: TimelineRow | OtherCharge, type: string | null, key: string) {
    const words = say(row.sentence, row.sentence_t)
    // The row's own sentence, unless it only repeats the verdict's reason beside it.
    if (row.treatment === 'CORRECT' || !words || row.sentence === skip) return null
    const bad = row.treatment === 'WRONG' || row.treatment === 'TAKEN_EARLY'
    const lead = row.treatment === 'CHECKED_CORRECT'
      ? t({ en: 'Checked, correct:', uz: 'Tekshirildi, toʻgʻri:', ru: 'Проверено, верно:' })
      : `${type ? t(MISTAKE[type as keyof typeof MISTAKE]) : t({ en: 'Mistake found', uz: 'Xato topildi', ru: 'Найдена ошибка' })}.`
    return <tr key={key} className={`note${bad ? ' bad' : ''}`}><td /><td colSpan={3}><b>{lead}</b> <Figures text={words} /></td></tr>
  }

  return (
    <div className="sheet">
      <div className="loan-head">
        <h3 className="h3">
          {t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })} <span className="id">{timeline.contract_id}</span> · <Som n={timeline.monthly_payment} />{' '}
          {t({ en: `a month, due on day ${timeline.due_day}`, uz: `oyiga, har oyning ${timeline.due_day}-kuni`, ru: `в месяц, платёж ${timeline.due_day}-го числа` })}
        </h3>
        <p>
          {t(productName(timeline.product_code, timeline.product_name))} · <Som n={timeline.principal} />, {countOf(timeline.term_months, MONTH)},{' '}
          {t({ en: `from ${formatDate(timeline.start_date)}`, uz: `${formatDate(timeline.start_date)}dan`, ru: `с ${formatDate(timeline.start_date)}` })}
          {timeline.schedule_changed_on && ` · ${t({ en: 'schedule changed on', uz: 'jadval oʻzgargan sana:', ru: 'график изменён' })} ${formatDate(timeline.schedule_changed_on)}`}
          {timeline.early_repayment_requested_on && ` · ${t({ en: 'early repayment asked on', uz: 'muddatidan oldin toʻlash soʻralgan sana:', ru: 'досрочное погашение запрошено' })} ${formatDate(timeline.early_repayment_requested_on)}`}
        </p>
      </div>
      {chart && wrongRow && (
        <CaseTimeline data={chart} installment={wrongRow.n} label={t({
          en: `Payment ${wrongRow.n}: taken twice on the due night, recorded once`,
          uz: `${wrongRow.n}-toʻlov: toʻlov kechasi ikki marta yechilgan, bir marta yozilgan`,
          ru: `Платёж ${wrongRow.n}: списан дважды в ночь платежа, зачислен один раз`,
        })} />
      )}
      <table className="ledger">
        <thead>
          <tr>
            <th>{t({ en: 'Time', uz: 'Vaqt', ru: 'Время' })}</th>
            <th>{t({ en: 'Record', uz: 'Yozuv', ru: 'Запись' })}</th>
            <th>{t({ en: 'Card or channel', uz: 'Karta yoki kanal', ru: 'Карта или канал' })}</th>
            <th className="n">{t({ en: 'soʻm', uz: 'soʻm', ru: 'сум' })}</th>
          </tr>
        </thead>
        <tbody>
          {timeline.rows.flatMap((row) => [
            <tr key={`${row.n}-due`} className="due in" style={{ '--i': index++ } as CSSProperties}>
              <td className="t">{formatDate(row.due_date)}</td>
              <td className="k">{t({ en: 'Due', uz: 'Kerak', ru: 'К оплате' })}</td>
              <td className="w">{t({ en: `Payment ${row.n}`, uz: `${row.n}-toʻlov`, ru: `Платёж ${row.n}` })}</td>
              <td className="n"><Num n={row.owed} /></td>
            </tr>,
            ...events(row),
            row.treatment === 'TAKEN_EARLY' && (
              <tr key={`${row.n}-early`} className="note bad"><td /><td colSpan={3}>
                <b>{t({ en: 'Taken early', uz: 'Muddatidan oldin yechilgan', ru: 'Списано раньше срока' })}:</b> <Som n={row.taken_early} />{row.days_early !== null && `, ${countOf(row.days_early, DAY)}`}
              </td></tr>
            ),
            sentence(row, row.finding_type, `${row.n}-say`),
          ])}
          {timeline.other_charges.flatMap((charge) => {
            const name = chargeName(charge.name)
            return [
              <tr key={charge.charge_id} className={`due in${charge.not_owed > 0 ? ' bad' : ''}`} style={{ '--i': index++ } as CSSProperties}>
                <td className="t">{formatDate(charge.charged_at)}</td>
                <td className="k">{t({ en: 'Charged', uz: 'Undirildi', ru: 'Начислено' })}</td>
                <td className="w">{name ? t(name) : charge.name}</td>
                <td className="n">−<Num n={charge.amount} /></td>
              </tr>,
              sentence(charge, 'ILLEGAL_FEE', `${charge.charge_id}-say`),
            ]
          })}
        </tbody>
      </table>
      <div className="sum">
        <span className="muted">{t({ en: `In these ${countOf(timeline.rows.length, MONTH)}`, uz: `Shu ${countOf(timeline.rows.length, MONTH)}da`, ru: `За эти месяцы (${timeline.rows.length})` })}: {t({ en: 'due', uz: 'kerak', ru: 'к оплате' })} <Som n={totals.owed} /> · {t({ en: 'taken', uz: 'yechildi', ru: 'списано' })} <Som n={totals.taken} /></span>
        {totals.taken_early > 0 && <span className="wrong">{t({ en: 'Taken early', uz: 'Muddatidan oldin', ru: 'Раньше срока' })} <Som n={totals.taken_early} /></span>}
        {totals.not_owed > 0
          ? <span className="wrong">{t({ en: 'Taken, but not owed', uz: 'Yechilgan, lekin qarz emas', ru: 'Списано сверх долга' })} <Som n={totals.not_owed} /></span>
          : <span>{t({ en: 'Nothing taken that was not owed', uz: 'Qarzdan ortiq hech narsa yechilmagan', ru: 'Сверх долга ничего не списано' })}</span>}
      </div>
    </div>
  )
}
