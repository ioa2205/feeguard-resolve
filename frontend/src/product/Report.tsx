// The fix plan and the quarterly report (V2_PLAN W1.6): what to fix, who owns it and by when, and
// the quarter's complaints counted. Deadlines and names are set by a person, never by FeeGuard.
// On paper it is a plain table; on screen each measure is a sheet with its fields.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { CUSTOMER, LOAN, countOf, formatDate, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { ActionPlanRow, ActionPlanUpdate, ClaimType, ComplaintChannel, CountRow, QuarterlyReport, Verdict } from '../types'
import { CLAIM, MISTAKE, MISTAKE_LONG, RECEIVED_BY, VERDICT, verified } from '../words'
import { Empty, Figures, Head, Loading, Problem, Som } from './ui'

const NOT_CHECKED: Words = { en: 'Not checked yet', uz: 'Hali tekshirilmagan', ru: 'Ещё не проверена' }
const COLUMNS: Words[] = [
  { en: 'No.', uz: '№', ru: '№' },
  { en: 'Deficiency found', uz: 'Aniqlangan kamchilik', ru: 'Выявленный недостаток' },
  { en: 'Measures', uz: 'Chora-tadbirlar', ru: 'Меры' },
  { en: 'Deadline', uz: 'Muddat', ru: 'Срок' },
  { en: 'Responsible unit', uz: 'Masʼul boʻlinma', ru: 'Ответственное подразделение' },
  { en: 'Responsible person', uz: 'Masʼul shaxs', ru: 'Ответственное лицо' },
  { en: 'Monitoring deadline', uz: 'Nazorat muddati', ru: 'Срок контроля' },
  { en: 'Status', uz: 'Holat', ru: 'Статус' },
]

type Fields = Pick<ActionPlanRow, 'deficiency' | 'measures' | 'deadline' | 'responsible_unit' | 'responsible_exec' | 'monitoring_deadline' | 'status'>

/** What a person can change in a measure. A draft FeeGuard wrote is shown in the screen's language. */
function editable(row: ActionPlanRow, say: (text: string, words?: Words | null) => string): Fields {
  return {
    deficiency: say(row.deficiency, row.deficiency_t),
    measures: say(row.measures, row.measures_t),
    deadline: row.deadline,
    responsible_unit: say(row.responsible_unit, row.responsible_unit_t),
    responsible_exec: row.responsible_exec,
    monitoring_deadline: row.monitoring_deadline,
    status: row.status,
  }
}

