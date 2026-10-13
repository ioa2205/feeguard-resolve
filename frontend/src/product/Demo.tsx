// Demo tools (V2_PLAN W1.5, W1.6): build a demo bank, load a public case, add a debit by hand.
// They sit in one place, out of the story's way. FeeGuard never sees what is hidden in a bank.

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { api } from '../api'
import { formatDate, formatDateTime, formatNumber } from '../format'
import { useLoad } from '../hooks'
import { useLang } from '../i18n'
import { useSession } from '../session'
import type { Customer, DefectType, Preset, TamperResult, World, WorldSize } from '../types'
import { DEFAULT_WORLD_ID } from '../types'
import { MISTAKE, productName } from '../words'
import { PUBLIC_CASE } from './Complaints'
import { useBankName } from './Frame'
import { Picker } from './Picker'
import { Head, Loading, Problem, Som } from './ui'

const TYPES: DefectType[] = ['DOUBLE_DEBIT', 'EARLY_DEBIT', 'LATE_POSTING', 'ILLEGAL_FEE']

function Build() {
  const { t } = useLang()
  const { refreshWorlds, setWorldId, worldId: openBank } = useSession()
  const bankName = useBankName()
  const navigate = useNavigate()
  // The screen starts again when the new bank opens, so "ready" travels in the address.
  const [params] = useSearchParams()
  const ready = params.get('built') === openBank ? openBank : null
  const [seed, setSeed] = useState(101)
  const [size, setSize] = useState<WorldSize>(5000)
  const [chosen, setChosen] = useState<Record<DefectType, boolean>>({ DOUBLE_DEBIT: true, EARLY_DEBIT: true, LATE_POSTING: true, ILLEGAL_FEE: true })
  const [rates, setRates] = useState<Record<DefectType, number>>({ DOUBLE_DEBIT: 2, EARLY_DEBIT: 2, LATE_POSTING: 2, ILLEGAL_FEE: 2 })
  const [traps, setTraps] = useState(20)
  const [complaintRate, setComplaintRate] = useState(15)
  const [surprise, setSurprise] = useState(false)
  const [building, setBuilding] = useState<World | null>(null)
  const [problem, setProblem] = useState<Error | null>(null)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])
  const none = !surprise && !TYPES.some((type) => chosen[type])

  function follow(worldId: string) {
    timer.current = window.setInterval(async () => {
      try {
        const world = await api.world(worldId)
        setBuilding(world)
        if (world.status === 'building') return
        if (timer.current) window.clearInterval(timer.current)
        if (world.status === 'failed') {
          setBuilding(null)
          setProblem(new Error(t({ en: 'Building the demo bank failed on the server. Try again, perhaps with another bank number.', uz: 'Serverda demo bank yaratilmadi. Qayta urinib koʻring, balki boshqa bank raqami bilan.', ru: 'Создать демо-банк на сервере не удалось. Попробуйте снова, возможно с другим номером банка.' })))
          return
        }
        await refreshWorlds()
        setBuilding(null)
        navigate(`/app/demo?built=${encodeURIComponent(worldId)}`)
        setWorldId(worldId)
      } catch (failure) {
        if (timer.current) window.clearInterval(timer.current)
        setBuilding(null)
        setProblem(failure as Error)
      }
    }, 1000)
  }

  async function build(event?: FormEvent) {
    event?.preventDefault()
    setProblem(null)
    try {
      const defects = Object.fromEntries(TYPES.filter((type) => chosen[type]).map((type) => [type, rates[type] / 100]))
      const created = await api.createWorld({ seed, size, defects, complaint_rate: complaintRate / 100, traps, surprise })
      setBuilding({ world_id: created.world_id, status: 'building', progress: 0, size, seed, as_of_date: '' })
      follow(created.world_id)
    } catch (failure) {
      setProblem(failure as Error)
    }
  }

  return (
    <form className="panel" onSubmit={build}>
      <div className="panel__bar"><b>{t({ en: 'A new demo bank', uz: 'Yangi demo bank', ru: 'Новый демо-банк' })}</b><span>{t({ en: '5 000 loans take a few seconds; 20 000 take up to a minute', uz: '5 000 ta kredit bir necha soniya, 20 000 tasi bir daqiqagacha oladi', ru: '5 000 кредитов — несколько секунд; 20 000 — до минуты' })}</span></div>
      <div className="sheet pad">
        <p className="muted" style={{ maxWidth: '46em' }}>{t({
          en: 'You choose which mistakes to hide; the demo bank hides them among normal payments. The same bank number and the same choices always build the same bank, so anyone can repeat it.',
          uz: 'Qaysi xatolarni yashirishni siz tanlaysiz; demo bank ularni oddiy toʻlovlar orasiga yashiradi. Bir xil bank raqami va bir xil tanlovlar doim bir xil bankni yaratadi, shuning uchun buni har kim takrorlay oladi.',
          ru: 'Вы выбираете, какие ошибки спрятать; демо-банк прячет их среди обычных платежей. Один и тот же номер банка и те же настройки всегда дают один и тот же банк, поэтому это может повторить любой.',
        })}</p>
        <div className="fields-row" style={{ marginTop: 18 }}>
          <label className="field" style={{ width: 170 }}><span>{t({ en: 'Bank number', uz: 'Bank raqami', ru: 'Номер банка' })}</span>
            <input className="input num" type="number" min={0} max={2147483647} value={seed} required onChange={(event) => setSeed(Number(event.target.value))} />
          </label>
          <fieldset>
            <legend className="lbl" style={{ marginBottom: 6 }}>{t({ en: 'Size', uz: 'Hajmi', ru: 'Размер' })}</legend>
            <div className="pills" role="radiogroup">
              {([5000, 20000] as WorldSize[]).map((option) => (
                <button key={option} type="button" className="pill" role="radio" aria-checked={size === option} aria-pressed={size === option} onClick={() => setSize(option)}>{formatNumber(option)} {t({ en: 'loans', uz: 'kredit', ru: 'кредитов' })}</button>
              ))}
            </div>
          </fieldset>
        </div>

        <fieldset style={{ marginTop: 22 }}>
          <legend className="lbl" style={{ marginBottom: 6 }}>{t({ en: 'Mistakes to hide, and the share of loans for each (0.5% to 3%)', uz: 'Yashiriladigan xatolar va har biri uchun kreditlar ulushi (0,5% dan 3% gacha)', ru: 'Какие ошибки спрятать и доля кредитов для каждой (от 0,5% до 3%)' })}</legend>
          {surprise && <p className="note" style={{ marginBottom: 6 }}>{t({ en: 'The demo bank chooses the mistakes and their shares, and keeps them secret.', uz: 'Xatolar va ularning ulushini demo bank oʻzi tanlaydi va sir saqlaydi.', ru: 'Демо-банк сам выбирает ошибки и их доли и держит это в секрете.' })}</p>}
          {TYPES.map((type) => (
            <div key={type} className="fields-row" style={{ alignItems: 'center', gap: '4px 16px' }}>
              <label className="tick" style={{ flex: '1 1 260px' }}>
                <input type="checkbox" disabled={surprise} checked={chosen[type]} onChange={(event) => setChosen({ ...chosen, [type]: event.target.checked })} />
                {t(MISTAKE[type])}
              </label>
              <label className="tick">
                <input className="input num" style={{ width: 90, minHeight: 36, padding: '6px 12px' }} type="number" min={0.5} max={3} step={0.5} disabled={surprise || !chosen[type]} value={rates[type]}
                  onChange={(event) => setRates({ ...rates, [type]: Number(event.target.value) })}
                  aria-label={`${t(MISTAKE[type])}: ${t({ en: 'per cent of loans', uz: 'kreditlar foizi', ru: 'процент кредитов' })}`} />
                <span className="muted">{t({ en: '% of loans', uz: '% kreditlar', ru: '% кредитов' })}</span>
              </label>
            </div>
          ))}
          <label className="tick" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={surprise} onChange={(event) => setSurprise(event.target.checked)} />
            {t({ en: 'Surprise me: let the demo bank choose the mistakes in secret', uz: 'Kutilmagan variant: xatolarni demo bank yashirincha tanlasin', ru: 'Сюрприз: пусть демо-банк выберет ошибки втайне' })}
          </label>
        </fieldset>

        <div className="fields-row" style={{ marginTop: 18, alignItems: 'flex-start' }}>
          <label className="field" style={{ flex: '1 1 260px', maxWidth: 360 }}><span>{t({ en: 'Complaints where the bank was right', uz: 'Bank haq boʻlgan shikoyatlar', ru: 'Жалобы, где банк был прав' })}</span>
            <input className="input num" type="number" min={0} max={200} value={traps} onChange={(event) => setTraps(Number(event.target.value))} />
            <small className="note" style={{ display: 'block', marginTop: 6 }}>{t({ en: 'They look like a mistake but are not. FeeGuard must clear them.', uz: 'Ular xatoga oʻxshaydi, lekin xato emas. FeeGuard ularni toʻgʻri deb topishi kerak.', ru: 'Они похожи на ошибку, но ею не являются. FeeGuard должен их отклонить.' })}</small>
          </label>
          <label className="field" style={{ flex: '1 1 260px', maxWidth: 360 }}><span>{t({ en: 'Wronged customers who complain, %', uz: 'Zarar koʻrgan mijozlardan shikoyat qiladiganlari, %', ru: 'Пострадавшие клиенты, которые жалуются, %' })}</span>
            <input className="input num" type="number" min={0} max={100} value={complaintRate} onChange={(event) => setComplaintRate(Number(event.target.value))} />
            <small className="note" style={{ display: 'block', marginTop: 6 }}>{t({ en: 'The others never complain. Find others must find them.', uz: 'Qolganlari hech qachon shikoyat qilmaydi. Ularni “Boshqalarni topish” topishi kerak.', ru: 'Остальные не жалуются. Их должен найти «Найти других».' })}</small>
          </label>
        </div>

        <div className="row-acts" style={{ marginTop: 20 }}>
          <button type="submit" className="btn" disabled={Boolean(building) || none}>{t({ en: 'Build the demo bank', uz: 'Demo bankni yaratish', ru: 'Создать демо-банк' })}</button>
          {none && <span className="note">{t({ en: 'Choose at least one mistake, or Surprise me.', uz: 'Kamida bitta xatoni yoki kutilmagan variantni tanlang.', ru: 'Выберите хотя бы одну ошибку или «Сюрприз».' })}</span>}
        </div>
        {building && (
          <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
            <p style={{ marginBottom: 8 }}>{t({ en: 'Building the demo bank', uz: 'Demo bank yaratilmoqda', ru: 'Создаём демо-банк' })}: {building.progress}%</p>
            <div className="bar-progress"><i style={{ width: `${building.progress}%` }} /></div>
          </div>
        )}
        {ready && (
          <div className="decided" role="status" style={{ marginTop: 16 }}>
            <span className="ok-line">{bankName(ready)}: {t({ en: 'ready and now open', uz: 'tayyor va ochiq', ru: 'готов и открыт' })}</span>
            <span className="row-acts">
              <Link className="btn btn--small" to="/app/phone">{t({ en: 'Write a complaint', uz: 'Shikoyat yozish', ru: 'Написать жалобу' })}</Link>
              <Link className="btn btn--small btn--quiet" to="/app">{t({ en: 'Open the complaints', uz: 'Shikoyatlarni ochish', ru: 'Открыть жалобы' })}</Link>
            </span>
          </div>
        )}
        {problem && <div style={{ marginTop: 16 }}><Problem error={problem} /></div>}
      </div>
    </form>
  )
}

