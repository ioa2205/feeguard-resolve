import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api, ApiError } from '../api'
import { Ledger } from '../components/Ledger'
import { Mark } from '../components/Marks'
import { Button, Empty, Label, Loading, PageHead, Problem } from '../components/Parts'
import { formatDate, formatDateTime, formatMonth, formatSom } from '../format'
import { useLoad } from '../hooks'
import { tx, useLang } from '../i18n'
import { useSession } from '../session'
import type {
  CaseResult, Cleared, ContractClause, Decision, DecisionAction, DraftReply, Evidence, Finding, Verdict,
} from '../types'
import {
  ACTING_AS, CLAIM, DECIDED, LANGUAGE, LANG_ATTR, LETTER, MISTAKE, PAID_BY, READ_BY, RECEIVED_BY, VERDICT, verified,
} from '../words'

// The Case screen (DESIGN section 7.2): three columns, named by who is speaking.

const VERDICTS: Verdict[] = ['SUPPORTED', 'NOT_SUPPORTED', 'NEEDS_INFO', 'OUT_OF_SCOPE']
const STAMP: Record<Verdict, string> = {
  SUPPORTED: 'border-4 border-double border-wrong text-wrong',
  NOT_SUPPORTED: 'border-4 border-double border-stamp text-stamp',
  NEEDS_INFO: 'border-2 border-dashed border-ink-soft text-ink-soft',
  OUT_OF_SCOPE: 'border-2 border-dashed border-ink-soft text-ink-soft',
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <h2 className="border-ink mb-3 border-b-2 pb-1"><Label>{title}</Label></h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1"><Label>{title}</Label></h3>
      {children}
    </div>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="border-line flex justify-between gap-4 border-t py-1">
      <dt className="text-ink-soft">{name}</dt>
      <dd className="text-right font-semibold">{children}</dd>
    </div>
  )
}

