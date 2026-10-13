// The audit log (V2_PLAN W1.6): every action, who, when, and whether the chain is intact. Each
// entry carries the code of the one before it, so a changed entry shows.

import { useState } from 'react'

import { api } from '../api'
import { ENTRY, countOf, formatDateTime, formatNumber, formatSom } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { AuditEntry, DefectType, Verdict } from '../types'
import { ACTING_AS, MISTAKE, VERDICT } from '../words'
import { Empty, Head, Loading, Problem } from './ui'

const PAGE = 100

const WHAT: Record<string, Words> = {
  COMPLAINT_RECEIVED: { en: 'Complaint received', uz: 'Shikoyat qabul qilindi', ru: 'Жалоба получена' },
  COMPLAINT_CHECKED: { en: 'Complaint checked', uz: 'Shikoyat tekshirildi', ru: 'Жалоба проверена' },
  VERDICT_CONFIRMED: { en: 'Reply approved', uz: 'Javob tasdiqlandi', ru: 'Ответ одобрен' },
  VERDICT_DISMISSED: { en: 'Verdict rejected', uz: 'Xulosa rad etildi', ru: 'Вывод отклонён' },
  VERDICT_CORRECTED: { en: 'Verdict corrected', uz: 'Xulosa tuzatildi', ru: 'Вывод исправлен' },
  OTHERS_SEARCHED: { en: 'Others searched', uz: 'Boshqalar qidirildi', ru: 'Поиск других' },
  REFUND_LIST_DOWNLOADED: { en: 'Refund list downloaded', uz: 'Qaytarish roʻyxati yuklab olindi', ru: 'Список возвратов скачан' },
  PLAN_ROW_SAVED: { en: 'Fix plan row saved', uz: 'Tuzatish rejasi qatori saqlandi', ru: 'Строка плана сохранена' },
  LETTER_REWORDING_ASKED: { en: 'Reply rewording asked', uz: 'Javobni qayta yozish soʻraldi', ru: 'Запрошена переформулировка ответа' },
  DEMO_BANK_BUILT: { en: 'Demo bank built', uz: 'Demo bank yaratildi', ru: 'Демо-банк создан' },
  DEBIT_ADDED_BY_HAND: { en: 'Debit added by hand', uz: 'Yechim qoʻlda qoʻshildi', ru: 'Списание добавлено вручную' },
  ANSWER_KEY_SHOWN: { en: 'Answer key shown', uz: 'Javoblar kaliti koʻrsatildi', ru: 'Ключ ответов показан' },
  REFUND_PROPOSED: { en: 'Refund proposed', uz: 'Qaytarish taklif qilindi', ru: 'Возврат предложен' },
  REFUND_APPROVED: { en: 'Refund approved', uz: 'Qaytarish tasdiqlandi', ru: 'Возврат утверждён' },
  CUSTOMERS_NOTIFIED: { en: 'Customers told', uz: 'Mijozlarga xabar berildi', ru: 'Клиенты уведомлены' },
  CHECK_RUN_BY_HAND: { en: 'Loans checked again, by hand', uz: 'Kreditlar qoʻlda qayta tekshirildi', ru: 'Кредиты перепроверены вручную' },
}

const text = (value: unknown) => String(value ?? '')

