"""Cause finder: what the findings of one mistake have in common (PLAN Part 7.5). Task A8.

For every value of every candidate attribute: `support` is the share of the
findings that have it, `base` is the share of all eligible events that have it,
and `lift = support / base`. A value with support of at least 60% and lift of
at least 3 is "concentrated". Code finds the table; words only describe it.

Eligible events, the denominator of `base`: double debit = billing runs ·
early debit = successful automatic debits · late posting = payments · illegal
fee = loans. Date and hour are not separate attributes: every automatic debit
runs at night, so the hour tells nothing, and the billing run already is the
date of a debit.
"""

from collections import Counter
from dataclasses import dataclass, field

from .. import schemas
from ..connector import SUCCESS, ContractData
from .checkers import Finding, double_debit, early_debit, illegal_fee, late_posting
from .fixes import fix_for
from .timeline import Run, Timeline

MIN_FINDINGS = 20  # with fewer, no cause is named: "too few cases for a pattern"
MIN_SUPPORT = 0.6
MIN_LIFT = 3.0

# The attributes a cause may be found in, by mistake type. Event attributes first.
CANDIDATES = {
    double_debit.TYPE: ("batch_run", "cards", "product", "schedule", "tariff", "region"),
    early_debit.TYPE: ("batch_run", "schedule", "cards", "product", "tariff", "region"),
    late_posting.TYPE: ("channel", "product", "schedule", "tariff", "cards", "region"),
    illegal_fee.TYPE: ("tariff", "product", "schedule", "cards", "region"),
}
# What a value means, as part of a sentence: "93% of these cases <phrase>".
PHRASES = {
    "batch_run": "came from billing run {}",
    "cards": "belong to customers with {} cards",
    "schedule": "are on loans whose payment schedule was {}",
    "channel": "were paid through {}",
    "product": "are on {} contracts",
    "tariff": "are on loans signed under tariff {}",
    "region": "are in {}",
}
CASES = {
    double_debit.TYPE: "installments taken twice",
    early_debit.TYPE: "debits taken early",
    late_posting.TYPE: "penalties for payments recorded late",
    illegal_fee.TYPE: "fees not in the contract",
}

Trait = tuple[str, str]  # (attribute, value)


@dataclass(slots=True)
class Profile:
    """How often each attribute value occurs among the eligible events of one mistake type."""

    total: int = 0
    counts: Counter = field(default_factory=Counter)

    def add(self, traits: tuple[Trait, ...], times: int = 1) -> None:
        if times <= 0:
            return
        self.total += times
        for trait in traits:
            self.counts[trait] += times


def contract_traits(data: ContractData, region: str) -> tuple[Trait, ...]:
    """The attributes every event of one loan shares."""
    contract = data.contract
    return (
        ("product", contract.product_name),
        ("region", region),
        ("cards", "2 or more" if len(data.cards) >= 2 else "1"),
        ("schedule", "changed" if contract.schedule_version > 1 else "never changed"),
        ("tariff", f"version {contract.tariff_version}"),
    )


def _run_name(run: Run) -> str:
    first = run.debits[0]
    return first.batch_run_id or f"run of {first.created_at.date().isoformat()}"


def count_eligible(timeline: Timeline, region: str, profiles: dict[str, Profile]) -> None:
    """Adds the eligible events of one loan to the profile of each mistake type."""
    data = timeline.data
    shared = contract_traits(data, region)
    for run in timeline.runs:
        profiles[double_debit.TYPE].add((*shared, ("batch_run", _run_name(run))))
    for debit in data.debits:
        if debit.status == SUCCESS:
            run = debit.batch_run_id or f"run of {debit.created_at.date().isoformat()}"
            profiles[early_debit.TYPE].add((*shared, ("batch_run", run)))
    for payment in data.payments:
        profiles[late_posting.TYPE].add((*shared, ("channel", payment.channel)))
    profiles[illegal_fee.TYPE].add(shared)


def traits_of(finding: Finding, data: ContractData, region: str) -> tuple[Trait, ...]:
    """The attribute values of the event behind one finding."""
    shared = contract_traits(data, region)
    evidence = finding.evidence
    if finding.type in (double_debit.TYPE, early_debit.TYPE) and evidence.debits:
        first = evidence.debits[0]
        run = first.batch_run_id or f"run of {first.created_at.date().isoformat()}"
        return (*shared, ("batch_run", run))
    if finding.type == late_posting.TYPE:
        channels = {payment.channel for payment in evidence.payments}
        return (*shared, ("channel", channels.pop() if len(channels) == 1 else "several channels"))
    return shared


@dataclass(frozen=True, slots=True)
class Concentration:
    name: str
    value: str
    support: float
    lift: float


def concentrated(finding_type: str, traits: list[tuple[Trait, ...]], profile: Profile) -> list[Concentration]:
    """Every attribute value with support >= 60% and lift >= 3, the strongest first."""
    found = Counter(trait for one in traits for trait in one)
    rows = []
    for (name, value), hits in found.items():
        if name not in CANDIDATES[finding_type] or not profile.total:
            continue
        support = hits / len(traits)
        base = profile.counts[(name, value)] / profile.total
        lift = support / base if base else 0.0
        if support >= MIN_SUPPORT and lift >= MIN_LIFT:
            rows.append(Concentration(name, value, support, lift))
    order = CANDIDATES[finding_type]
    rows.sort(key=lambda row: (-row.lift, -row.support, order.index(row.name)))
    return rows


def times(lift: float) -> str:
    """41.2 -> "41 times", 3.46 -> "3.5 times", 4.04 -> "4 times"."""
    shown = f"{lift:.0f}" if lift >= 10 else f"{lift:.1f}".removesuffix(".0")
    return f"{shown} times"


def sentence(finding_type: str, count: int, rows: list[Concentration]) -> str:
    """The cause table in words. The table itself is always shown next to it."""
    if not rows:
        return (
            f"No common cause stands out in these {count} {CASES[finding_type]}: no billing run, channel, "
            "product, tariff, region or card count holds 60% of them at 3 times its normal share."
        )
    parts = []
    for number, row in enumerate(rows[:3]):
        if number == 0:
            who = f"All {count} {CASES[finding_type]}" if row.support == 1 else (
                f"{round(row.support * 100)}% of the {count} {CASES[finding_type]}"
            )
        else:
            who = "All of them" if row.support == 1 else f"{round(row.support * 100)}% of them"
        parts.append(f"{who} {PHRASES[row.name].format(row.value)}, {times(row.lift)} more often than normal.")
    return " ".join(parts)


def find(finding_type: str, traits: list[tuple[Trait, ...]], profile: Profile) -> schemas.Cause | None:
    """The cause of one mistake type in one bank, or None when there are too few findings."""
    if len(traits) < MIN_FINDINGS:
        return None
    rows = concentrated(finding_type, traits, profile)
    return schemas.Cause(
        attributes=[
            schemas.CauseAttribute(name=row.name, value=row.value, support=round(row.support, 4), lift=round(row.lift, 2))
            for row in rows
        ],
        sentence=sentence(finding_type, len(traits), rows),
        suggested_fix=fix_for(finding_type, [row.name for row in rows]),
    )