/** The bank rows behind one finding or one cleared item. A reader can check each of them. */
function Rows({ evidence }: { evidence: Evidence }) {
  const groups: [string, [string, number][]][] = [
    ['Schedule', evidence.schedule_rows.map((row) => [`No. ${row.n} · due ${formatDate(row.due_date)}`, row.total_due])],
    [
      'Taken from card',
      evidence.debits.map((debit) => [
        `${formatDateTime(debit.created_at)} · ${debit.card} · ${
          debit.status === 'FAILED' ? 'failed' : debit.reversed_by ? 'returned' : 'succeeded'
        }`,
        debit.amount,
      ]),
    ],
    [
      'Recorded on the loan',
      evidence.payments.map((payment) => [
        `${formatDateTime(payment.posted_at)} · ${tx(PAID_BY[payment.channel])}${
          payment.paid_at === payment.posted_at ? '' : ` · received ${formatDateTime(payment.paid_at)}`
        }`,
        payment.amount,
      ]),
    ],
    ['Charged', evidence.charges.map((charge) => [`${formatDateTime(charge.charged_at)} · ${charge.name}`, charge.amount])],
  ]
  return (
    <div className="text-table mt-2 space-y-2">
      {groups
        .filter(([, rows]) => rows.length)
        .map(([name, rows]) => (
          <div key={name}>
            <p className="text-ink-soft text-small">{name}</p>
            <ul>
              {rows.map(([words, amount], index) => (
                <li key={index} className="border-line flex justify-between gap-3 border-t py-1">
                  <span>{words}</span>
                  <span className="whitespace-nowrap tabular-nums">{formatSom(amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  )
}

function Proof({ findings, cleared }: { findings: Finding[]; cleared: Cleared[] }) {
  if (!findings.length && !cleared.length) {
    return <p>No debit, penalty or fee in the checked period looks like a mistake.</p>
  }
  return (
    <div className="space-y-4">
      {findings.map((finding) => (
        <div key={finding.finding_id}>
          <p>{finding.explanation}</p>
          {finding.legal_basis && <p className="text-small">Legal basis: {tx(verified(finding.legal_basis))}</p>}
          <Rows evidence={finding.evidence} />
        </div>
      ))}
      {cleared.map((item, index) => (
        <div key={index} className="border-stamp border-l-4 pl-3">
          <p><strong>Checked, correct:</strong> {item.explanation}</p>
          <Rows evidence={item.evidence} />
        </div>
      ))}
    </div>
  )
}

function Clauses({ clauses }: { clauses: ContractClause[] }) {
  const seen = new Set<string>()
  const unique = clauses.filter((clause) => !seen.has(clause.clause) && seen.add(clause.clause))
  if (!unique.length) return null
  return (
    <Block title="The contract says">
      {unique.map((clause) => (
        <p key={clause.clause} className="mb-2">
          <span className="text-ink-soft text-small">Clause {clause.clause}</span>
          <span lang="uz-Latn" className="text-words block font-serif">{clause.text}</span>
        </p>
      ))}
    </Block>
  )
}

function DecisionBlock({ result, onDecided }: { result: CaseResult; onDecided: (decision: Decision) => void }) {
  const [note, setNote] = useState('')
  const [correcting, setCorrecting] = useState(false)
  const [verdict, setVerdict] = useState<Verdict>(result.verdict)
  const [excess, setExcess] = useState(String(result.total_excess))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [justDecided, setJustDecided] = useState(false)

  async function decide(action: DecisionAction) {
    setSending(true)
    setError(null)
    try {
      const correction = action === 'CORRECT' ? { corrected_verdict: verdict, corrected_excess: Number(excess) } : {}
      onDecided(await api.decide(result.case_id, { action, note, ...correction }))
      setJustDecided(true)
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setSending(false)
    }
  }

  const { decision } = result
  if (decision) {
    return (
      <Block title="Your decision">
        <p className={`border-stamp text-stamp rounded-sheet border-2 px-3 py-2 font-semibold ${justDecided ? 'stamp-lands' : ''}`}>
          <Mark kind="tick" /> {tx(DECIDED[decision.action])} by {tx(ACTING_AS[decision.actor])}, {formatDateTime(decision.at)}
        </p>
        {decision.action === 'CORRECT' && decision.corrected_verdict && (
          <p className="mt-2">
            Corrected to: {tx(VERDICT[decision.corrected_verdict])}
            {decision.corrected_excess !== null && `, to return ${formatSom(decision.corrected_excess)}`}
          </p>
        )}
        {decision.note && <p className="mt-2">Note: {decision.note}</p>}
      </Block>
    )
  }

  const amountValid = /^\d+$/.test(excess)
  return (
    <Block title="Your decision">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Button main disabled={sending} onClick={() => decide('CONFIRM')} className="w-full">Confirm</Button>
          <p className="text-small mt-1">The verdict is right.</p>
        </div>
        <div>
          <Button disabled={sending} onClick={() => decide('DISMISS')} className="w-full">Dismiss</Button>
          <p className="text-small mt-1">The verdict is wrong. Close without it.</p>
        </div>
        <div>
          <Button disabled={sending} aria-expanded={correcting} onClick={() => setCorrecting(!correcting)} className="w-full">
            Correct
          </Button>
          <p className="text-small mt-1">Change the verdict or the amount.</p>
        </div>
      </div>

      {correcting && (
        <div className="border-line mt-3 space-y-2 border-t pt-3">
          <label className="block">
            <span className="block"><Label>The right verdict</Label></span>
            <select
              value={verdict}
              onChange={(event) => setVerdict(event.target.value as Verdict)}
              className="border-ink-soft bg-sheet rounded-field min-h-10 w-full border px-2"
            >
              {VERDICTS.map((item) => <option key={item} value={item}>{tx(VERDICT[item])}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block"><Label>To return, in whole soʻm</Label></span>
            <input
              inputMode="numeric"
              value={excess}
              onChange={(event) => setExcess(event.target.value.replace(/\s/g, ''))}
              aria-invalid={!amountValid}
              className="border-ink-soft bg-sheet rounded-field min-h-10 w-full border px-2 tabular-nums"
            />
          </label>
          {!amountValid && <p className="text-small">Write the amount with digits only, for example 500000.</p>}
          <Button disabled={sending || !amountValid} onClick={() => decide('CORRECT')}>Save the correction</Button>
        </div>
      )}

      <label className="mt-3 block">
        <span className="block"><Label>Note, if you want to leave one</Label></span>
        <textarea
          value={note}
          maxLength={2000}
          rows={2}
          onChange={(event) => setNote(event.target.value)}
          className="border-ink-soft bg-sheet rounded-field w-full border px-2 py-1"
        />
      </label>
      {error && <div className="mt-2"><Problem error={error} /></div>}
    </Block>
  )
}

/** One link per kind of mistake found. It is the main action once a person has confirmed. */
function FindOthers({ findings, confirmed }: { findings: Finding[]; confirmed: boolean }) {
  const seen = new Set<string>()
  const kinds = findings.filter((finding) => !seen.has(finding.type) && seen.add(finding.type))
  if (!kinds.length) return null
  return (
    <Block title="Others with the same mistake">
      <ul className="space-y-2">
        {kinds.map((finding) => (
          <li key={finding.finding_id}>
            <Link
              to={`/scan/${encodeURIComponent(finding.finding_id)}`}
              className={`rounded-field border-ink inline-flex min-h-10 items-center border px-4 font-semibold ${
                confirmed ? 'bg-ink text-sheet' : 'bg-sheet text-ink'
              }`}
            >
              Find others like this: {tx(MISTAKE[finding.type]).toLowerCase()}
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-small mt-1">Checks every loan of the bank for the same mistake, also for customers who never complained.</p>
    </Block>
  )
}

function Letter({ result, confirmed, onChanged }: {
  result: CaseResult; confirmed: boolean; onChanged: (draft: DraftReply) => void
}) {
  const { health } = useSession()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const draft = result.draft_reply as DraftReply

  async function improve() {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const next = await api.improveDraft(result.case_id)
      onChanged(next)
      if (next.source === 'template') {
        setNote(health?.llm_mode === 'llm'
          ? 'The AI’s wording changed a number or the language, so the standard letter stays.'
          : 'The AI is off, so the standard letter stays.')
      }
    } catch (failure) {
      setError(failure as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Block title="Letter to the customer">
      <article className="border-line bg-sheet aspect-[210/297] border p-6">
        <p className="text-small border-line mb-4 border-b pb-2">
          {tx(LETTER[draft.source])} · <strong>{confirmed ? 'Confirmed by a person' : 'Draft, not approved'}</strong>
        </p>
        <p lang={LANG_ATTR[draft.lang]} className="text-words font-serif whitespace-pre-line">{draft.text}</p>
      </article>
      {draft.source === 'template' && (
        <div className="mt-2 space-y-1">
          <Button disabled={busy} onClick={improve}>{busy ? 'Asking the AI…' : 'Improve the wording'}</Button>
          <p className="text-small">
            The AI may reword the letter. FeeGuard keeps its text only if every number and the language stay the same.
          </p>
          {note && <p role="status">{note}</p>}
          {error && <Problem error={error} onRetry={improve} />}
        </div>
      )}
    </Block>
  )
}

function CaseView({ complaintId }: { complaintId: string }) {
  const { state, reload, replace } = useLoad<CaseResult>(async () => {
    try {
      return await api.getCase(complaintId)
    } catch (error) {
      // Not checked yet: check it now.
      if (error instanceof ApiError && error.code === 'NOT_FOUND') return api.investigate(complaintId)
      throw error
    }
  }, [complaintId])

  if (state.status === 'loading') return <Loading lines={8} words="Checking the bank's records…" />
  if (state.status === 'error') return <Problem error={state.error} onRetry={reload} />

  const result = state.data
  const { complaint, understood, decision } = result
  const confirmed = decision?.action === 'CONFIRM'
  const early = result.findings.find((finding) => finding.type === 'EARLY_DEBIT')

  return (
    <>
      <p className="text-ink-soft text-small -mt-4 mb-4">
        Checked in {(result.elapsed_ms / 1000).toFixed(1)} s · {formatDate(result.window.date_from)} to{' '}
        {formatDate(result.window.date_to)} · read by {tx(READ_BY[understood.mode])}
      </p>
      <div className="grid gap-6 min-[1100px]:grid-cols-[280px_minmax(0,1fr)_340px] min-[1280px]:grid-cols-[320px_minmax(0,1fr)_380px]">
        <Column title="Customer says">
          <div className="border-stamp text-stamp rounded-sheet font-condensed border-2 px-3 py-2 tracking-[0.04em] uppercase">
            <p className="text-stamp-text font-bold tracking-[0.08em]">Received</p>
            <p>No. {complaint.complaint_id}</p>
            <p>{formatDateTime(complaint.created_at)} · {tx(RECEIVED_BY[complaint.channel])}</p>
            <p>{tx(LANGUAGE[complaint.lang])}</p>
            <p>Answer due: {complaint.answer_due ? formatDate(complaint.answer_due) : tx(verified(null))}</p>
          </div>
          <blockquote lang={LANG_ATTR[complaint.lang]} className="text-words font-serif">
            “{complaint.text}”
          </blockquote>
          <p className="text-ink-soft text-small">{complaint.customer_name} · customer {complaint.customer_id}</p>

          <Block title="What FeeGuard read">
            <dl>
              <Fact name="Claim">{tx(CLAIM[understood.claim_type])}</Fact>
              <Fact name="Amount">
                {understood.claimed_excess === null ? 'None named' : formatSom(understood.claimed_excess)}
              </Fact>
              <Fact name="Month">{understood.period ? formatMonth(understood.period) : 'None named'}</Fact>
              <Fact name="Read by">{tx(READ_BY[understood.mode])}</Fact>
            </dl>
            <p className="text-small mt-2">The verdict does not depend on this reading. All four checks always run.</p>
          </Block>
        </Column>

        <Column title="Bank records show">
          {result.timelines.length === 0 && (
            <Empty>This customer has no loan payment in the checked period.</Empty>
          )}
          {result.timelines.map((timeline) => <Ledger key={timeline.contract_id} timeline={timeline} />)}
        </Column>

        <Column title="Decision">
          <div>
            <p className={`rounded-sheet font-condensed text-stamp-text inline-block px-4 py-2 font-bold tracking-[0.08em] uppercase ${STAMP[result.verdict]}`}>
              {tx(VERDICT[result.verdict])}
            </p>
            {result.total_excess > 0 && (
              <p className="text-wrong mt-2 font-semibold">
                <Mark kind="exclamation" /> To return: <span className="tabular-nums">{formatSom(result.total_excess)}</span>
              </p>
            )}
            {early && (
              <p className="text-wrong mt-2 font-semibold">
                <Mark kind="exclamation" /> Taken early: <span className="tabular-nums">{formatSom(early.amount_affected)}</span>.
                This money was owed, only later, so it is not counted as money to return.
              </p>
            )}
            {result.claim_match === false && (
              <p className="mt-2">This is a different mistake than the customer described.</p>
            )}
          </div>

          <Block title="Why"><p>{result.verdict_reason}</p></Block>
          <Block title="Proof"><Proof findings={result.findings} cleared={result.cleared} /></Block>
          <Clauses
            clauses={[...result.findings, ...result.cleared].flatMap((item) => item.evidence.contract_clauses)}
          />

          <DecisionBlock result={result} onDecided={(made) => replace({ ...result, decision: made })} />
          <p className="text-small">Nothing is sent to the customer until a person confirms.</p>

          <FindOthers findings={result.findings} confirmed={confirmed} />

          {!result.draft_reply && (
            <Block title="Letter to the customer">
              <p>This complaint was checked before letters were written. Check it again to get the letter.</p>
            </Block>
          )}
          {result.draft_reply && (
            <Letter result={result} confirmed={confirmed} onChanged={(draft) => replace({ ...result, draft_reply: draft })} />
          )}
        </Column>
      </div>
    </>
  )
}

export default function Case() {
  useLang() // draw again when the language changes
  const { complaintId } = useParams()
  return (
    <>
      <PageHead
        title={complaintId ? `Complaint ${complaintId}` : 'Complaint'}
        sentence="One complaint, checked against the bank’s own records."
      />
      {complaintId ? (
        <CaseView key={complaintId} complaintId={complaintId} />
      ) : (
        <Empty>
          No complaint is open. Choose one on the{' '}
          <Link to="/" className="text-stamp underline">Complaints</Link> screen.
        </Empty>
      )}
    </>
  )
}