export default function Audit() {
  const { t } = useLang()
  const { worldId } = useSession()
  const { state, reload } = useLoad(() => api.audit(PAGE, 0), [worldId])
  const [more, setMore] = useState<AuditEntry[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const [checked, setChecked] = useState(false)

  const money = (value: unknown) => (typeof value === 'number' ? formatSom(value) : text(value))
  const verdict = (value: unknown) => (VERDICT[value as Verdict] ? t(VERDICT[value as Verdict]).toLowerCase() : text(value))
  const mistake = (value: unknown) => (MISTAKE[value as DefectType] ? t(MISTAKE[value as DefectType]) : text(value))

  /** The entry's facts in a short sentence. An action the screen does not know shows its fields. */
  function details(entry: AuditEntry): string {
    const p = entry.payload
    switch (entry.action) {
      case 'COMPLAINT_RECEIVED':
        return t({ en: `${text(p.complaint_id)}, from customer ${text(p.customer_id)}`, uz: `${text(p.complaint_id)}, mijoz ${text(p.customer_id)}`, ru: `${text(p.complaint_id)}, от клиента ${text(p.customer_id)}` })
      case 'COMPLAINT_CHECKED':
        return t({ en: `${text(p.complaint_id)}: ${verdict(p.verdict)}, to return ${money(p.to_return)}`, uz: `${text(p.complaint_id)}: ${verdict(p.verdict)}, qaytariladi ${money(p.to_return)}`, ru: `${text(p.complaint_id)}: ${verdict(p.verdict)}, к возврату ${money(p.to_return)}` })
      case 'VERDICT_CONFIRMED':
      case 'VERDICT_DISMISSED':
      case 'VERDICT_CORRECTED':
        return `${text(p.case_id)}: ${verdict(p.verdict)}${p.corrected_verdict ? ` → ${verdict(p.corrected_verdict)}` : ''}${p.note ? `. ${t({ en: 'Note', uz: 'Izoh', ru: 'Заметка' })}: ${text(p.note)}` : ''}`
      case 'OTHERS_SEARCHED':
        return t({
          en: `${mistake(p.finding_type)}: ${text(p.customers)} customers, ${text(p.never_complained)} never complained, to return ${money(p.to_return)}`,
          uz: `${mistake(p.finding_type)}: ${text(p.customers)} mijoz, ${text(p.never_complained)} tasi shikoyat qilmagan, qaytariladi ${money(p.to_return)}`,
          ru: `${mistake(p.finding_type)}: клиентов ${text(p.customers)}, не жаловались ${text(p.never_complained)}, к возврату ${money(p.to_return)}`,
        })
      case 'REFUND_LIST_DOWNLOADED':
        return `${mistake(p.finding_type)}, ${money(p.to_return)}`
      case 'PLAN_ROW_SAVED':
        return `${text(p.plan_id)}, ${p.status === 'APPROVED' ? t({ en: 'approved', uz: 'tasdiqlandi', ru: 'утверждена' }) : t({ en: 'draft', uz: 'qoralama', ru: 'черновик' })}`
      case 'LETTER_REWORDING_ASKED':
        return `${text(p.case_id)}: ${p.kept === 'llm' ? t({ en: 'the reworded reply is used', uz: 'qayta yozilgan javob ishlatiladi', ru: 'используется переформулированный ответ' }) : t({ en: 'the standard letter stays', uz: 'standart xat qoladi', ru: 'остаётся стандартное письмо' })}`
      case 'DEMO_BANK_BUILT':
        return t({ en: `${text(p.size)} loans`, uz: `${text(p.size)} ta kredit`, ru: `кредитов: ${text(p.size)}` })
      case 'DEBIT_ADDED_BY_HAND':
        return t({ en: `${money(p.amount)} on loan ${text(p.contract_id)}`, uz: `${money(p.amount)}, kredit ${text(p.contract_id)}`, ru: `${money(p.amount)} по кредиту ${text(p.contract_id)}` })
      case 'ANSWER_KEY_SHOWN':
        return t({ en: `${text(p.rows)} rows`, uz: `${text(p.rows)} qator`, ru: `строк: ${text(p.rows)}` })
      case 'REFUND_PROPOSED':
      case 'REFUND_APPROVED':
        return t({ en: `${text(p.incident_id)}: ${text(p.customers)} customers, ${money(p.to_return)}`, uz: `${text(p.incident_id)}: ${text(p.customers)} mijoz, ${money(p.to_return)}`, ru: `${text(p.incident_id)}: клиентов ${text(p.customers)}, ${money(p.to_return)}` })
      case 'CUSTOMERS_NOTIFIED':
        return t({ en: `${text(p.incident_id)}: ${text(p.messages)} messages`, uz: `${text(p.incident_id)}: ${text(p.messages)} ta xabar`, ru: `${text(p.incident_id)}: сообщений ${text(p.messages)}` })
      case 'CHECK_RUN_BY_HAND':
        return t({ en: `${text(p.loans_read)} loans read, ${text(p.new_findings)} new findings`, uz: `${text(p.loans_read)} ta kredit oʻqildi, ${text(p.new_findings)} ta yangi topilma`, ru: `прочитано кредитов: ${text(p.loans_read)}, новых находок: ${text(p.new_findings)}` })
      default:
        // An action this screen does not know yet: its own facts, as sent.
        return Object.entries(p).map(([key, value]) => `${key}: ${text(value)}`).join(', ')
    }
  }

  async function showMore(shown: number) {
    setLoadingMore(true)
    setProblem(null)
    try {
      const next = await api.audit(PAGE, shown)
      setMore((entries) => [...entries, ...next.entries])
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="wrap">
      <Head
        title={t({ en: 'Audit log', uz: 'Audit jurnali', ru: 'Журнал аудита' })}
        sentence={t({
          en: 'Every action in FeeGuard, in order. Each entry carries the code of the one before it, so a changed entry breaks the chain.',
          uz: 'FeeGuarddagi har bir harakat, tartib bilan. Har bir yozuv oʻzidan oldingisining kodini saqlaydi, shuning uchun oʻzgartirilgan yozuv zanjirni uzadi.',
          ru: 'Каждое действие в FeeGuard, по порядку. Каждая запись хранит код предыдущей, поэтому изменённая запись разрывает цепочку.',
        })}
      />
      {state.status === 'loading' && <Loading lines={6} />}
      {state.status === 'error' && <Problem error={state.error} onRetry={reload} />}
      {state.status === 'ready' && (() => {
        const log = state.data
        const entries = [...log.entries, ...more]
        return (
          <div className="panel panel--pad enter">
            <div className="sheet" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px 16px', padding: '16px 16px 16px 22px' }}>
              <span role="status">
                <span className="ok-line">{log.chain_intact
                  ? t({ en: 'Chain intact', uz: 'Zanjir butun', ru: 'Цепочка цела' })
                  : `${t({ en: 'Chain broken at entry', uz: 'Zanjir shu yozuvda uzilgan:', ru: 'Цепочка разорвана на записи' })} ${log.broken_at}`}</span>{' '}
                <span className="muted">· {countOf(log.total, ENTRY)}{checked && `, ${t({ en: 'checked again just now', uz: 'hozirgina qayta tekshirildi', ru: 'только что проверено заново' })}`}</span>
              </span>
              <button type="button" className="btn btn--small" onClick={() => { setMore([]); setChecked(true); reload() }}>{t({ en: 'Check the chain again', uz: 'Zanjirni qayta tekshirish', ru: 'Проверить цепочку ещё раз' })}</button>
            </div>
            <p className="note" style={{ padding: '12px 16px' }}>
              {t({
                en: 'The code is a SHA-256 fingerprint of the entry and of the code before it. Changing or removing one entry breaks every code after it. The chain shows a change; it does not prevent one.',
                uz: 'Kod — yozuvning va oʻzidan oldingi kodning SHA-256 izi. Bitta yozuvni oʻzgartirish yoki oʻchirish undan keyingi barcha kodlarni buzadi. Zanjir oʻzgarishni koʻrsatadi, lekin uning oldini olmaydi.',
                ru: 'Код — это отпечаток SHA-256 самой записи и предыдущего кода. Изменение или удаление одной записи ломает все коды после неё. Цепочка показывает изменение, но не предотвращает его.',
              })}
              {!log.chain_intact && ` ${t({ en: 'The entries from the broken one on can no longer be trusted.', uz: 'Uzilgan yozuvdan keyingilariga endi ishonib boʻlmaydi.', ru: 'Записям начиная с разорванной больше нельзя доверять.' })}`}
            </p>
            {entries.length === 0 ? (
              <div className="sheet pad"><Empty><p>{t({ en: 'Nothing has been done in this demo bank yet. Check a complaint, and it appears here.', uz: 'Bu demo bankda hali hech narsa qilinmagan. Shikoyatni tekshiring, u shu yerda paydo boʻladi.', ru: 'В этом демо-банке ещё ничего не делали. Проверьте жалобу — она появится здесь.' })}</p></Empty></div>
            ) : (
              <div className="sheet scroll">
                <table className="tbl">
                  <thead><tr>
                    <th className="hide-s">{t({ en: 'Time', uz: 'Vaqt', ru: 'Время' })}</th>
                    <th>{t({ en: 'Entry', uz: 'Yozuv', ru: 'Запись' })}</th>
                    <th>{t({ en: 'What', uz: 'Nima', ru: 'Что' })}</th>
                    <th className="hide-s">{t({ en: 'Who', uz: 'Kim', ru: 'Кто' })}</th>
                    <th className="hide-s">{t({ en: 'Code before → this code', uz: 'Oldingi kod → bu kod', ru: 'Код до → этот код' })}</th>
                  </tr></thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className={log.broken_at === entry.id ? 'you' : ''}>
                        <td className="nw c hide-s">{formatDateTime(entry.at)}</td>
                        <td className="id">{entry.id}</td>
                        <td><b style={{ fontWeight: 600 }}>{WHAT[entry.action] ? t(WHAT[entry.action]) : entry.action}</b>{details(entry) && <span className="c"> · {details(entry)}</span>}
                          {log.broken_at === entry.id && <> · <b>{t({ en: 'broken here', uz: 'shu yerda uzilgan', ru: 'разрыв здесь' })}</b></>}
                          <span className="c under show-s">{formatDateTime(entry.at)} · {t(ACTING_AS[entry.actor])}</span></td>
                        <td className="c nw hide-s">{t(ACTING_AS[entry.actor])}</td>
                        <td className="id c hide-s" title={entry.hash}>{entry.prev_hash.slice(0, 8)} → {entry.hash.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="more">
                  {t({ en: `${formatNumber(entries.length)} shown of ${formatNumber(log.total)}, the newest first.`, uz: `${formatNumber(log.total)} tadan ${formatNumber(entries.length)} tasi koʻrsatildi, eng yangisi birinchi.`, ru: `Показано ${formatNumber(entries.length)} из ${formatNumber(log.total)}, сначала новые.` })}
                  {entries.length < log.total && <button type="button" className="link" disabled={loadingMore} onClick={() => showMore(entries.length)}>{loadingMore ? t({ en: 'Loading…', uz: 'Yuklanmoqda…', ru: 'Загрузка…' }) : t({ en: `Show ${Math.min(PAGE, log.total - entries.length)} older entries`, uz: `Yana ${Math.min(PAGE, log.total - entries.length)} ta eski yozuv`, ru: `Показать ещё ${Math.min(PAGE, log.total - entries.length)} более старых` })}</button>}
                </p>
              </div>
            )}
            {problem && <div style={{ padding: 6 }}><Problem error={problem} onRetry={() => showMore(entries.length)} /></div>}
          </div>
        )
      })()}
    </div>
  )
}
