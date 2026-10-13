"""One checker over all contracts, split into complained and silent (PLAN Part 7.4). Task A7.

The scan runs the same checker functions as one complaint (`checkers.CHECKERS`).
Reading a whole bank takes seconds, so the findings of all four checks are kept
in memory per demo bank after the first pass, with what the cause finder needs
(task A8). After that, `check_changes` reads again only the loans whose debits,
payments or charges changed since the last check (DECISIONS D-039): a debit added
by hand (task A10) or the daily check costs milliseconds, not a new pass.
"""

import threading
import time
from collections import Counter
from dataclasses import dataclass, field, replace

from .. import schemas
from ..connector import Bank, Customer
from . import causes
from . import timeline as timelines
from .checkers import CHECKERS, Finding, early_debit

SYSTEMIC_FROM = 2  # customers; one case is isolated, not a pattern (the 3030-12 definition)


@dataclass(frozen=True, slots=True)
class BankFindings:
    """Every finding of one demo bank, by mistake type, and who owns each contract.
    Never changed in place: `recheck` builds a new one, so a reader is never half-updated."""

    by_type: dict[str, tuple[Finding, ...]]
    owner_of: dict[str, str]  # contract id -> customer id
    seconds: float  # what the full pass took
    traits: dict[str, tuple[tuple[causes.Trait, ...], ...]]  # by type, in the order of `by_type`
    profiles: dict[str, causes.Profile]  # the eligible events of each type
    # What `recheck` needs to swap one loan out and in (DECISIONS D-039):
    per_contract: dict[str, tuple[tuple[str, Finding, tuple[causes.Trait, ...]], ...]] = field(default_factory=dict)
    eligible: dict[str, causes.Eligible] = field(default_factory=dict)
    marks: dict[str, int] = field(default_factory=dict)  # how far the money tables reached when read
    # The owners of loans with a finding, so a scan never reads every customer again.
    people: dict[str, Customer] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class Recheck:
    """What one check of the changed loans did."""

    found: BankFindings
    loans: int  # loans read again
    new: int  # findings that were not there before
    gone: int  # findings that are no longer there


_kept: dict[str, BankFindings] = {}
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def _check_loan(data, region: str):
    """All four checks on one loan, and its eligible events for the cause finder."""
    timeline = timelines.build(data)
    eligible = causes.eligible_of(timeline, region)
    found = tuple(
        (kind, finding, causes.traits_of(finding, data, region))
        for kind, check in CHECKERS.items()
        for finding in check(timeline).findings
    )
    return found, eligible


def _by_type(per_contract):
    found: dict[str, list[Finding]] = {kind: [] for kind in CHECKERS}
    traits: dict[str, list[tuple[causes.Trait, ...]]] = {kind: [] for kind in CHECKERS}
    for contract_id in sorted(per_contract):
        for kind, finding, its_traits in per_contract[contract_id]:
            found[kind].append(finding)
            traits[kind].append(its_traits)
    return {kind: tuple(items) for kind, items in found.items()}, {kind: tuple(items) for kind, items in traits.items()}


def check_bank(bank: Bank) -> BankFindings:
    """All four checks on every contract of the bank. The slow pass."""
    started = time.perf_counter()
    marks = bank.marks()  # read first: a row added during the pass is read again by the next check
    profiles = {kind: causes.Profile() for kind in CHECKERS}
    customers = bank.customers()
    owner_of: dict[str, str] = {}
    per_contract: dict[str, tuple] = {}
    eligible: dict[str, causes.Eligible] = {}
    people: dict[str, Customer] = {}
    for contract_id, data in bank.load().items():
        owner = data.contract.customer_id
        owner_of[contract_id] = owner
        found, eligible[contract_id] = _check_loan(data, customers[owner].region)
        causes.apply(eligible[contract_id], profiles)
        if found:
            per_contract[contract_id] = found
            people[owner] = customers[owner]
    by_type, traits = _by_type(per_contract)
    return BankFindings(by_type, owner_of, time.perf_counter() - started, traits, profiles, per_contract, eligible,
                        marks, people)


def recheck(found: BankFindings, bank: Bank, contract_ids: set[str]) -> Recheck:
    """Checks only these loans again and swaps their results in. The rest of the bank is not read."""
    marks = bank.marks()
    if not contract_ids:
        return Recheck(replace(found, marks=marks), 0, 0, 0)
    loaded = bank.load(contract_ids)
    owner_of = dict(found.owner_of)
    per_contract = dict(found.per_contract)
    eligible = dict(found.eligible)
    people = dict(found.people)
    profiles = {kind: causes.Profile(profile.total, Counter(profile.counts)) for kind, profile in found.profiles.items()}
    before: set[tuple] = set()
    after: set[tuple] = set()
    for contract_id in contract_ids:
        before.update(_key(kind, finding) for kind, finding, _ in per_contract.pop(contract_id, ()))
        old = eligible.pop(contract_id, None)
        if old:
            causes.apply(old, profiles, -1)
        data = loaded.get(contract_id)
        if data is None:  # the loan is gone from the bank
            owner_of.pop(contract_id, None)
            continue
        owner = data.contract.customer_id
        owner_of[contract_id] = owner
        customer = bank.customer(owner)
        result, eligible[contract_id] = _check_loan(data, customer.region if customer else "")
        causes.apply(eligible[contract_id], profiles)
        if result:
            per_contract[contract_id] = result
            after.update(_key(kind, finding) for kind, finding, _ in result)
            if customer:
                people[owner] = customer
    by_type, traits = _by_type(per_contract)
    kept = BankFindings(by_type, owner_of, found.seconds, traits, profiles, per_contract, eligible, marks, people)
    return Recheck(kept, len(contract_ids), len(after - before), len(before - after))


