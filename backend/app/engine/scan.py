"""One checker over all contracts, split into complained and silent (PLAN Part 7.4). Task A7.

The scan runs the same checker functions as one complaint (`checkers.CHECKERS`).
Reading a whole bank takes seconds, so the findings of all four checks are kept
in memory per demo bank after the first pass. Bank data changes only when a
debit is added by hand (task A10), which must call `forget`.
"""

import threading
import time
from dataclasses import dataclass

from .. import schemas
from ..connector import Bank
from . import timeline as timelines
from .checkers import CHECKERS, Finding, early_debit

SYSTEMIC_FROM = 2  # customers; one case is isolated, not a pattern (the 3030-12 definition)


@dataclass(frozen=True, slots=True)
class BankFindings:
    """Every finding of one demo bank, by mistake type, and who owns each contract."""

    by_type: dict[str, tuple[Finding, ...]]
    owner_of: dict[str, str]  # contract id -> customer id
    seconds: float  # what the full pass took


_kept: dict[str, BankFindings] = {}
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def check_bank(bank: Bank) -> BankFindings:
    """All four checks on every contract of the bank. The slow pass."""
    started = time.perf_counter()
    found: dict[str, list[Finding]] = {kind: [] for kind in CHECKERS}
    owner_of: dict[str, str] = {}
    for contract_id, data in bank.load().items():
        owner_of[contract_id] = data.contract.customer_id
        timeline = timelines.build(data)
        for kind, check in CHECKERS.items():
            found[kind].extend(check(timeline).findings)
    return BankFindings({kind: tuple(items) for kind, items in found.items()}, owner_of, time.perf_counter() - started)


def findings_of(world_id: str, bank: Bank) -> BankFindings:
    """The kept findings of a demo bank. The first caller pays for the pass; the others wait for it."""
    with _guard:
        lock = _locks.setdefault(world_id, threading.Lock())
    with lock:
        if world_id not in _kept:
            _kept[world_id] = check_bank(bank)
        return _kept[world_id]


def forget(world_id: str) -> None:
    """Call when the bank data of a demo bank has changed or the demo bank is gone."""
    _kept.pop(world_id, None)


def scan(finding_type: str, found: BankFindings, bank: Bank) -> schemas.ScanResult:
    """Everyone with this mistake, and who of them never complained. `elapsed_ms` is
    filled in by the caller."""
    findings = found.by_type[finding_type]
    customers = bank.customers()
    complaint_of: dict[str, str] = {}
    for complaint in bank.complaints():
        complaint_of.setdefault(complaint.customer_id, complaint.id)  # the first complaint of each customer

    items = []
    for finding in findings:
        customer = customers[found.owner_of[finding.contract_id]]
        complaint_id = complaint_of.get(customer.id)
        items.append(schemas.ScanItem(
            contract_id=finding.contract_id, customer_id=customer.id, customer_name=customer.full_name,
            region=customer.region, installment_n=finding.installment_n, amount_excess=finding.amount_excess,
            amount_affected=finding.amount_affected, days_early=finding.days_early,
            complained=complaint_id is not None, complaint_id=complaint_id,
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
        cause=None,  # task A8 names the cause
        items=items,
        elapsed_ms=0,
    )
