// Finding one customer of the demo bank by name or number. The list opens with customers
// already in it, so a visitor need not know a name. Every name is invented.

import { useEffect, useRef, useState } from 'react'

import { api } from '../api'
import { useLang } from '../i18n'
import { useSession } from '../session'
import type { Customer } from '../types'
import { Loading, Problem, SEARCH_ICON } from './ui'

export function Picker({ chosen, onPick }: { chosen?: string | null; onPick: (customer: Customer) => void }) {
  const { t } = useLang()
  const { worldId } = useSession()
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<{ items: Customer[]; total: number } | null>(null)
  const [problem, setProblem] = useState<Error | null>(null)
  const turn = useRef(0)

  // Searches as the visitor types, a moment after the last key.
  useEffect(() => {
    const mine = ++turn.current
    const timer = window.setTimeout(() => {
      api.customers(search.trim()).then(
        (list) => { if (mine === turn.current) { setFound(list); setProblem(null) } },
        (failure: Error) => { if (mine === turn.current) setProblem(failure) },
      )
    }, search ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [search, worldId])

  return (
    <div className="panel panel--pad picker">
      <label className="search" style={{ background: 'var(--white)', margin: '0 0 6px' }}>
        {SEARCH_ICON}
        <input type="search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)}
          placeholder={t({ en: 'Customer name or number', uz: 'Mijoz ismi yoki raqami', ru: 'Имя или номер клиента' })}
          aria-label={t({ en: 'Find a customer', uz: 'Mijozni topish', ru: 'Найти клиента' })} />
      </label>
      {problem && <Problem error={problem} />}
      {!found && !problem && <Loading lines={3} />}
      {found && found.items.length === 0 && <p className="note" style={{ padding: '10px 14px' }}>{t({ en: 'No customer has this name or number. Try part of a name.', uz: 'Bunday ism yoki raqamli mijoz yoʻq. Ismning bir qismini yozib koʻring.', ru: 'Клиента с таким именем или номером нет. Попробуйте часть имени.' })}</p>}
      {found && found.items.length > 0 && (
        <>
          <ul style={{ maxHeight: 300, overflowY: 'auto' }}>
            {found.items.map((customer) => (
              <li key={customer.customer_id}>
                <button type="button" aria-pressed={customer.customer_id === chosen} onClick={() => onPick(customer)}>
                  <b>{customer.full_name}</b>
                  <span><span className="id">{customer.customer_id}</span> · {customer.region}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="note" style={{ padding: '8px 14px 6px' }}>{t({ en: `${found.items.length} shown of ${found.total}. Every name is invented.`, uz: `${found.total} tadan ${found.items.length} tasi koʻrsatildi. Barcha ismlar oʻylab topilgan.`, ru: `Показано ${found.items.length} из ${found.total}. Все имена вымышлены.` })}</p>
        </>
      )}
    </div>
  )
}
