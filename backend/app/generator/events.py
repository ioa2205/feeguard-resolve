"""Debits, payments and charges: the normal ones with their noise, and the planted mistakes.

Tasks A1 and A2. Normal noise is not a mistake and must not be flagged later:
a failed debit with one successful retry, a duplicate debit that was returned,
partial payments, and customers who really pay late.
"""

from datetime import date, timedelta
from random import Random

from .contracts import AUTO, PENALTY_BP_DAILY, Contract
from .defects import CAUSES, DOUBLE_DEBIT, EARLY_DEBIT, ILLEGAL_FEE, LATE_POSTING, Plan, TruthRow

SUCCESS, FAILED = "SUCCESS", "FAILED"
AUTO_DEBIT = "AUTO_DEBIT"
CARD_REISSUE_FEE = 25_000


def at(day: date, hour: int, minute: int) -> str:
    return f"{day.isoformat()}T{hour:02d}:{minute:02d}:00"


def next_business_day(day: date) -> date:
    following = day + timedelta(days=1)
    while following.weekday() >= 5:  # Saturday and Sunday; public holidays are out of scope
        following += timedelta(days=1)
    return following


class Events:
    def __init__(self) -> None:
        self.debits: list[tuple] = []
        self.payments: list[tuple] = []
        self.charges: list[tuple] = []
        self.planted: list[TruthRow] = []
        # Correct cases that look like a mistake: (contract_id, installment_n).
        self.lookalikes: dict[str, list[tuple[str, int | None]]] = {
            DOUBLE_DEBIT: [], EARLY_DEBIT: [], LATE_POSTING: [], ILLEGAL_FEE: [],
        }
        self._reversals = 0

    def debit(self, c: Contract, card_id: str, amount: int, when: str, status: str, run: str,
              retry_of: str | None = None, reversed_at: str | None = None) -> str:
        debit_id = f"D-{len(self.debits) + 1:07d}"
        reversed_by = None
        if reversed_at:
            self._reversals += 1
            reversed_by = f"RV-{self._reversals:06d}"
        self.debits.append((debit_id, c.id, card_id, amount, when, status, run, retry_of, reversed_by, reversed_at))
        return debit_id

    def payment(self, c: Contract, amount: int, channel: str, paid_at: str, posted_at: str,
                debit_id: str | None = None) -> None:
        self.payments.append((f"P-{len(self.payments) + 1:07d}", c.id, amount, channel, paid_at, posted_at, debit_id))

    def charge(self, c: Contract, kind: str, code: str, amount: int, when: str, n: int | None) -> None:
        self.charges.append((f"CH-{len(self.charges) + 1:06d}", c.id, kind, code, amount, when, n))

    def penalty(self, c: Contract, n: int, overdue: int, days: int, when: str) -> int:
        amount = overdue * days * PENALTY_BP_DAILY // 10_000
        self.charge(c, "PENALTY", "LATE_PAYMENT", amount, when, n)
        return amount

    def taken(self, c: Contract, card_id: str, amount: int, when: str, run: str,
              retry_of: str | None = None) -> str:
        """A successful automatic debit and the payment it makes on the loan."""
        debit_id = self.debit(c, card_id, amount, when, SUCCESS, run, retry_of)
        self.payment(c, amount, AUTO_DEBIT, when, when, debit_id)
        return debit_id


def make_events(contracts: list[Contract], plan: Plan, rng: Random, as_of: date) -> Events:
    events = Events()
    for c in contracts:
        if c.mode == AUTO:
            _automatic(c, plan, rng, as_of, events)
        else:
            _by_hand(c, plan, rng, as_of, events)
        _fees(c, plan, rng, as_of, events)
    return events