function Measure({ number, row, onSaved }: { number: number; row: ActionPlanRow; onSaved: (row: ActionPlanRow) => void }) {
  const { t, say, ui } = useLang()
  const [draft, setDraft] = useState<Fields>(editable(row, say))
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(editable(row, say)), [row, ui])
  const changed = JSON.stringify(draft) !== JSON.stringify(editable(row, say))
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setDraft((current) => ({ ...current, [key]: value }))

  async function save(status = draft.status) {
    setSaving(true)
    setProblem(null)
    try {
      onSaved(await api.updateActionPlan(row.id, { ...draft, status } as ActionPlanUpdate))
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setSaving(false)
    }
  }
  const approved = row.status === 'APPROVED'

  return (
    <div className="sheet pad">
      <div className="row-acts" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 className="h3">{number}. {t(MISTAKE_LONG[row.finding_type])}</h3>
        <span className={`state ${approved ? '' : 'state--new'}`}>{approved ? t({ en: 'Approved by a person', uz: 'Inson tasdiqlagan', ru: 'Утверждено человеком' }) : t({ en: 'Draft', uz: 'Qoralama', ru: 'Черновик' })}</span>
      </div>
      <div className="grid2">
        <label className="field"><span>{t(COLUMNS[1])}</span><textarea className="input" rows={5} maxLength={2000} value={draft.deficiency} onChange={(event) => set('deficiency', event.target.value)} /></label>
        <label className="field"><span>{t(COLUMNS[2])}</span><textarea className="input" rows={5} maxLength={2000} value={draft.measures} onChange={(event) => set('measures', event.target.value)} /></label>
      </div>
      <div className="fields-row" style={{ marginTop: 14 }}>
        <label className="field" style={{ flex: '1 1 160px' }}><span>{t(COLUMNS[3])}</span><input className="input" type="date" value={draft.deadline ?? ''} onChange={(event) => set('deadline', event.target.value || null)} /></label>
        <label className="field" style={{ flex: '2 1 200px' }}><span>{t(COLUMNS[4])}</span><input className="input" maxLength={200} value={draft.responsible_unit} onChange={(event) => set('responsible_unit', event.target.value)} /></label>
        <label className="field" style={{ flex: '2 1 200px' }}><span>{t(COLUMNS[5])}</span><input className="input" maxLength={200} value={draft.responsible_exec} onChange={(event) => set('responsible_exec', event.target.value)} /></label>
        <label className="field" style={{ flex: '1 1 160px' }}><span>{t(COLUMNS[6])}</span><input className="input" type="date" value={draft.monitoring_deadline ?? ''} onChange={(event) => set('monitoring_deadline', event.target.value || null)} /></label>
      </div>
      <div className="row-acts" style={{ marginTop: 16 }}>
        {!approved && <button type="button" className="btn btn--act" disabled={saving} onClick={() => save('APPROVED')}>{t({ en: 'Approve this measure', uz: 'Bu chorani tasdiqlash', ru: 'Утвердить эту меру' })}</button>}
        {changed && <button type="button" className="btn" disabled={saving} onClick={() => save()}>{saving ? t({ en: 'Saving…', uz: 'Saqlanmoqda…', ru: 'Сохранение…' }) : t({ en: 'Save the changes', uz: 'Oʻzgarishlarni saqlash', ru: 'Сохранить изменения' })}</button>}
        {approved && <button type="button" className="btn btn--quiet" disabled={saving} onClick={() => save('DRAFT')}>{t({ en: 'Back to draft', uz: 'Qoralamaga qaytarish', ru: 'Вернуть в черновик' })}</button>}
      </div>
      {problem && <div style={{ marginTop: 12 }}><Problem error={problem} /></div>}
    </div>
  )
}

