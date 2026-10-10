// The word list of DESIGN section 8.1. The screen says these words, always the same ones.

import type {
  Actor,
  ClaimType,
  ComplaintChannel,
  ComplaintStatus,
  DecisionAction,
  DefectType,
  DraftSource,
  Lang,
  Mode,
  PaymentChannel,
  Verdict,
} from './types'
import { TO_VERIFY } from './types'

export const VERDICT: Record<Verdict, string> = {
  SUPPORTED: 'Customer is right',
  NOT_SUPPORTED: 'Bank was right',
  NEEDS_INFO: 'More information needed',
  OUT_OF_SCOPE: 'Not one of the four checks',
}

export const MISTAKE: Record<DefectType, string> = {
  DOUBLE_DEBIT: 'Taken twice',
  EARLY_DEBIT: 'Taken early',
  LATE_POSTING: 'Recorded late, then fined',
  ILLEGAL_FEE: 'Fee not allowed',
}

export const CLAIM: Record<ClaimType, string> = { ...MISTAKE, OTHER: 'Something else' }

export const READ_BY: Record<Mode, string> = {
  llm: 'the local AI',
  rules: 'rules (the AI is off)',
}

export const STATE: Record<ComplaintStatus, string> = {
  NEW: 'Not checked yet',
  CHECKED: 'Checked, waiting for a decision',
  CONFIRMED: 'Confirmed',
  DISMISSED: 'Dismissed',
  CORRECTED: 'Corrected',
}

export const ACTING_AS: Record<Actor, string> = {
  officer: 'Complaint officer',
  compliance: 'Compliance head',
  jury: 'Jury',
}

export const RECEIVED_BY: Record<ComplaintChannel, string> = {
  APP: 'bank app',
  CALL_CENTER: 'call centre',
  BRANCH: 'bank branch',
  WEB: 'website',
}

export const PAID_BY: Record<PaymentChannel, string> = {
  AUTO_DEBIT: 'automatic debit',
  PAYNET: 'Paynet',
  CLICK: 'Click',
  BRANCH: 'bank branch',
  APP: 'bank app',
}

export const LANGUAGE: Record<Lang, string> = {
  uz_latn: 'Uzbek, Latin script',
  uz_cyrl: 'Uzbek, Cyrillic script',
  ru: 'Russian',
  mixed: 'Uzbek and Russian, mixed',
}

/** The `lang` attribute for a customer's or a contract's own words. */
export const LANG_ATTR: Record<Lang, string> = {
  uz_latn: 'uz-Latn',
  uz_cyrl: 'uz-Cyrl',
  ru: 'ru',
  mixed: 'mul',
}

export const LETTER: Record<DraftSource, string> = {
  template: 'Standard letter',
  llm: 'Reworded by the local AI',
}

export const DECIDED: Record<DecisionAction, string> = {
  CONFIRM: 'Confirmed',
  DISMISS: 'Dismissed',
  CORRECT: 'Corrected',
}

/** A legal text nobody has verified yet is shown as "To verify". */
export function verified(text: string | null): string {
  return text === null || text === TO_VERIFY ? 'To verify' : text
}
