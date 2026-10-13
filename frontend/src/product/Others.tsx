// Find others (V2_PLAN W1.6): every loan with the same mistake, including customers who never
// complained. It opens on black, like the landing page's night: three numbers, then every
// affected loan on one clock, so the cause shows before a word is read. Then the cause in words,
// the refund list and what to do next.

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../api'
import { CUSTOMER, DAY, LOAN, countOf, formatNumber, formatSeconds, formatShare, formatTimes } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import type { CaseResult, DefectType, Incident, ScanResult } from '../types'
import { MISTAKE_LONG } from '../words'
import { StripTimeline, stripChart } from './Timeline'
import { Figures, Loading, Num, Problem, Rise, Som } from './ui'

const FIRST_ROWS = 12
const FEW_CASES = 20

// The plain names of what the cases may share (backend engine/causes.py). An unknown name is shown as sent.
const SHARED: Record<string, Words> = {
  batch_run: { en: 'Billing run', uz: 'Hisob-kitob jarayoni', ru: 'Прогон списаний' },
  cards: { en: 'Cards of the customer', uz: 'Mijozning kartalari', ru: 'Карты клиента' },
  channel: { en: 'Paid through', uz: 'Toʻlov kanali', ru: 'Канал оплаты' },
  product: { en: 'Product', uz: 'Mahsulot', ru: 'Продукт' },
  schedule: { en: 'Payment schedule', uz: 'Toʻlov jadvali', ru: 'График платежей' },
  tariff: { en: 'Tariff', uz: 'Tarif', ru: 'Тариф' },
  region: { en: 'Region', uz: 'Hudud', ru: 'Регион' },
}

/** F-0306-1 is the first finding of complaint C-0306. */
const complaintOf = (findingId: string) => {
  const match = /^F-(.+)-\d+$/.exec(findingId)
  return match ? `C-${match[1]}` : null
}

export default function Others() {
  const { findingId } = useParams()
  return <OthersView key={findingId} findingId={findingId ?? ''} />
}

