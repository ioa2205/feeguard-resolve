// Results (V2_PLAN W1.6): what FeeGuard found in the open demo bank, next to what was hidden in
// it. Every number comes from the engine's findings beside the answer key; nothing is typed here.
// The bank is invented, and the page says so next to the numbers.

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { api } from '../api'
import { formatDate, formatNumber, formatSeconds } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { DefectType, Reveal, Scoreboard, ScoreRow } from '../types'
import { MISTAKE, READ_BY } from '../words'
import { useBankName } from './Frame'
import { Head, Loading, Num, Problem } from './ui'

// The hidden causes, in plain words. An unknown one is shown as sent, with spaces.
const CAUSE: Record<string, Words> = {
  batch_retry_second_card: { en: 'The billing run retried on a second card', uz: 'Hisob-kitob jarayoni ikkinchi kartadan qayta urindi', ru: 'Прогон списаний повторил попытку со второй карты' },
  old_schedule_after_change: { en: 'The old schedule was used after it changed', uz: 'Jadval oʻzgargach ham eskisi ishlatilgan', ru: 'После изменения графика использовался старый' },
  issuance_fee_after_tariff_update: { en: 'An issuance fee appeared after a tariff update', uz: 'Tarif yangilangach kredit berish komissiyasi paydo boʻlgan', ru: 'После обновления тарифа появилась комиссия за выдачу' },
  late_posting_paynet: { en: 'Payments through Paynet were recorded late', uz: 'Paynet orqali toʻlovlar kech yozilgan', ru: 'Платежи через Paynet зачислялись с опозданием' },
  added_by_hand: { en: 'Added by hand in Demo tools', uz: 'Demo vositalarida qoʻlda qoʻshilgan', ru: 'Добавлено вручную в демо-инструментах' },
}