// Two mistakes from public news, each rebuilt as a demo bank with fixed settings. One click loads
// it: built the first time, opened at once after that.
function PublicCases() {
  const { t } = useLang()
  const { presets, refreshWorlds, setWorldId, worldId: openBank } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const opened = presets.find((preset) => preset.preset_id === params.get('case') && preset.world_id === openBank)
  const [loading, setLoading] = useState<{ preset: Preset; progress: number } | null>(null)
  const [problem, setProblem] = useState<Error | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  async function load(preset: Preset) {
    setProblem(null)
    setLoading({ preset, progress: 0 })
    try {
      const { world_id: worldId } = await api.openPreset(preset.preset_id)
      for (;;) {
        const world = await api.world(worldId)
        if (!alive.current) return
        if (world.status === 'ready') break
        if (world.status === 'failed') throw new Error(t({ en: 'Building the demo bank failed on the server. Try again.', uz: 'Serverda demo bank yaratilmadi. Qayta urinib koʻring.', ru: 'Создать демо-банк на сервере не удалось. Попробуйте снова.' }))
        setLoading({ preset, progress: world.progress })
        await new Promise((done) => window.setTimeout(done, 1000))
      }
      await refreshWorlds()
      setLoading(null)
      navigate(`/app/demo?case=${encodeURIComponent(preset.preset_id)}#public`)
      setWorldId(worldId)
    } catch (failure) {
      if (!alive.current) return
      setLoading(null)
      setProblem(failure as Error)
    }
  }
  if (presets.length === 0) return null

  return (
    <section className="section" id="public">
      <h2 className="h1">{t({ en: 'Public cases', uz: 'Ommaviy holatlar', ru: 'Публичные случаи' })}</h2>
      <p className="sub" style={{ marginBottom: 20 }}>{t({
        en: 'In October 2025 the news reported that the Central Bank fined banks for these two mistakes. Each is rebuilt here as a demo bank with invented customers. Load one, check a complaint about it, then open Find others.',
        uz: '2025-yil oktabrda yangiliklar Markaziy bank banklarni shu ikki xato uchun jarimaga tortganini xabar qildi. Har biri bu yerda oʻylab topilgan mijozlar bilan demo bank sifatida qayta yaratilgan. Birini yuklang, u haqdagi shikoyatni tekshiring, soʻng “Boshqalarni topish”ni oching.',
        ru: 'В октябре 2025 года новости сообщили, что Центральный банк оштрафовал банки за эти две ошибки. Каждая воссоздана здесь как демо-банк с вымышленными клиентами. Загрузите один, проверьте жалобу об этом, затем откройте «Найти других».',
      })}</p>
      <div className="grid2">
        {presets.map((preset) => (
          <div key={preset.preset_id} className="inc">
            <h3>{t(PUBLIC_CASE[preset.preset_id]?.title ?? { en: preset.title, uz: preset.title, ru: preset.title })}</h3>
            <p className="why">{t(PUBLIC_CASE[preset.preset_id]?.what ?? { en: preset.what_happened, uz: preset.what_happened, ru: preset.what_happened })}</p>
            <p className="sub-id">
              {t({ en: `Only this mistake is hidden, in ${formatNumber(preset.size)} loans. Sources:`, uz: `Faqat shu xato yashirilgan, ${formatNumber(preset.size)} ta kreditda. Manbalar:`, ru: `Спрятана только эта ошибка, в ${formatNumber(preset.size)} кредитах. Источники:` })}{' '}
              {preset.sources.map((source, index) => (
                <span key={source.url}>{index > 0 && ' · '}<a className="link" href={source.url} target="_blank" rel="noopener noreferrer">{source.name}, {formatDate(source.published)}</a></span>
              ))}
            </p>
            <div className="foot">
              <button type="button" className="btn" disabled={Boolean(loading)} onClick={() => load(preset)}>
                {loading?.preset === preset ? `${t({ en: 'Loading', uz: 'Yuklanmoqda', ru: 'Загрузка' })}… ${loading.progress}%` : t({ en: 'Load this public case', uz: 'Bu ommaviy holatni yuklash', ru: 'Загрузить этот случай' })}
              </button>
              {opened === preset && <Link className="btn btn--quiet" to="/app">{t({ en: 'It is open: see the complaints', uz: 'U ochiq: shikoyatlarni koʻrish', ru: 'Он открыт: к жалобам' })} <span className="arrow">→</span></Link>}
            </div>
          </div>
        ))}
      </div>
      {problem && <div style={{ marginTop: 16 }}><Problem error={problem} /></div>}
      <p className="note" style={{ marginTop: 14 }}>{t({ en: 'Rebuilt from public news. We do not claim to know those banks’ internal causes.', uz: 'Ommaviy yangiliklar asosida qayta yaratilgan. Biz u banklardagi ichki sabablarni bilamiz, deb daʼvo qilmaymiz.', ru: 'Воссоздано по публичным новостям. Мы не утверждаем, что знаем внутренние причины в этих банках.' })}</p>
    </section>
  )
}