function Plan() {
  const { t, say } = useLang()
  const { state, reload, replace } = useLoad(() => api.actionPlan(), [])
  if (state.status === 'loading') return <Loading lines={4} words={t({ en: 'Drafting the plan from the approved mistakes…', uz: 'Tasdiqlangan xatolar asosida reja tayyorlanmoqda…', ru: 'Составляем план по утверждённым ошибкам…' })} />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const plan = state.data
  const dash = (value: string | null) => (value ? formatDate(value) : '—')

  return (
    <>
      <p className="note" style={{ marginBottom: 16 }}>
        {t({
          en: 'A measure is drafted when a person approves a mistake on a complaint or an incident; its numbers come from the search over the whole bank. Deadlines and the responsible person are left for a person to fill in.',
          uz: 'Chora inson shikoyat yoki hodisadagi xatoni tasdiqlaganda tayyorlanadi; raqamlari butun bank boʻyicha qidiruvdan olinadi. Muddatlar va masʼul shaxsni inson toʻldiradi.',
          ru: 'Мера появляется, когда человек утверждает ошибку по жалобе или инциденту; её числа берутся из поиска по всему банку. Сроки и ответственного заполняет человек.',
        })}{' '}
        {t({ en: 'The list of columns follows Annex 5 of Rule 3030-12:', uz: 'Ustunlar roʻyxati 3030-12-sonli qoidaning 5-ilovasiga asoslangan:', ru: 'Список столбцов взят из Приложения 5 к Правилу 3030-12:' })} <b style={{ color: 'var(--black)' }}>{t(verified(plan.format_basis)).toLowerCase()}</b>.
      </p>
      {plan.items.length === 0 ? (
        <Empty>
          <p>{t({ en: 'No measure yet. One is drafted when a person approves a mistake.', uz: 'Hali chora yoʻq. Inson xatoni tasdiqlaganda chora tayyorlanadi.', ru: 'Мер пока нет. Мера появляется, когда человек утверждает ошибку.' })}</p>
          <div className="row-acts no-print"><Link className="btn" to="/app">{t({ en: 'Open the complaints', uz: 'Shikoyatlarni ochish', ru: 'Открыть жалобы' })} <span className="arrow">→</span></Link></div>
        </Empty>
      ) : (
        <>
          <div className="panel panel--pad no-print" style={{ display: 'grid', gap: 4 }}>
            {plan.items.map((row, index) => (
              <Measure key={row.id} number={index + 1} row={row}
                onSaved={(saved) => replace({ ...plan, items: plan.items.map((item) => (item.id === saved.id ? saved : item)) })} />
            ))}
          </div>
          <table className="tbl print-only">
            <thead><tr>{COLUMNS.map((column) => <th key={column.en}>{t(column)}</th>)}</tr></thead>
            <tbody>
              {plan.items.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td><b>{t(MISTAKE[row.finding_type])}.</b> {say(row.deficiency, row.deficiency_t)}</td>
                  <td>{say(row.measures, row.measures_t)}</td>
                  <td>{dash(row.deadline)}</td>
                  <td>{say(row.responsible_unit, row.responsible_unit_t) || '—'}</td>
                  <td>{row.responsible_exec || '—'}</td>
                  <td>{dash(row.monitoring_deadline)}</td>
                  <td>{row.status === 'APPROVED' ? t({ en: 'Approved by a person', uz: 'Inson tasdiqlagan', ru: 'Утверждено человеком' }) : t({ en: 'Draft', uz: 'Qoralama', ru: 'Черновик' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  )
}

function Counts({ title, rows, word }: { title: string; rows: CountRow[]; word: (key: string) => string }) {
  const { t } = useLang()
  return (
    <div className="panel">
      <div className="panel__bar"><b>{title}</b></div>
      <div className="sheet">
        {rows.length === 0 ? <p className="pad muted">{t({ en: 'None.', uz: 'Yoʻq.', ru: 'Нет.' })}</p> : (
          <table className="tbl"><tbody>
            {rows.map((row) => <tr key={row.key}><td>{word(row.key)}</td><td className="n">{formatNumber(row.count)}</td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  )
}

function Quarterly() {
  const { t, say, ui } = useLang()
  const { state, reload } = useLoad(() => api.quarterly(), [])
  if (state.status === 'loading') return <Loading lines={5} words={t({ en: 'Counting the quarter’s complaints…', uz: 'Chorak shikoyatlari sanalmoqda…', ru: 'Считаем жалобы за квартал…' })} />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />
  const report: QuarterlyReport = state.data
  const [year, quarter] = report.quarter.split('-Q')
  const name = ui === 'uz' ? `${year}-yil ${quarter}-chorak` : ui === 'ru' ? `${quarter}-й квартал ${year} года` : `Quarter ${quarter} of ${year}`
  const approved = report.measures.filter((row) => row.status === 'APPROVED').length
  const word = (map: Record<string, Words>) => (key: string) => (map[key] ? t(map[key]) : key)

  return (
    <>
      <p className="sub" style={{ marginTop: 0, marginBottom: 20 }}>
        {name}, {formatDate(report.date_from)} – {formatDate(report.date_to)}: <b style={{ color: 'var(--black)' }}>{formatNumber(report.complaints_total)}</b> {t({ en: 'complaints about loan payments were received.', uz: 'ta kredit toʻlovlari boʻyicha shikoyat qabul qilingan.', ru: 'жалоб по платежам по кредитам получено.' })}
      </p>
      <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <Counts title={t({ en: 'By kind, as read', uz: 'Turi boʻyicha, oʻqilganidek', ru: 'По виду, как прочитано' })} rows={report.by_type} word={word(CLAIM as Record<ClaimType, Words>)} />
        <Counts title={t({ en: 'By verdict', uz: 'Xulosa boʻyicha', ru: 'По выводу' })} rows={report.by_verdict} word={word({ ...(VERDICT as Record<Verdict, Words>), NOT_CHECKED })} />
        <Counts title={t({ en: 'By region', uz: 'Hudud boʻyicha', ru: 'По региону' })} rows={report.by_region} word={(key) => key} />
        <Counts title={t({ en: 'By channel', uz: 'Kanal boʻyicha', ru: 'По каналу' })} rows={report.by_channel} word={word(RECEIVED_BY as Record<ComplaintChannel, Words>)} />
      </div>
      <p className="note" style={{ marginTop: 12 }}>{t({
        en: 'A complaint nobody has checked yet is counted by how simple rules read its text. The form of this analysis is still to verify against the Central Bank’s text.',
        uz: 'Hali hech kim tekshirmagan shikoyat oddiy qoidalar uning matnini qanday oʻqiganiga qarab sanaladi. Bu tahlil shakli Markaziy bank matni bilan hali solishtirilishi kerak.',
        ru: 'Жалоба, которую ещё никто не проверил, учитывается так, как её текст прочитали простые правила. Форму этого анализа ещё нужно сверить с текстом Центрального банка.',
      })}</p>

      <div className="section">
        <h3 className="h2" style={{ marginBottom: 14 }}>{t({ en: 'Recurring issues: mistakes that hit more than one customer', uz: 'Takrorlanuvchi muammolar: bir nechta mijozga tekkan xatolar', ru: 'Повторяющиеся проблемы: ошибки, задевшие больше одного клиента' })}</h3>
        {report.recurring.length === 0 ? <Empty><p>{t({ en: 'None found in the whole bank.', uz: 'Butun bank boʻyicha topilmadi.', ru: 'Во всём банке не найдено.' })}</p></Empty> : (
          <div className="panel panel--pad" style={{ display: 'grid', gap: 4 }}>
            {report.recurring.map((issue) => (
              <div key={issue.finding_type} className="sheet pad">
                <div className="row-acts" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <h4 className="h3">{t(MISTAKE_LONG[issue.finding_type])}</h4>
                  <span>{countOf(issue.affected_customers, CUSTOMER)}, {countOf(issue.affected_contracts, LOAN)} · {issue.finding_type === 'EARLY_DEBIT'
                    ? <><Som n={issue.total_affected} /> {t({ en: 'taken early', uz: 'muddatidan oldin yechilgan', ru: 'списано раньше срока' })}</>
                    : <><Som n={issue.total_excess} className="wrong" /> {t({ en: 'to return', uz: 'qaytariladi', ru: 'к возврату' })}</>}</span>
                </div>
                {issue.cause_sentence && <p className="muted" style={{ marginTop: 6 }}><Figures text={say(issue.cause_sentence, issue.cause_sentence_t)} /></p>}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        {report.measures.length === 0
          ? t({ en: 'No measure yet: the plan above has none.', uz: 'Hali chora yoʻq: yuqoridagi rejada chora yoʻq.', ru: 'Мер пока нет: в плане выше их нет.' })
          : t({ en: `Measures in the plan above: ${report.measures.length}, of them approved by a person: ${approved}.`, uz: `Yuqoridagi rejadagi choralar: ${report.measures.length}, shundan inson tasdiqlagani: ${approved}.`, ru: `Мер в плане выше: ${report.measures.length}, из них утверждено человеком: ${approved}.` })}
      </p>
    </>
  )
}

export default function Report() {
  const { t } = useLang()
  const { worldId } = useSession()
  return (
    <div className="wrap" key={worldId}>
      <Head
        title={t({ en: 'Fix plan and report', uz: 'Tuzatish rejasi va hisobot', ru: 'План исправления и отчёт' })}
        sentence={t({
          en: 'What to fix, who owns it and by when; then the quarter’s complaints, counted. Both are ready to print.',
          uz: 'Nimani tuzatish, kim masʼul va qachongacha; soʻng chorak shikoyatlari sanogʻi. Ikkalasi ham chop etishga tayyor.',
          ru: 'Что исправить, кто отвечает и к какому сроку; затем жалобы за квартал в цифрах. Оба документа готовы к печати.',
        })}
      >
        <button type="button" className="btn no-print" onClick={() => window.print()}>{t({ en: 'Print or save as PDF', uz: 'Chop etish yoki PDF saqlash', ru: 'Печать или сохранить PDF' })}</button>
      </Head>
      <h2 className="h1" style={{ marginBottom: 12 }}>{t({ en: 'Plan of measures', uz: 'Chora-tadbirlar rejasi', ru: 'План мер' })}</h2>
      <Plan />
      <div className="section">
        <h2 className="h1" style={{ marginBottom: 12 }}>{t({ en: 'Quarterly analysis of complaints', uz: 'Shikoyatlarning choraklik tahlili', ru: 'Квартальный анализ жалоб' })}</h2>
        <Quarterly />
      </div>
    </div>
  )
}