function OthersView({ findingId }: { findingId: string }) {
  const { t } = useLang()
  const from = complaintOf(findingId)
  const { state, reload } = useLoad<{ scan: ScanResult; own: CaseResult | null; incident: Incident | null }>(async () => {
    const [scan, own, incidents] = await Promise.all([
      api.scan(findingId),
      from ? api.getCase(from).catch(() => null) : Promise.resolve(null),
      api.incidents().then((list) => list.items, () => [] as Incident[]),
    ])
    return { scan, own, incident: incidents.find((item) => item.finding_type === scan.finding_type) ?? null }
  }, [findingId])

  if (state.status === 'loading') return <div className="wrap" style={{ paddingTop: 34 }}><Loading lines={6} words={t({ en: 'Checking every loan of the bank…', uz: 'Bankning har bir krediti tekshirilmoqda…', ru: 'Проверяем каждый кредит банка…' })} /></div>
  if (state.status === 'error') {
    return (
      <div className="wrap" style={{ paddingTop: 34 }}>
        <p style={{ marginBottom: 20 }}><Link className="back" to="/app">← {t({ en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' })}</Link></p>
        <Problem error={state.error} onRetry={reload} />
      </div>
    )
  }
  return <Found {...state.data} from={from} findingId={findingId} />
}

function Found({ scan, own, incident, from, findingId }: { scan: ScanResult; own: CaseResult | null; incident: Incident | null; from: string | null; findingId: string }) {
  const { t, ui } = useLang()
  const early = scan.finding_type === 'EARLY_DEBIT'
  const finding = own?.findings.find((item) => item.finding_id === findingId) ?? own?.findings[0]
  const ownRow = own?.timelines.flatMap((timeline) => timeline.rows).find((row) => row.treatment === 'WRONG' && row.finding_type === 'DOUBLE_DEBIT') ?? null
  const chart = useMemo(
    () => (scan.finding_type === 'DOUBLE_DEBIT' ? stripChart(scan.items, { contract: finding?.contract_id ?? '', row: ownRow }, scan.cause?.attributes[0]?.lift ?? 0) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scan],
  )
  const n = scan.affected_customers
  const title = n === 0
    ? t({ en: 'No customer has this mistake in the bank’s records now.', uz: 'Hozir bank yozuvlarida bu xato hech bir mijozda yoʻq.', ru: 'Сейчас в записях банка этой ошибки нет ни у одного клиента.' })
    : !scan.systemic
      ? t({ en: 'Only this customer was hit. No pattern was found.', uz: 'Faqat shu mijoz zarar koʻrgan. Qonuniyat topilmadi.', ru: 'Пострадал только этот клиент. Закономерности не найдено.' })
      : ui === 'en'
        ? `It was not one customer. The same mistake hit ${formatNumber(n)}.`
        : ui === 'uz'
          ? `Bu bitta mijoz emas edi. Xuddi shu xato ${countOf(n, CUSTOMER)}ga tekkan.`
          : `Это был не один клиент. С той же ошибкой — ${countOf(n, CUSTOMER)}.`

  return (
    <>
      <section className="dark night" data-dark>
        <div className="wrap enter">
          <Link className="back" to={from ? `/app/case/${encodeURIComponent(from)}` : '/app'}>← {from ? `${t({ en: 'Complaint', uz: 'Shikoyat', ru: 'Жалоба' })} ${from}` : t({ en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' })}</Link>
          <p className="lbl" style={{ marginTop: 22 }}>{t({ en: 'Find others', uz: 'Boshqalarni topish', ru: 'Найти других' })} · {t(MISTAKE_LONG[scan.finding_type])}</p>
          <h1 className="h-big">{title}</h1>
          <p className="sub">{t({
            en: 'Every loan with the same mistake, read from the bank’s records. Nothing was changed.',
            uz: 'Xuddi shu xato boʻlgan har bir kredit, bank yozuvlaridan oʻqilgan. Hech narsa oʻzgartirilmagan.',
            ru: 'Каждый кредит с той же ошибкой, прочитанный из записей банка. Ничего не изменено.',
          })}</p>
          {n > 0 && (
            <div className="headline">
              <div><b><Num n={n} /></b><span>{t({ en: 'customers', uz: 'mijoz', ru: 'клиентов' })}, {countOf(scan.affected_contracts, LOAN)}</span></div>
              <div><b><Num n={scan.silent} /></b><span>{t({ en: 'never complained', uz: 'hech qachon shikoyat qilmagan', ru: 'ни разу не жаловались' })}</span></div>
              {early
                ? <div><b><Rise n={scan.total_affected} /></b><span>{t({ en: 'taken early', uz: 'muddatidan oldin yechilgan', ru: 'списано раньше срока' })}{scan.avg_days_early !== null && `, ${t({ en: 'on average', uz: 'oʻrtacha', ru: 'в среднем на' })} ${countOf(scan.avg_days_early, DAY)}`}</span></div>
                : <div><b className="wrong"><Rise n={scan.total_excess} /></b><span>{t({ en: 'to return', uz: 'qaytariladi', ru: 'к возврату' })}</span></div>}
            </div>
          )}
          {chart && (
            <>
              <StripTimeline data={chart} installment={ownRow?.n ?? 0} label={t({
                en: `${formatNumber(scan.affected_contracts)} loans on one clock: each was debited twice, minutes apart, on the same nights`,
                uz: `${formatNumber(scan.affected_contracts)} ta kredit bitta soatda: har biri oʻsha kechalarda bir necha daqiqa farq bilan ikki marta yechilgan`,
                ru: `${formatNumber(scan.affected_contracts)} кредитов на одной шкале времени: каждый списан дважды с разницей в минуты в одни и те же ночи`,
              })} />
              <p className="key">
                <span><i />{t({ en: 'the payment', uz: 'toʻlov', ru: 'платёж' })}</span>
                <span><i className="r" />{t({ en: 'the same payment, taken again', uz: 'oʻsha toʻlov, yana yechilgan', ru: 'тот же платёж, списанный снова' })}</span>
                <span>{t({ en: 'Each row is one loan.', uz: 'Har bir qator bitta kredit.', ru: 'Каждая строка — один кредит.' })}</span>
              </p>
            </>
          )}
          <p className="meta" style={{ marginTop: 18, color: 'var(--grey-n)' }}>{t({ en: 'The whole bank was searched in', uz: 'Butun bank boʻyicha qidiruv vaqti:', ru: 'Весь банк проверен за' })} {formatSeconds(scan.elapsed_ms, 2)}.</p>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 44 }}>
        <div className="row-acts" style={{ marginBottom: 26 }}>
          {incident && <Link className="btn" to={`/app/incidents/${encodeURIComponent(incident.incident_id)}`}>{t({ en: 'Open the incident', uz: 'Hodisani ochish', ru: 'Открыть инцидент' })} <span className="arrow">→</span></Link>}
          <Download scan={scan} />
          <Link className="btn btn--quiet" to="/app/report">{t({ en: 'Write the fix plan', uz: 'Tuzatish rejasini yozish', ru: 'Составить план исправления' })}</Link>
        </div>
        <div className="cols">
          <Why scan={scan} />
          {scan.items.length > 0 && <Refunds scan={scan} own={finding?.contract_id ?? null} />}
        </div>
      </section>
    </>
  )
}

function Why({ scan }: { scan: ScanResult }) {
  const { t, say } = useLang()
  const { cause } = scan
  return (
    <div className="panel">
      <div className="panel__bar"><b>{t({ en: 'Why it happened', uz: 'Nega shunday boʻldi', ru: 'Почему это произошло' })}</b><span>{t({ en: 'From the records of the affected loans', uz: 'Zarar koʻrgan kreditlar yozuvlaridan', ru: 'По записям пострадавших кредитов' })}</span></div>
      <div className="sheet pad prose">
        {!cause ? (
          <p>{t({ en: `Too few cases to name a cause: FeeGuard names one only from ${FEW_CASES} cases on.`, uz: `Sababni aytish uchun holatlar kam: FeeGuard sababni faqat ${FEW_CASES} ta holatdan boshlab aytadi.`, ru: `Слишком мало случаев, чтобы назвать причину: FeeGuard называет её только начиная с ${FEW_CASES} случаев.` })}</p>
        ) : (
          <>
            <span className="lbl">{t({ en: 'Cause', uz: 'Sabab', ru: 'Причина' })}</span>
            <p style={{ marginTop: 4, fontSize: 16 }}><Figures text={say(cause.sentence, cause.sentence_t)} /></p>
            {cause.suggested_fix && (
              <>
                <span className="lbl" style={{ display: 'block', marginTop: 20 }}>{t({ en: 'Suggested fix', uz: 'Tuzatish taklifi', ru: 'Как исправить' })}</span>
                <p style={{ marginTop: 4 }}>{say(cause.suggested_fix, cause.suggested_fix_t)}</p>
              </>
            )}
          </>
        )}
      </div>
      {cause && cause.attributes.length > 0 && (
        <div className="sheet scroll">
          <table className="tbl tbl--tight">
            <thead><tr>
              <th>{t({ en: 'What they share', uz: 'Umumiy jihat', ru: 'Что общего' })}</th>
              <th>{t({ en: 'Value', uz: 'Qiymat', ru: 'Значение' })}</th>
              <th className="n">{t({ en: 'Of the cases', uz: 'Holatlar ulushi', ru: 'Доля случаев' })}</th>
              <th className="n">{t({ en: 'Against normal', uz: 'Odatdagiga nisbatan', ru: 'К обычному' })}</th>
            </tr></thead>
            <tbody>
              {cause.attributes.map((attribute) => (
                <tr key={attribute.name + attribute.value}>
                  <td>{SHARED[attribute.name] ? t(SHARED[attribute.name]) : attribute.name}</td>
                  <td className="id">{attribute.value}</td>
                  <td className="n">{formatShare(attribute.support)}</td>
                  <td className="n">{formatTimes(attribute.lift)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="more">{t({
            en: 'Shown are values held by at least 60% of the cases and at least 3 times as common as among all loans.',
            uz: 'Holatlarning kamida 60 foizida uchraydigan va barcha kreditlarga nisbatan kamida 3 baravar koʻp boʻlgan qiymatlar koʻrsatilgan.',
            ru: 'Показаны значения, которые есть не менее чем у 60% случаев и встречаются минимум в 3 раза чаще, чем среди всех кредитов.',
          })}</p>
        </div>
      )}
    </div>
  )
}

function Refunds({ scan, own }: { scan: ScanResult; own: string | null }) {
  const { t } = useLang()
  const [all, setAll] = useState(false)
  const early = scan.finding_type === 'EARLY_DEBIT'
  const rows = all ? scan.items : scan.items.slice(0, FIRST_ROWS)
  return (
    <div className="panel">
      <div className="panel__bar">
        <b>{early ? t({ en: 'Affected loans', uz: 'Zarar koʻrgan kreditlar', ru: 'Пострадавшие кредиты' }) : t({ en: 'Refund list', uz: 'Qaytarish roʻyxati', ru: 'Список возвратов' })}</b>
        <span>{t({ en: `${formatNumber(scan.items.length)} rows. One row is one mistake; a customer can have more than one.`, uz: `${formatNumber(scan.items.length)} qator. Bir qator bitta xato; bir mijozda bir nechta boʻlishi mumkin.`, ru: `Строк: ${formatNumber(scan.items.length)}. Одна строка — одна ошибка; у клиента их может быть несколько.` })}</span>
      </div>
      <div className="sheet scroll">
        <table className="tbl">
          <thead><tr>
            <th>{t({ en: 'Customer', uz: 'Mijoz', ru: 'Клиент' })}</th>
            <th className="hide-s">{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })}</th>
            <th className="hide-s">{t({ en: 'Payment', uz: 'Toʻlov', ru: 'Платёж' })}</th>
            <th className="n">{early ? t({ en: 'Taken early, soʻm', uz: 'Oldin yechilgan, soʻm', ru: 'Раньше срока, сум' }) : t({ en: 'To return, soʻm', uz: 'Qaytariladi, soʻm', ru: 'К возврату, сум' })}</th>
            {early && <th className="n hide-s">{t({ en: 'Days early', uz: 'Necha kun oldin', ru: 'Дней раньше' })}</th>}
            <th>{t({ en: 'Complained', uz: 'Shikoyat', ru: 'Жалоба' })}</th>
          </tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={`${item.contract_id}-${item.installment_n ?? 'fee'}`} className={item.contract_id === own ? 'you' : ''}>
                <td>{item.customer_name}<span className="c under">{item.region}</span></td>
                <td className="id c hide-s">{item.contract_id}</td>
                <td className="c hide-s nw">{item.installment_n === null ? t({ en: 'one-time fee', uz: 'bir martalik komissiya', ru: 'разовая комиссия' }) : t({ en: `No. ${item.installment_n}`, uz: `${item.installment_n}-toʻlov`, ru: `№ ${item.installment_n}` })}</td>
                <td className="n"><Num n={early ? item.amount_affected : item.amount_excess} /></td>
                {early && <td className="n hide-s">{item.days_early ?? ''}</td>}
                <td className="nw">
                  {item.complained && item.complaint_id
                    ? <Link className="link" to={`/app/case/${encodeURIComponent(item.complaint_id)}`}>{item.complaint_id}</Link>
                    : <span className="c">{t({ en: 'never', uz: 'yoʻq', ru: 'нет' })}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!early && <div className="sum"><span>{t({ en: 'Total to return', uz: 'Jami qaytariladi', ru: 'Итого к возврату' })}</span><span className="wrong"><Som n={scan.total_excess} /></span></div>}
        <p className="more">
          {t({ en: `${formatNumber(rows.length)} shown of ${formatNumber(scan.items.length)}.`, uz: `${formatNumber(scan.items.length)} tadan ${formatNumber(rows.length)} tasi koʻrsatildi.`, ru: `Показано ${formatNumber(rows.length)} из ${formatNumber(scan.items.length)}.` })}
          {!all && scan.items.length > FIRST_ROWS && <button type="button" className="link" onClick={() => setAll(true)}>{t({ en: `Show all ${formatNumber(scan.items.length)} rows`, uz: `Barcha ${formatNumber(scan.items.length)} qatorni koʻrsatish`, ru: `Показать все ${formatNumber(scan.items.length)}` })}</button>}
        </p>
      </div>
    </div>
  )
}

function Download({ scan }: { scan: ScanResult }) {
  const { t } = useLang()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  if (scan.total_excess <= 0) return null

  async function download() {
    setBusy(true)
    setProblem(null)
    try {
      const file = await api.refundsCsv(scan.finding_type as DefectType)
      const address = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = address
      link.download = `refunds-${scan.finding_type.toLowerCase()}.csv`
      link.click()
      URL.revokeObjectURL(address)
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="btn btn--quiet" disabled={busy} onClick={download}>{t({ en: 'Download the refund list', uz: 'Qaytarish roʻyxatini yuklab olish', ru: 'Скачать список возвратов' })}</button>
      {problem && <Problem error={problem} onRetry={download} />}
    </>
  )
}