function AddDebit() {
  const { t } = useLang()
  const { worldId, presets } = useSession()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const statement = useLoad(() => (customer ? api.statement(customer.customer_id) : Promise.resolve(null)), [customer?.customer_id])
  const [loan, setLoan] = useState('')
  const [card, setCard] = useState('')
  const [amount, setAmount] = useState(500000)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Error | null>(null)
  const [added, setAdded] = useState<TamperResult | null>(null)
  const loaded = statement.state.status === 'ready' ? statement.state.data : null
  useEffect(() => {
    setLoan(loaded?.contracts[0]?.contract_id ?? '')
    setCard(loaded?.cards[0]?.card_id ?? '')
  }, [loaded])
  const fixed = worldId === DEFAULT_WORLD_ID || presets.some((preset) => preset.world_id === worldId)

  async function add(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setProblem(null)
    setAdded(null)
    try {
      setAdded(await api.tamper(worldId, { contract_id: loan, action: 'extra_debit', amount, card_id: card }))
    } catch (failure) {
      setProblem(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="section" id="debit">
      <h2 className="h1">{t({ en: 'Add a debit by hand', uz: 'Yechimni qoʻlda qoʻshish', ru: 'Добавить списание вручную' })}</h2>
      <p className="sub" style={{ marginBottom: 20 }}>{t({
        en: 'Take money from a customer’s card a second time, as a broken billing run would. Then write a complaint for that customer: FeeGuard must find the debit you added.',
        uz: 'Buzilgan hisob-kitob jarayoni kabi, mijozning kartasidan pulni ikkinchi marta yeching. Soʻng shu mijoz nomidan shikoyat yozing: FeeGuard siz qoʻshgan yechimni topishi kerak.',
        ru: 'Спишите деньги с карты клиента второй раз, как это сделал бы сломанный прогон списаний. Затем напишите жалобу от этого клиента: FeeGuard должен найти добавленное вами списание.',
      })}</p>
      {fixed ? (
        <div className="empty">
          <p>{worldId === DEFAULT_WORLD_ID
            ? t({ en: 'The main demo bank stays as it was built, so every visitor sees the same numbers. Build your own demo bank above; a debit can be added there.', uz: 'Asosiy demo bank oʻzgarmaydi, shunda har bir tashrif buyuruvchi bir xil raqamlarni koʻradi. Yuqorida oʻz demo bankingizni yarating; yechimni oʻsha yerda qoʻshish mumkin.', ru: 'Основной демо-банк не меняется, чтобы все видели одни и те же цифры. Создайте выше свой демо-банк; списание можно добавить там.' })
            : t({ en: 'A public-case demo bank stays as it was built, so it shows the public mistake alone. Build your own demo bank above; a debit can be added there.', uz: 'Ommaviy holat demo banki oʻzgarmaydi, shunda u faqat ommaviy xatoni koʻrsatadi. Yuqorida oʻz demo bankingizni yarating; yechimni oʻsha yerda qoʻshish mumkin.', ru: 'Демо-банк публичного случая не меняется, чтобы показывать только эту ошибку. Создайте выше свой демо-банк; списание можно добавить там.' })}</p>
        </div>
      ) : (
        <div className="cols cols--side">
          <Picker chosen={customer?.customer_id} onPick={setCustomer} />
          <div className="stack">
            {!customer && <div className="empty"><p>{t({ en: 'Choose a customer on the left.', uz: 'Chapdan mijozni tanlang.', ru: 'Выберите клиента слева.' })}</p></div>}
            {statement.state.status === 'loading' && customer && <Loading lines={2} />}
            {statement.state.status === 'error' && <Problem error={statement.state.error} onRetry={statement.reload} />}
            {loaded && customer && (
              <form className="panel panel--pad" onSubmit={add}>
                <div className="sheet pad">
                  <h3 className="h2" style={{ marginBottom: 14 }}>{customer.full_name}</h3>
                  <div className="fields-row">
                    <label className="field" style={{ flex: '1 1 200px' }}><span>{t({ en: 'Loan', uz: 'Kredit', ru: 'Кредит' })}</span>
                      <select className="input" value={loan} onChange={(event) => setLoan(event.target.value)}>
                        {loaded.contracts.map((contract) => <option key={contract.contract_id} value={contract.contract_id}>{contract.contract_id}, {t(productName(contract.product_code, contract.product_name))}</option>)}
                      </select>
                    </label>
                    <label className="field" style={{ flex: '1 1 180px' }}><span>{t({ en: 'Card', uz: 'Karta', ru: 'Карта' })}</span>
                      <select className="input" value={card} onChange={(event) => setCard(event.target.value)}>
                        {loaded.cards.map((item) => <option key={item.card_id} value={item.card_id}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="field" style={{ flex: '1 1 160px' }}><span>{t({ en: 'Amount, soʻm', uz: 'Summa, soʻm', ru: 'Сумма, сум' })}</span>
                      <input className="input num" type="number" min={1000} max={100000000} step={1000} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
                    </label>
                  </div>
                  <div className="row-acts" style={{ marginTop: 16 }}>
                    <button type="submit" className="btn" disabled={busy || !loan || !card}>{busy ? t({ en: 'Adding…', uz: 'Qoʻshilmoqda…', ru: 'Добавляем…' }) : t({ en: 'Add the debit', uz: 'Yechimni qoʻshish', ru: 'Добавить списание' })}</button>
                  </div>
                </div>
              </form>
            )}
            {problem && <Problem error={problem} />}
            {added && customer && (
              <div className="decided" role="status">
                <span><Som n={added.debit.amount} /> {t({ en: 'was taken from', uz: 'yechildi:', ru: 'списано с' })} {added.debit.card}, {t({ en: 'loan', uz: 'kredit', ru: 'кредит' })} {added.debit.contract_id}, {formatDateTime(added.debit.created_at)}.</span>
                <Link className="btn btn--small" to={`/app/phone?customer=${encodeURIComponent(customer.customer_id)}`}>{t({ en: 'Write a complaint as this customer', uz: 'Shu mijoz nomidan shikoyat yozish', ru: 'Написать жалобу от этого клиента' })} <span className="arrow">→</span></Link>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default function Demo() {
  const { t } = useLang()
  const { worldId } = useSession()
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
  }, [hash])
  return (
    <div className="wrap">
      <Head
        title={t({ en: 'Demo tools', uz: 'Demo vositalari', ru: 'Демо-инструменты' })}
        sentence={t({
          en: 'Everything here is for trying FeeGuard, not part of the product: build a demo bank with hidden mistakes, load a public case, or add a debit by hand.',
          uz: 'Bu yerdagi hamma narsa FeeGuardni sinab koʻrish uchun, mahsulotning bir qismi emas: yashirin xatoli demo bank yarating, ommaviy holatni yuklang yoki yechimni qoʻlda qoʻshing.',
          ru: 'Всё здесь — чтобы попробовать FeeGuard, а не часть продукта: создайте демо-банк со спрятанными ошибками, загрузите публичный случай или добавьте списание вручную.',
        })}
      >
        <Link className="btn btn--quiet" to="/app/results">{t({ en: 'Results and the answer key', uz: 'Natijalar va javoblar kaliti', ru: 'Результаты и ключ ответов' })} <span className="arrow">→</span></Link>
      </Head>
      <Build />
      <PublicCases />
      <div key={worldId}><AddDebit /></div>
    </div>
  )
}
