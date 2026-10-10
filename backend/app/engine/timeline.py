"""Builds the timeline of one contract: due, taken, posted, charged (PLAN Part 7.1). Task A3.

A pure function of one contract's records. It matches every debit and payment
to the installment it paid, oldest unpaid first, so money that paid nothing
stands out.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from ..connector import Charge, ContractData, Debit, Installment, Payment

ONE_DAY = timedelta(hours=24)


@dataclass(slots=True)
class Row:
    """One installment and what happened to it."""

    installment: Installment
    paid: int = 0
    paid_at: datetime | None = None  # the money that completed it was received
    posted_at: datetime | None = None  # that money was recorded on the loan
    debits: list[Debit] = field(default_factory=list)  # automatic debits aimed at it
    payments: list[tuple[Payment, int]] = field(default_factory=list)  # payment, part used here
    charges: list[Charge] = field(default_factory=list)

    @property
    def unpaid(self) -> int:
        return self.installment.total_due - self.paid

    def _apply(self, amount: int, payment: Payment | None, paid_at: datetime) -> None:
        self.paid += amount
        if payment:
            self.payments.append((payment, amount))
        if self.unpaid == 0:
            self.paid_at = paid_at
            self.posted_at = payment.posted_at if payment else paid_at


@dataclass(frozen=True, slots=True)
class Run:
    """One billing run: the automatic debits of one batch run, or within 24 hours."""

    debits: tuple[Debit, ...]  # all of them, also failed and returned ones
    at: datetime
    rows: tuple[int, ...]  # the installments the run could rightly collect for
    overdue: tuple[int, ...]  # those of them that were due before the day of the run
    owed: int
    collected: int  # successful and not returned
    excess: int  # collected beyond what was owed
    early: bool  # nothing was due yet; the run took the next installment


@dataclass(slots=True)
class Timeline:
    data: ContractData
    rows: list[Row]
    runs: list[Run]
    other_charges: list[Charge]  # charges that belong to no installment
    overpaid: int  # money paid by hand that no installment needed

    def row(self, n: int) -> Row | None:
        return self._by_n.get(n)

    _by_n: dict[int, Row] = field(default_factory=dict)


def _group_runs(debits: list[Debit]) -> list[list[Debit]]:
    groups: list[list[Debit]] = []
    for debit in sorted(debits, key=lambda d: (d.created_at, d.id)):
        first = groups[-1][0] if groups else None
        same_batch = first and debit.batch_run_id and debit.batch_run_id == first.batch_run_id
        if first and (same_batch or debit.created_at - first.created_at <= ONE_DAY):
            groups[-1].append(debit)
        else:
            groups.append([debit])
    return groups


def build(data: ContractData) -> Timeline:
    rows = [Row(installment) for installment in sorted(data.schedule, key=lambda i: i.n)]
    by_n = {row.installment.n: row for row in rows}
    payment_of_debit = {p.debit_id: p for p in data.payments if p.debit_id}
    by_hand = [p for p in data.payments if not p.debit_id]

    steps: list[tuple[datetime, int, list[Debit] | Payment]] = [
        (group[0].created_at, 0, group) for group in _group_runs(data.debits)
    ]
    steps += [(payment.paid_at, 1, payment) for payment in by_hand]
    steps.sort(key=lambda step: step[:2])

    runs: list[Run] = []
    overpaid = 0
    # Money always goes to the oldest unpaid installment, so the paid ones are
    # rows[:first] and the due, unpaid ones are rows[first:end].
    first = end = 0
    for moment, kind, item in steps:
        today = moment.date()
        while first < len(rows) and rows[first].unpaid == 0:
            first += 1
        end = max(end, first)
        while end < len(rows) and rows[end].installment.due_date <= today:
            end += 1
        due = rows[first:end]
        upcoming = rows[end] if end < len(rows) else None

        if kind == 1:
            # A customer may pay what is due and, ahead of time, the next installment.
            left = item.amount
            for row in due + ([upcoming] if upcoming else []):
                take = min(left, row.unpaid)
                if take:
                    row._apply(take, item, item.paid_at)
                    left -= take
            overpaid += left
            continue

        # A billing run may collect what is due. If nothing is due, it can only
        # have been aimed at the next installment.
        targets = due or ([upcoming] if upcoming else [])
        owed = sum(row.unpaid for row in targets)
        overdue = tuple(row.installment.n for row in targets if row.installment.due_date < today)
        queue = list(targets)
        collected = 0
        for debit in item:
            if not debit.kept:
                if targets:
                    targets[0].debits.append(debit)
                continue
            collected += debit.amount
            left = debit.amount
            touched = False
            while left and queue:
                row = queue[0]
                take = min(left, row.unpaid)
                row._apply(take, payment_of_debit.get(debit.id), debit.created_at)
                row.debits.append(debit)
                touched = True
                left -= take
                if row.unpaid == 0:
                    queue.pop(0)
            if not touched and targets:
                targets[-1].debits.append(debit)  # it paid nothing: shown with the month it hit
        runs.append(
            Run(
                debits=tuple(item),
                at=moment,
                rows=tuple(row.installment.n for row in targets),
                overdue=overdue,
                owed=owed,
                collected=collected,
                excess=max(0, collected - owed),
                early=not due and bool(targets),
            )
        )

    other_charges = []
    for charge in data.charges:
        row = by_n.get(charge.installment_n) if charge.installment_n is not None else None
        if row:
            row.charges.append(charge)
        else:
            other_charges.append(charge)
    return Timeline(data, rows, runs, other_charges, overpaid, by_n)