def _automatic(c: Contract, plan: Plan, rng: Random, as_of: date, ev: Events) -> None:
    cards = c.customer.cards
    primary, second = cards[0][0], (cards[1][0] if len(cards) > 1 else None)
    overdue: list[tuple[int, int, date]] = []  # (n, amount, due date) waiting for the next batch

    for n, due, _, _, total in c.schedule:
        planned = plan.installments.get((c.idx, n))
        day = due
        if planned == EARLY_DEBIT:
            day = c.schedule_v1[n - 1][1]  # the old due date
        elif n == c.early_n:
            day = c.early_debit_day
        if day > as_of:
            break
        minute = rng.randrange(10, 26)
        run = f"BR-{day.isoformat()}"
        when = at(day, 2, minute)

        # The batch first takes what is overdue, then this month's payment.
        for late_n, amount, late_due in overdue:
            ev.taken(c, primary, amount, when, run)
            ev.penalty(c, late_n, amount, (day - late_due).days, when)
            ev.lookalikes[LATE_POSTING].append((c.id, late_n))
        if overdue:
            ev.lookalikes[DOUBLE_DEBIT].append((c.id, n))
            when = at(day, 2, minute + 1)
        # No noise next to a planted mistake or a look-alike: one thing per month.
        quiet = (
            bool(overdue) or planned is not None or n == c.early_n or n + 1 == c.early_n
            or (c.idx, n + 1) in plan.installments
        )
        overdue = []

        if planned == DOUBLE_DEBIT:
            first = ev.taken(c, primary, total, when, run)
            ev.taken(c, second, total, at(day, 2, minute + 2), run, retry_of=first)
            ev.planted.append((DOUBLE_DEBIT, c.id, n, total, CAUSES[DOUBLE_DEBIT], 0))
            continue
        if planned == EARLY_DEBIT:
            ev.taken(c, primary, total, when, run)
            ev.planted.append((EARLY_DEBIT, c.id, n, total, CAUSES[EARLY_DEBIT], 0))
            continue
        if quiet:
            ev.taken(c, primary, total, when, run)
            if n == c.early_n:
                ev.lookalikes[EARLY_DEBIT].append((c.id, n))
            continue

        roll = rng.random()
        if roll < 0.025:
            # Not enough money on the card.
            ev.debit(c, primary, total, when, FAILED, run)
            if rng.random() < 0.6:
                overdue.append((n, total, due))
            else:
                paid_day = due + timedelta(days=rng.randrange(2, 13))
                channel = "CLICK" if rng.random() < 0.6 else "APP"
                paid = at(paid_day, rng.randrange(8, 22), rng.randrange(60))
                if paid_day <= as_of:
                    ev.payment(c, total, channel, paid, paid)
                    ev.penalty(c, n, total, (paid_day - due).days, paid)
                    ev.lookalikes[LATE_POSTING].append((c.id, n))
        elif roll < 0.055:
            # A failed debit, then one successful retry.
            failed = ev.debit(c, primary, total, when, FAILED, run)
            ev.taken(c, second or primary, total, at(day, 2, minute + rng.randrange(5, 10)), run, retry_of=failed)
        elif roll < 0.060 and day < as_of:
            # A duplicate debit that the bank returned the next day.
            first = ev.taken(c, primary, total, when, run)
            returned = at(day + timedelta(days=1), 10, rng.randrange(60))
            ev.debit(c, second or primary, total, at(day, 2, minute + 2), SUCCESS, run,
                     retry_of=first, reversed_at=returned)
        elif roll < 0.075:
            # The card had only part of the money; the rest was taken a few days later.
            part = total * (40 + rng.randrange(31)) // 100 // 1000 * 1000
            ev.taken(c, primary, part, when, run)
            rest_day = day + timedelta(days=rng.randrange(1, 4))
            rest_minute = rng.randrange(10, 26)
            if rest_day <= as_of:
                rest_when = at(rest_day, 2, rest_minute)
                ev.taken(c, primary, total - part, rest_when, f"BR-{rest_day.isoformat()}")
                ev.penalty(c, n, total - part, (rest_day - due).days, rest_when)
                ev.lookalikes[LATE_POSTING].append((c.id, n))
        else:
            ev.taken(c, primary, total, when, run)


def _by_hand(c: Contract, plan: Plan, rng: Random, as_of: date, ev: Events) -> None:
    channel = c.mode
    for n, due, _, _, total in c.schedule:
        if plan.installments.get((c.idx, n)) == LATE_POSTING:
            # Paid on the due date, recorded on the next business day, then fined.
            paid = at(due, rng.randrange(9, 20), rng.randrange(60))
            posted_day = next_business_day(due)
            posted = at(posted_day, 9, rng.randrange(5, 40))
            ev.payment(c, total, channel, paid, posted)
            fine = ev.penalty(c, n, total, (posted_day - due).days, posted)
            ev.planted.append((LATE_POSTING, c.id, n, fine, CAUSES[LATE_POSTING], 0))
            continue

        roll = rng.random()
        hour, minute = rng.randrange(8, 22), rng.randrange(60)
        if roll < 0.08:
            # Really paid late: the penalty is correct.
            paid_day = due + timedelta(days=rng.randrange(1, 16))
            if paid_day > as_of:
                break
            paid = at(paid_day, hour, minute)
            ev.payment(c, total, channel, paid, paid)
            ev.penalty(c, n, total, (paid_day - due).days, paid)
            ev.lookalikes[LATE_POSTING].append((c.id, n))
        elif roll < 0.12:
            # Two partial payments, both in time.
            first_day = due - timedelta(days=rng.randrange(2, 6))
            if first_day > as_of:
                break
            part = total // 2 // 1000 * 1000
            first = at(first_day, hour, minute)
            ev.payment(c, part, channel, first, first)
            if due > as_of:
                break
            rest = at(due, rng.randrange(8, 22), rng.randrange(60))
            ev.payment(c, total - part, channel, rest, rest)
        else:
            paid_day = due if roll < 0.55 else due - timedelta(days=rng.randrange(1, 6))
            if paid_day > as_of:
                break
            paid = at(paid_day, hour, minute)
            ev.payment(c, total, channel, paid, paid)


def _fees(c: Contract, plan: Plan, rng: Random, as_of: date, ev: Events) -> None:
    if c.idx in plan.fee_contracts:
        amount = max(50_000, c.principal // 100 // 1000 * 1000)
        ev.charge(c, "FEE", "LOAN_ISSUANCE", amount, at(c.start, 11, rng.randrange(60)), None)
        ev.planted.append((ILLEGAL_FEE, c.id, None, amount, CAUSES[ILLEGAL_FEE], 0))
    if c.reissue_on and c.reissue_on <= as_of:
        ev.charge(c, "FEE", "CARD_REISSUE", CARD_REISSUE_FEE, at(c.reissue_on, 14, rng.randrange(60)), None)
        ev.lookalikes[ILLEGAL_FEE].append((c.id, None))
