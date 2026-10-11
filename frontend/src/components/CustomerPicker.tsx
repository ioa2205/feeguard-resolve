import { useId, useState } from 'react'
import type { FormEvent } from 'react'

import { api } from '../api'
import { useLang } from '../i18n'
import type { Customer } from '../types'
import { Button, Label, Problem } from './Parts'

// Finding one customer of the Sandbox Bank by name or number. Used by "A customer's
// phone" and by "Add a debit by hand". The names are invented.

export function CustomerPicker({ onPick, chosen }: { onPick: (customer: Customer) => void; chosen?: string | null }) {
  const field = useId()
  const { t } = useLang()
  const [search, setSearch] = useState('')
  const [found, setFound] = useState<{ items: Customer[]; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  async function find(event?: FormEvent) {
    event?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setFound(await api.customers(search.trim()))
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={find} className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={field} className="block"><Label>{t({ en: 'Customer name or number', uz: 'Mijoz ismi yoki raqami', ru: 'Имя или номер клиента' })}</Label></label>
          <input
            id={field}
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-field border-ink-soft bg-sheet min-h-10 w-72 max-w-full border px-2"
          />
        </div>
        <Button type="submit" disabled={busy}>{busy ? t({ en: 'Looking…', uz: 'Qidirilmoqda…', ru: 'Поиск…' }) : t({ en: 'Find the customer', uz: 'Mijozni topish', ru: 'Найти клиента' })}</Button>
      </form>
      {error && <Problem error={error} onRetry={() => find()} />}
      {found && found.items.length === 0 && <p>{t({ en: 'No customer has this name or number. Try part of a name, such as “Karim”.', uz: 'Bunday ism yoki raqamli mijoz yoʻq. Ismning bir qismini yozing, masalan “Karim”.', ru: 'Клиента с таким именем или номером нет. Введите часть имени, например «Karim».' })}</p>}
      {found && found.items.length > 0 && (
        <div>
          <ul className="border-line bg-sheet rounded-sheet max-h-72 overflow-y-auto border">
            {found.items.map((customer, index) => (
              <li key={customer.customer_id} className={`border-line border-t first:border-t-0 ${index % 2 ? 'bg-stripe' : ''}`}>
                <button
                  type="button"
                  aria-pressed={customer.customer_id === chosen}
                  onClick={() => onPick(customer)}
                  className={`min-h-10 w-full px-3 py-2 text-left ${customer.customer_id === chosen ? 'font-semibold underline' : ''}`}
                >
                  {customer.full_name}{' '}
                  <span className="text-ink-soft text-small">
                    {customer.customer_id} · {customer.region} · {customer.phone_masked}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-ink-soft text-small mt-1">
            {t({ en: `${found.items.length} shown of ${found.total}. Choose one.`, uz: `${found.total} tadan ${found.items.length} tasi koʻrsatildi. Bittasini tanlang.`, ru: `Показано ${found.items.length} из ${found.total}. Выберите одного.` })}
          </p>
        </div>
      )}
    </div>
  )
}