def _key(kind: str, finding: Finding) -> tuple:
    return kind, finding.contract_id, finding.installment_n, finding.amount_excess, finding.amount_affected


def _lock(world_id: str) -> threading.Lock:
    with _guard:
        return _locks.setdefault(world_id, threading.Lock())


def findings_of(world_id: str, bank: Bank) -> BankFindings:
    """The kept findings of a demo bank. The first caller pays for the pass; the others wait for it."""
    with _lock(world_id):
        if world_id not in _kept:
            _kept[world_id] = check_bank(bank)
        return _kept[world_id]


def peek(world_id: str) -> BankFindings | None:
    """The kept findings, or None while the first pass has not finished. Never waits."""
    return _kept.get(world_id)


def check_changes(world_id: str, bank: Bank) -> tuple[Recheck, bool]:
    """Reads again only the loans that changed since the last check. The first time, or
    after the kept findings were dropped, it is the full pass: the second value says so."""
    with _lock(world_id):
        kept = _kept.get(world_id)
        if kept is None:
            kept = _kept[world_id] = check_bank(bank)
            return Recheck(kept, len(kept.owner_of), sum(len(items) for items in kept.by_type.values()), 0), True
        result = recheck(kept, bank, bank.changed_since(kept.marks))
        _kept[world_id] = result.found
        return result, False


def forget(world_id: str) -> None:
    """Call when the demo bank is gone or rebuilt. Waits for a pass that is running,
    so it cannot keep findings of the old data."""
    with _lock(world_id):
        _kept.pop(world_id, None)


def scan(finding_type: str, found: BankFindings, bank: Bank) -> schemas.ScanResult:
    """Everyone with this mistake, and who of them never complained. `elapsed_ms` is
    filled in by the caller."""
    findings = found.by_type[finding_type]
    customers = found.people or bank.customers()
    complaint_of: dict[str, str] = {}
    for complaint in bank.complaints():
        complaint_of.setdefault(complaint.customer_id, complaint.id)  # the first complaint of each customer

    # The due date and the debits of each finding, so every affected loan can be drawn on one time axis (D-045).
    labels = bank.card_labels(debit.card_id for finding in findings for debit in finding.evidence.debits)
    items = []
    for finding in findings:
        customer = customers[found.owner_of[finding.contract_id]]
        complaint_id = complaint_of.get(customer.id)
        due = next((row.due_date for row in finding.evidence.schedule_rows if row.n == finding.installment_n), None)
        items.append(schemas.ScanItem(
            contract_id=finding.contract_id, customer_id=customer.id, customer_name=customer.full_name,
            region=customer.region, installment_n=finding.installment_n, amount_excess=finding.amount_excess,
            amount_affected=finding.amount_affected, days_early=finding.days_early,
            complained=complaint_id is not None, complaint_id=complaint_id, due_date=due,
            debits=[
                schemas.ScanDebit(at=debit.created_at, card=labels.get(debit.card_id, "card"), amount=debit.amount,
                                  status=debit.status, returned=debit.reversed_by is not None,
                                  batch_run_id=debit.batch_run_id)
                for debit in sorted(finding.evidence.debits, key=lambda debit: debit.created_at)
            ],
        ))
    # The customers who complained first, then by loan.
    items.sort(key=lambda item: (not item.complained, item.contract_id, item.installment_n or 0))

    affected = {item.customer_id for item in items}
    complained = {item.customer_id for item in items if item.complained}
    early = [item.days_early for item in items if item.days_early is not None]
    return schemas.ScanResult(
        finding_type=finding_type,
        affected_contracts=len({item.contract_id for item in items}),
        affected_customers=len(affected),
        total_excess=sum(item.amount_excess for item in items),
        total_affected=sum(item.amount_affected for item in items),
        systemic=len(affected) >= SYSTEMIC_FROM,
        complained=len(complained),
        silent=len(affected) - len(complained),
        avg_days_early=round(sum(early) / len(early)) if early and finding_type == early_debit.TYPE else None,
        cause=causes.find(finding_type, list(found.traits[finding_type]), found.profiles[finding_type]),
        items=items,
        elapsed_ms=0,
    )