function Board({ board }: { board: Scoreboard }) {
  const { t } = useLang()
  const bankName = useBankName()
  const sum = (pick: (row: ScoreRow) => number) => board.per_type.reduce((total, row) => total + pick(row), 0)
  const hidden = sum((row) => row.planted)
  const found = sum((row) => row.found)
  const falseAlarms = sum((row) => row.false_alarms)
  const traps = sum((row) => row.traps_planted)
  const flagged = sum((row) => row.traps_flagged)
  const { timings } = board

  return (
    <>
      <div className="headline enter">
        <div><b><Num n={found} /> <span className="muted" style={{ fontSize: '.5em', fontWeight: 500, letterSpacing: 0 }}>{t({ en: 'of', uz: '/', ru: 'из' })}</span> <Num n={hidden} /></b><span>{t({ en: 'hidden mistakes found', uz: 'yashirilgan xato topildi', ru: 'спрятанных ошибок найдено' })}</span></div>
        <div><b><Num n={falseAlarms} /></b><span>{t({ en: 'false alarms', uz: 'notoʻgʻri signal', ru: 'ложных срабатываний' })}</span></div>
        {traps > 0 && <div><b><Num n={traps - flagged} /> <span className="muted" style={{ fontSize: '.5em', fontWeight: 500, letterSpacing: 0 }}>{t({ en: 'of', uz: '/', ru: 'из' })}</span> <Num n={traps} /></b><span>{t({ en: 'look-alike cases cleared', uz: 'oʻxshash holat toʻgʻri rad etildi', ru: 'похожих случаев верно отклонено' })}</span></div>}
      </div>
      <p className="note" style={{ marginTop: 16 }}>
        {t({ en: 'Measured on an invented bank', uz: 'Oʻylab topilgan bankda oʻlchangan', ru: 'Измерено на вымышленном банке' })}: {bankName(board.world_id)}, {formatNumber(board.size)} {t({ en: 'loans', uz: 'ta kredit', ru: 'кредитов' })}. {t({ en: 'Scored in', uz: 'Hisoblash vaqti:', ru: 'Подсчитано за' })} {formatSeconds(board.elapsed_ms)}.
      </p>

      <div className="section">
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'By kind of mistake', uz: 'Xato turi boʻyicha', ru: 'По виду ошибки' })}</b></div>
          <div className="sheet scroll">
            <table className="tbl" style={{ minWidth: 760 }}>
              <thead><tr>
                <th>{t({ en: 'Mistake', uz: 'Xato', ru: 'Ошибка' })}</th>
                <th className="n">{t({ en: 'Hidden', uz: 'Yashirilgan', ru: 'Спрятано' })}</th>
                <th className="n">{t({ en: 'Found', uz: 'Topilgan', ru: 'Найдено' })}</th>
                <th className="n">{t({ en: 'Missed', uz: 'Oʻtkazib yuborilgan', ru: 'Пропущено' })}</th>
                <th className="n">{t({ en: 'False alarms', uz: 'Notoʻgʻri signal', ru: 'Ложные' })}</th>
                <th className="n">{t({ en: 'Hidden, soʻm', uz: 'Yashirilgan, soʻm', ru: 'Спрятано, сум' })}</th>
                <th className="n">{t({ en: 'Found, soʻm', uz: 'Topilgan, soʻm', ru: 'Найдено, сум' })}</th>
                <th className="n">{t({ en: 'Look-alikes called a mistake', uz: 'Xato deb topilgan oʻxshash holatlar', ru: 'Похожие, названные ошибкой' })}</th>
              </tr></thead>
              <tbody>
                {board.per_type.map((row) => (
                  <tr key={row.type}>
                    <td>{t(MISTAKE[row.type])}{row.type === 'EARLY_DEBIT' && <span className="c"> · {t({ en: 'soʻm taken early, not money to return', uz: 'muddatidan oldin yechilgan soʻm, qaytariladigan pul emas', ru: 'сумы, списанные раньше срока, а не к возврату' })}</span>}</td>
                    <td className="n"><Num n={row.planted} /></td>
                    <td className="n"><Num n={row.found} /></td>
                    <td className="n"><Num n={row.missed} /></td>
                    <td className="n"><Num n={row.false_alarms} /></td>
                    <td className="n"><Num n={row.amount_planted} /></td>
                    <td className="n"><Num n={row.amount_found} /></td>
                    <td className="n">{row.traps_planted ? `${row.traps_flagged} / ${row.traps_planted}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="more">{t({
              en: 'A finding counts as found when its mistake, loan and installment match a row of the answer key. A false alarm is a finding with no such row. A look-alike case is correct but looks like a mistake; it should never be called one.',
              uz: 'Topilma xato turi, kredit va toʻlov raqami javoblar kalitidagi qatorga mos kelsa, topilgan hisoblanadi. Bunday qatori yoʻq topilma — notoʻgʻri signal. Oʻxshash holat toʻgʻri, lekin xatoga oʻxshaydi; uni hech qachon xato deb atamaslik kerak.',
              ru: 'Находка считается найденной, если её ошибка, кредит и платёж совпадают со строкой ключа ответов. Ложное срабатывание — находка без такой строки. Похожий случай верен, но выглядит как ошибка; его нельзя называть ошибкой.',
            })}</p>
          </div>
        </div>
      </div>

      <div className="section grid2">
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'Does it understand real language?', uz: 'U haqiqiy tilni tushunadimi?', ru: 'Понимает ли он живой язык?' })}</b></div>
          <div className="sheet pad prose">
            {board.language_test.length === 0 ? (
              <p>{t({
                en: 'Not measured yet. This test needs complaints written by people by hand, in Uzbek (Latin and Cyrillic), Russian and a mix. Nobody may generate them.',
                uz: 'Hali oʻlchanmagan. Bu sinov uchun odamlar qoʻlda yozgan shikoyatlar kerak: oʻzbekcha (lotin va kirill), ruscha va aralash. Ularni hech kim generatsiya qilishi mumkin emas.',
                ru: 'Пока не измерено. Для этого теста нужны жалобы, написанные людьми вручную: на узбекском (латиница и кириллица), русском и вперемешку. Генерировать их нельзя.',
              })}</p>
            ) : board.language_test.map((score) => (
              <p key={score.mode}>{t(READ_BY[score.mode])}: {t({ en: `the kind of complaint was right for ${score.type_correct} of ${score.n}, the amount for ${score.amount_correct} of ${score.n}.`, uz: `shikoyat turi ${score.n} tadan ${score.type_correct} tasida, summa ${score.n} tadan ${score.amount_correct} tasida toʻgʻri.`, ru: `вид жалобы верен в ${score.type_correct} из ${score.n}, сумма — в ${score.amount_correct} из ${score.n}.` })}</p>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel__bar"><b>{t({ en: 'How fast, on this demo bank', uz: 'Bu demo bankda qanchalik tez', ru: 'Насколько быстро на этом демо-банке' })}</b></div>
          <div className="sheet">
            <table className="tbl"><tbody>
              <tr><td>{t({ en: 'Building the bank', uz: 'Bankni yaratish', ru: 'Создание банка' })}</td><td className="n">{timings.world_build_ms === null ? t({ en: 'not measured', uz: 'oʻlchanmagan', ru: 'не измерено' }) : formatSeconds(timings.world_build_ms)}</td></tr>
              <tr><td>{t({ en: 'Checking one complaint, middle value', uz: 'Bitta shikoyatni tekshirish, oʻrta qiymat', ru: 'Проверка одной жалобы, медиана' })}</td><td className="n">{timings.investigate_ms === null ? t({ en: 'none checked yet', uz: 'hali tekshirilmagan', ru: 'ещё не проверяли' }) : formatSeconds(timings.investigate_ms)}</td></tr>
              <tr><td>{t({ en: 'Finding others, middle value', uz: 'Boshqalarni topish, oʻrta qiymat', ru: 'Поиск других, медиана' })}</td><td className="n">{timings.scan_ms === null ? t({ en: 'not done yet', uz: 'hali qilinmagan', ru: 'ещё не делали' }) : formatSeconds(timings.scan_ms)}</td></tr>
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  )
}

function AnswerKey() {
  const { t } = useLang()
  const { worldId } = useSession()
  const { hash } = useLocation()
  const section = useRef<HTMLElement>(null)
  const [key, setKey] = useState<Reveal | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => {
    if (hash === '#answer-key') section.current?.scrollIntoView()
  }, [hash])

  async function show() {
    setBusy(true)
    setProblem(null)
    try {
      setKey(await api.reveal(worldId))
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }
  const rows = key ? (all ? key.items : key.items.slice(0, 30)) : []
  const defects = (key?.settings.defects ?? {}) as Record<string, number>
  const cause = (tag: string) => (CAUSE[tag] ? t(CAUSE[tag]) : tag.replace(/_/g, ' '))

  return (
    <section className="section" id="answer-key" ref={section}>
      <h2 className="h1">{t({ en: 'The answer key', uz: 'Javoblar kaliti', ru: 'Ключ ответов' })}</h2>
      <p className="sub" style={{ marginBottom: 20 }}>{t({
        en: 'Every mistake hidden in the open demo bank, and its hidden settings. FeeGuard never reads this. Opening it is written to the audit log.',
        uz: 'Ochiq demo bankka yashirilgan har bir xato va uning yashirin sozlamalari. FeeGuard buni hech qachon oʻqimaydi. Uni ochish audit jurnaliga yoziladi.',
        ru: 'Каждая ошибка, спрятанная в открытом демо-банке, и его скрытые настройки. FeeGuard этого никогда не читает. Открытие записывается в журнал аудита.',
      })}</p>
      {!key && <button type="button" className="btn" disabled={busy} onClick={show}>{busy ? t({ en: 'Opening…', uz: 'Ochilmoqda…', ru: 'Открываем…' }) : t({ en: 'Show the answer key', uz: 'Javoblar kalitini koʻrsatish', ru: 'Показать ключ ответов' })}</button>}
      {problem && <div style={{ marginTop: 14 }}><Problem error={problem} onRetry={show} /></div>}
      {key && (
        <div className="stack">
          <p className="note">
            {t({ en: 'Hidden', uz: 'Yashirilgan', ru: 'Спрятано' })}: {Object.entries(defects).map(([type, rate]) => `${MISTAKE[type as DefectType] ? t(MISTAKE[type as DefectType]) : type} ${Math.round(rate * 1000) / 10}%`).join(', ') || '—'}
            {key.settings.surprise ? ` (${t({ en: 'chosen by surprise', uz: 'kutilmagan tanlov', ru: 'выбрано сюрпризом' })})` : ''}.{' '}
            {t({ en: 'Complaints where the bank was right', uz: 'Bank haq boʻlgan shikoyatlar', ru: 'Жалоб, где банк был прав' })}: {String(key.settings.traps ?? '—')}. {t({ en: 'Wronged customers who complain', uz: 'Shikoyat qiladigan zarar koʻrgan mijozlar', ru: 'Пострадавших клиентов жалуется' })}: {Math.round(Number(key.settings.complaint_rate ?? 0) * 100)}%.
            {key.settings.as_of_date ? ` ${t({ en: 'The bank’s date', uz: 'Bank sanasi', ru: 'Дата банка' })}: ${formatDate(String(key.settings.as_of_date))}.` : ''}
          </p>
          <div className="grid2">
            <div className="panel">
              <div className="panel__bar"><b>{t({ en: 'What was hidden', uz: 'Nima yashirilgan', ru: 'Что спрятано' })}</b></div>
              <div className="sheet scroll">
                <table className="tbl">
                  <thead><tr><th>{t({ en: 'Mistake', uz: 'Xato', ru: 'Ошибка' })}</th><th>{t({ en: 'Kind', uz: 'Turi', ru: 'Вид' })}</th><th className="n">{t({ en: 'Rows', uz: 'Qatorlar', ru: 'Строк' })}</th><th className="n">{t({ en: 'soʻm', uz: 'soʻm', ru: 'сум' })}</th></tr></thead>
                  <tbody>
                    {key.counts.map((row) => (
                      <tr key={`${row.defect_type}-${row.is_trap}`}>
                        <td>{t(MISTAKE[row.defect_type])}</td>
                        <td className="c">{row.is_trap ? t({ en: 'look-alike: the bank was right', uz: 'oʻxshash holat: bank haq edi', ru: 'похожий случай: банк был прав' }) : t({ en: 'real mistake', uz: 'haqiqiy xato', ru: 'настоящая ошибка' })}</td>
                        <td className="n"><Num n={row.count} /></td>
                        <td className="n"><Num n={row.amount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel__bar"><b>{t({ en: 'Row by row', uz: 'Qatorma-qator', ru: 'Построчно' })}</b><span>{formatNumber(key.total)}</span></div>
            <div className="sheet scroll">
              <table className="tbl" style={{ minWidth: 720 }}>
                <thead><tr>
                  <th>{t({ en: 'Row', uz: 'Qator', ru: 'Строка' })}</th>
                  <th>{t({ en: 'Mistake', uz: 'Xato', ru: 'Ошибка' })}</th>
                  <th>{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })}</th>
                  <th>{t({ en: 'Payment', uz: 'Toʻlov', ru: 'Платёж' })}</th>
                  <th className="n">{t({ en: 'soʻm', uz: 'soʻm', ru: 'сум' })}</th>
                  <th>{t({ en: 'Hidden cause', uz: 'Yashirin sabab', ru: 'Скрытая причина' })}</th>
                </tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="id c">{row.id}</td>
                      <td>{t(MISTAKE[row.defect_type])}{row.is_trap && <span className="c"> · {t({ en: 'look-alike', uz: 'oʻxshash holat', ru: 'похожий случай' })}</span>}</td>
                      <td className="id">{row.contract_id}</td>
                      <td className="c nw">{row.installment_n === null ? t({ en: 'one-time fee', uz: 'bir martalik komissiya', ru: 'разовая комиссия' }) : t({ en: `No. ${row.installment_n}`, uz: `${row.installment_n}-toʻlov`, ru: `№ ${row.installment_n}` })}</td>
                      <td className="n"><Num n={row.excess_amount} /></td>
                      <td className="c">{cause(row.cause_tag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="more">
                {t({ en: `${formatNumber(rows.length)} shown of ${formatNumber(key.total)}.`, uz: `${formatNumber(key.total)} tadan ${formatNumber(rows.length)} tasi koʻrsatildi.`, ru: `Показано ${formatNumber(rows.length)} из ${formatNumber(key.total)}.` })}
                {!all && key.items.length > rows.length && <button type="button" className="link" onClick={() => setAll(true)}>{t({ en: `Show all ${formatNumber(key.items.length)} rows`, uz: `Barcha ${formatNumber(key.items.length)} qatorni koʻrsatish`, ru: `Показать все ${formatNumber(key.items.length)}` })}</button>}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default function Results() {
  const { t } = useLang()
  const { worldId, worlds } = useSession()
  const { state, reload } = useLoad(() => api.scoreboard(worldId), [worldId])
  const world = worlds?.find((item) => item.world_id === worldId)
  return (
    <div className="wrap">
      <Head
        back={{ to: '/app/demo', label: t({ en: 'Demo tools', uz: 'Demo vositalari', ru: 'Демо-инструменты' }) }}
        title={t({ en: 'Results', uz: 'Natijalar', ru: 'Результаты' })}
        sentence={t({
          en: 'What FeeGuard found in the open demo bank, next to what was hidden in it.',
          uz: 'FeeGuard ochiq demo bankda nimani topgani, unga yashirilgan narsalar yonida.',
          ru: 'Что FeeGuard нашёл в открытом демо-банке, рядом с тем, что в нём было спрятано.',
        })}
      />
      {state.status === 'loading' && <Loading lines={6} words={t({ en: `Checking ${world ? formatNumber(world.size) : ''} loans against the answer key…`, uz: `${world ? formatNumber(world.size) : ''} ta kredit javoblar kaliti bilan solishtirilmoqda…`, ru: `Сверяем ${world ? formatNumber(world.size) : ''} кредитов с ключом ответов…` })} />}
      {state.status === 'error' && <Problem error={state.error} onRetry={reload} />}
      {state.status === 'ready' && <Board board={state.data} />}
      <div key={worldId}><AnswerKey /></div>
    </div>
  )
}
