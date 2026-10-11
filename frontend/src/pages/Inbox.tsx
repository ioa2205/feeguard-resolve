import { Link } from 'react-router-dom'

import { api } from '../api'
import { Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { count, daysBetween, formatDate, formatTime } from '../format'
import { useLoad } from '../hooks'
import { tx, useLang } from '../i18n'
import { useSession } from '../session'
import type { Complaint, World } from '../types'
import { LANG_ATTR, MISTAKE, RECEIVED_BY, STATE, VERDICT, verified } from '../words'

// The register of complaints (DESIGN section 7.4). The one that must be answered
// first is on top, and only its action is the filled button.

function answerDue(complaint: Complaint, world: World | undefined): string {
  if (!complaint.answer_due) return tx(verified(null))
  if (!world) return formatDate(complaint.answer_due)
  const left = daysBetween(world.as_of_date, complaint.answer_due)
  if (left < 0) return `${count(-left, 'day')} late`
  return left === 0 ? 'Today' : `${count(left, 'day')} left`
}

function state(complaint: Complaint): string {
  return complaint.verdict ? `${tx(STATE[complaint.status])}: ${tx(VERDICT[complaint.verdict]).toLowerCase()}` : tx(STATE[complaint.status])
}

export default function Inbox() {
  useLang() // draw again when the language changes
  const { worldId, worlds, presets } = useSession()
  const { state: loaded, reload } = useLoad(() => api.complaints(), [worldId])
  const world = worlds?.find((item) => item.world_id === worldId)
  const preset = presets.find((item) => item.world_id === worldId)

  return (
    <>
      <PageHead
        title="Complaints"
        sentence="Complaints about loan payments. The one that must be answered first is on top."
      />
      {preset && (
        <p className="border-line bg-sheet rounded-sheet mb-4 max-w-[70ch] border p-3">
          This demo bank rebuilds a public case: <strong>{preset.title}</strong>. {preset.what_happened} Check a
          complaint about “{tx(MISTAKE[preset.mistake]).toLowerCase()}”, then press Find others.
        </p>
      )}
      {loaded.status === 'loading' && <Loading lines={6} />}
      {loaded.status === 'error' && <Problem error={loaded.error} onRetry={reload} />}
      {loaded.status === 'ready' && loaded.data.items.length === 0 && (
        <Empty>
          No complaints yet. Go to <Link to="/sandbox/customer" className="text-stamp underline">the Sandbox Bank</Link>{' '}
          and write one.
        </Empty>
      )}
      {loaded.status === 'ready' && loaded.data.items.length > 0 && (
        <>
          <div className="border-line bg-sheet rounded-sheet overflow-x-auto border">
            <table className="text-table w-full min-w-[820px] border-collapse">
              <thead>
                <tr className="border-ink border-b-2 text-left">
                  <th scope="col" className="px-3 py-2"><Label>Received</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>The customer says</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>Answer due</Label></th>
                  <th scope="col" className="px-3 py-2"><Label>State</Label></th>
                  <th scope="col" className="px-3 py-2"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {loaded.data.items.map((complaint, index) => (
                  <tr key={complaint.complaint_id} className={`border-line border-t align-top ${index % 2 ? 'bg-stripe' : ''}`}>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {formatDate(complaint.created_at)}, {formatTime(complaint.created_at)}
                      <br />
                      <span className="text-ink-soft text-small">
                        Complaint {complaint.complaint_id} · {tx(RECEIVED_BY[complaint.channel])}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span lang={LANG_ATTR[complaint.lang]} className="text-words line-clamp-2 font-serif">
                        {complaint.text}
                      </span>
                      <span className="text-ink-soft text-small">{complaint.customer_name}</span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{answerDue(complaint, world)}</td>
                    <td className="px-3 py-3">{state(complaint)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/case/${encodeURIComponent(complaint.complaint_id)}`}
                        className={`rounded-field border-ink inline-flex min-h-10 items-center border px-4 font-semibold whitespace-nowrap ${
                          index === 0 ? 'bg-ink text-sheet' : 'bg-sheet text-ink'
                        }`}
                      >
                        {complaint.status === 'NEW' ? 'Check this complaint' : 'Open this complaint'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-ink-soft text-small mt-2">
            {count(loaded.data.items.length, 'complaint')} shown of {loaded.data.total}.
          </p>
        </>
      )}
    </>
  )
}
