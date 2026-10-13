// Complaints (V2_PLAN W1.6): who is waiting, for how long, what they say, and the verdict when
// FeeGuard has checked. The main action is to open the one that waits longest for a decision.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../api'
import { COMPLAINT, DAY, MONTH, countOf, daysBetween, formatDate, formatDateTime, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import type { Words } from '../i18n'
import { useSession } from '../session'
import type { Complaint } from '../types'
import { LANG_ATTR, MISTAKE, RECEIVED_BY } from '../words'
import { Empty, Head, Loading, Problem, SEARCH_ICON, Som, today, useComplaintState } from './ui'

type Tab = 'decide' | 'new' | 'all'
const PAGE = 40

/** The public cases, in the screen's language. The server names them in English. */
export const PUBLIC_CASE: Record<string, { title: Words; what: Words }> = {
  'issuance-fee': {
    title: { en: 'A loan issuance fee that is not allowed', uz: 'Ruxsat etilmagan kredit berish komissiyasi', ru: 'Недопустимая комиссия за выдачу кредита' },
    what: {
      en: 'After a tariff update, one loan product charged a one-time fee for issuing the loan. The loan contract does not list this fee.',
      uz: 'Tarif yangilangach, bitta kredit mahsuloti kredit berish uchun bir martalik komissiya undirdi. Kredit shartnomasida bu komissiya yoʻq.',
      ru: 'После обновления тарифа один кредитный продукт взял разовую комиссию за выдачу кредита. В кредитном договоре такой комиссии нет.',
    },
  },
  'late-posting': {
    title: { en: 'A payment recorded late, then fined', uz: 'Toʻlov kech yozilib, jarima solingan', ru: 'Платёж зачислен поздно, затем штраф' },
    what: {
      en: 'Customers paid on the due date through one payment channel. The bank recorded the payment on the next business day and charged a late-payment penalty.',
      uz: 'Mijozlar toʻlov kunida bitta toʻlov kanali orqali toʻladi. Bank toʻlovni keyingi ish kunida yozdi va kechikkanlik uchun jarima soldi.',
      ru: 'Клиенты заплатили в срок через один платёжный канал. Банк зачислил платёж на следующий рабочий день и начислил штраф за просрочку.',
    },
  },
}

/** "today" · "4 days" · "3 months": how long since a complaint came in. */
export function useWaited() {
  const { t } = useLang()
  return (createdAt: string): string => {
    const days = Math.max(0, daysBetween(createdAt, today()))
    if (days === 0) return t({ en: 'today', uz: 'bugun', ru: 'сегодня' })
    if (days < 60) return countOf(days, DAY)
    return countOf(Math.round(days / 30.4), MONTH)
  }
}

export default function Complaints() {
  const { t } = useLang()
  const { worldId, worlds, presets } = useSession()
  const { state, reload } = useLoad(() => Promise.all([api.complaints(undefined, 500), api.checks().catch(() => null)]), [worldId])
  const [tab, setTab] = useState<Tab | null>(null)
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(PAGE)
  const stateOf = useComplaintState()
  const waited = useWaited()
  const preset = presets.find((item) => item.world_id === worldId)
  const world = worlds?.find((item) => item.world_id === worldId)

  const all = state.status === 'ready' ? state.data[0].items : []
  const lists = useMemo(() => ({
    decide: all.filter((c) => c.status === 'CHECKED'),
    new: all.filter((c) => c.status === 'NEW'),
    all,
  }), [all])
  // Open on what waits for a person; when nothing does, on what is not checked yet.
  const current: Tab = tab ?? (lists.decide.length ? 'decide' : lists.new.length ? 'new' : 'all')
  const needle = search.trim().toLowerCase()
  const found = useMemo(() => {
    const list = lists[current]
    if (!needle) return list
    return list.filter((c) => [c.customer_name, c.complaint_id, c.customer_id, c.contract_id ?? '', c.text].some((value) => value.toLowerCase().includes(needle)))
  }, [lists, current, needle])

  const head = (
    <Head
      title={t({ en: 'Complaints', uz: 'Shikoyatlar', ru: 'Жалобы' })}
      sentence={t({
        en: 'FeeGuard checks each one against the bank’s own records. You decide. The one waiting longest is on top.',
        uz: 'FeeGuard har birini bankning oʻz yozuvlari bilan tekshiradi. Qarorni siz qabul qilasiz. Eng uzoq kutayotgani tepada.',
        ru: 'FeeGuard проверяет каждую по записям самого банка. Решаете вы. Та, что ждёт дольше всех, — вверху.',
      })}
    >
      {state.status === 'ready' && all.length > 0 && <Waiting decide={lists.decide} unchecked={lists.new} />}
    </Head>
  )

  if (state.status === 'loading') return <div className="wrap">{head}<Loading lines={6} /></div>
  if (state.status === 'error') return <div className="wrap">{head}<Problem error={state.error} onRetry={reload} /></div>
  const checks = state.data[1]
  const last = checks?.items[0]

  return (
    <div className="wrap">
      {head}
      {preset && (
        <div className="empty" style={{ marginBottom: 20, maxWidth: 'none' }}>
          <p><b>{t({ en: 'This demo bank rebuilds a public case', uz: 'Bu demo bank ommaviy holatni qayta yaratadi', ru: 'Этот демо-банк воссоздаёт публичный случай' })}: {t(PUBLIC_CASE[preset.preset_id]?.title ?? { en: preset.title, uz: preset.title, ru: preset.title })}.</b>{' '}
            {t(PUBLIC_CASE[preset.preset_id]?.what ?? { en: preset.what_happened, uz: preset.what_happened, ru: preset.what_happened })}{' '}
            {t({ en: 'Check a complaint about', uz: 'Quyidagi haqida shikoyatni tekshiring:', ru: 'Проверьте жалобу на тему' })} “{t(MISTAKE[preset.mistake]).toLowerCase()}”{t({ en: ', then open Find others.', uz: ', soʻng “Boshqalarni topish”ni oching.', ru: ', затем откройте «Найти других».' })}</p>
        </div>
      )}
      {all.length === 0 ? (
        <Empty>
          <p>{t({ en: 'No complaint yet in this demo bank.', uz: 'Bu demo bankda hali shikoyat yoʻq.', ru: 'В этом демо-банке пока нет жалоб.' })}</p>
          <div className="row-acts"><Link className="btn" to="/app/phone">{t({ en: 'Write one on the customer’s phone', uz: 'Mijoz telefonida yozish', ru: 'Написать с телефона клиента' })} <span className="arrow">→</span></Link></div>
        </Empty>
      ) : (
        <>
          <div className="tools">
            <div className="pills" role="group" aria-label={t({ en: 'Show', uz: 'Koʻrsatish', ru: 'Показать' })}>
              {([['decide', { en: 'To decide', uz: 'Qaror kutmoqda', ru: 'Ждут решения' }], ['new', { en: 'Not checked', uz: 'Tekshirilmagan', ru: 'Не проверены' }], ['all', { en: 'All', uz: 'Hammasi', ru: 'Все' }]] as [Tab, Words][]).map(([key, label]) => (
                <button key={key} type="button" className="pill" aria-pressed={current === key} onClick={() => { setTab(key); setShown(PAGE) }}>
                  {t(label)} <b>{formatNumber(lists[key].length)}</b>
                </button>
              ))}
            </div>
            {last && (
              <span className="meta">
                {t({ en: 'Last check of all', uz: 'Barcha', ru: 'Последняя проверка всех' })} {formatNumber(last.loans_total)} {t({ en: 'loans', uz: 'ta kreditning oxirgi tekshiruvi', ru: 'кредитов' })}: <b>{formatDateTime(last.at)}</b>
              </span>
            )}
            <label className="search">
              {SEARCH_ICON}
              <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setShown(PAGE) }}
                placeholder={t({ en: 'Name, complaint or loan', uz: 'Ism, shikoyat yoki kredit', ru: 'Имя, жалоба или кредит' })}
                aria-label={t({ en: 'Search the complaints', uz: 'Shikoyatlar ichida qidirish', ru: 'Поиск по жалобам' })} />
            </label>
          </div>
          {found.length === 0 ? (
            <Empty><p>{needle
              ? t({ en: 'No complaint here matches these words.', uz: 'Bu soʻzlarga mos shikoyat yoʻq.', ru: 'Жалоб по этим словам здесь нет.' })
              : t({ en: 'Nothing in this list.', uz: 'Bu roʻyxat boʻsh.', ru: 'В этом списке пусто.' })}</p></Empty>
          ) : (
            <ol className="panel rows enter">
              {found.slice(0, shown).map((complaint) => <Row key={complaint.complaint_id} complaint={complaint} state={stateOf(complaint)} waited={waited(complaint.created_at)} />)}
            </ol>
          )}
          {found.length > 0 && (
            <p className="more">
              {t({ en: `${formatNumber(Math.min(shown, found.length))} shown of ${formatNumber(found.length)}.`, uz: `${formatNumber(found.length)} tadan ${formatNumber(Math.min(shown, found.length))} tasi koʻrsatildi.`, ru: `Показано ${formatNumber(Math.min(shown, found.length))} из ${formatNumber(found.length)}.` })}
              {found.length > shown && <button type="button" className="link" onClick={() => setShown(shown + PAGE)}>{t({ en: `Show ${Math.min(PAGE, found.length - shown)} more`, uz: `Yana ${Math.min(PAGE, found.length - shown)} tasini koʻrsatish`, ru: `Показать ещё ${Math.min(PAGE, found.length - shown)}` })}</button>}
              {world && <span>{t({ en: 'The answer deadline is not shown: the legal term is still to verify.', uz: 'Javob muddati koʻrsatilmagan: qonuniy muddat hali tekshirilishi kerak.', ru: 'Срок ответа не показан: законный срок ещё нужно проверить.' })}</span>}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Waiting({ decide, unchecked }: { decide: Complaint[]; unchecked: Complaint[] }) {
  const { t } = useLang()
  if (decide.length) {
    return (
      <div className="waiting dark">
        <p><b>{t({ en: `${decide.length} to decide`, uz: `${decide.length} ta qaror kutmoqda`, ru: `${decide.length} ждут решения` })}</b>{t({ en: 'checked by FeeGuard, waiting for you', uz: 'FeeGuard tekshirgan, sizni kutmoqda', ru: 'проверены FeeGuard, ждут вас' })}</p>
        <Link className="btn" to={`/app/case/${encodeURIComponent(decide[0].complaint_id)}`} state={{ complaint: decide[0] }}>{t({ en: 'Open the oldest', uz: 'Eng eskisini ochish', ru: 'Открыть самую давнюю' })} <span className="arrow">→</span></Link>
      </div>
    )
  }
  if (!unchecked.length) return null
  return (
    <div className="waiting dark">
      <p><b>{t({ en: 'Nothing to decide', uz: 'Qaror kutayotgani yoʻq', ru: 'Решать нечего' })}</b>{countOf(unchecked.length, COMPLAINT)} {t({ en: 'not checked yet', uz: 'hali tekshirilmagan', ru: 'ещё не проверено' })}</p>
      <Link className="btn" to={`/app/case/${encodeURIComponent(unchecked[0].complaint_id)}`} state={{ complaint: unchecked[0] }}>{t({ en: 'Check the oldest', uz: 'Eng eskisini tekshirish', ru: 'Проверить самую давнюю' })} <span className="arrow">→</span></Link>
    </div>
  )
}

function Row({ complaint, state, waited }: { complaint: Complaint; state: { cls: string; label: string }; waited: string }) {
  const { t } = useLang()
  const money = complaint.status === 'CHECKED' && complaint.verdict === 'SUPPORTED' && (complaint.to_return ?? 0) > 0
  return (
    <li>
      <Link className="crow" to={`/app/case/${encodeURIComponent(complaint.complaint_id)}`} state={{ complaint }}>
        <span className="when"><b>{formatDate(complaint.created_at)}</b><span>{waited} · {t(RECEIVED_BY[complaint.channel])}</span></span>
        <span className="whom">
          <b>{complaint.customer_name}</b><span className="id">{complaint.complaint_id}</span>
          <p lang={LANG_ATTR[complaint.lang]}>“{complaint.text}”</p>
        </span>
        <span className={`state ${state.cls}`}>{state.label}</span>
        <span className="amt">{money && <Som n={complaint.to_return ?? 0} className="wrong" />}</span>
        <span className="go" aria-hidden="true">→</span>
      </Link>
    </li>
  )
}
