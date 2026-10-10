"""Products, contracts and contract texts. Task A1."""

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from random import Random

from .customers import Customer, Weighted
from .schedules import Row, build_schedule, move_due_day

AUTO = "AUTO"  # the payment is taken from the card automatically
DUE_DAYS = (5, 10, 15, 20, 25)
HISTORY_MONTHS = 15
PENALTY_BP_DAILY = 10  # 0.1% of the overdue amount for each day

# Fees a contract may list: code -> (English name, Uzbek wording for the contract, amount).
ALLOWED_FEES = {
    "CARD_REISSUE": ("Card reissue fee", "bank kartasini qayta chiqarish uchun haq", 25_000),
}
FEE_NAMES = {code: name for code, (name, _, _) in ALLOWED_FEES.items()} | {
    "LOAN_ISSUANCE": "Loan issuance fee",
    "LATE_PAYMENT": "Late payment penalty",
}


@dataclass(frozen=True)
class Product:
    code: str
    name: str
    name_uz: str
    annual_bp: int
    weight: int  # share of contracts, in per cent
    principal: tuple[int, int, int]  # lowest, highest, step
    terms: tuple[int, ...]


PRODUCTS = (
    Product("CONS", "Consumer loan", "Isteʼmol krediti", 2800, 40, (5_000_000, 50_000_000, 500_000), (12, 18, 24, 36)),
    Product("MICRO", "Microloan", "Mikroqarz", 3400, 22, (3_000_000, 20_000_000, 500_000), (12, 18, 24)),
    Product("AUTO", "Car loan", "Avtokredit", 2600, 16, (60_000_000, 250_000_000, 5_000_000), (24, 36)),
    Product("HOME", "Home repair loan", "Uy-joy taʼmiri krediti", 2500, 12, (10_000_000, 80_000_000, 1_000_000), (24, 36)),
    Product("EDU", "Education loan", "Taʼlim krediti", 2200, 10, (5_000_000, 40_000_000, 500_000), (12, 24, 36)),
)
# How the customer pays. PAYNET is about 15% of payments.
MODES = ((AUTO, 70), ("PAYNET", 15), ("CLICK", 8), ("APP", 5), ("BRANCH", 2))

MONTHS_UZ = (
    "yanvar", "fevral", "mart", "aprel", "may", "iyun",
    "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
)
_TEMPLATE = (Path(__file__).parent / "templates" / "contract_uz.txt").read_text(encoding="utf-8")


@dataclass(slots=True)
class Contract:
    idx: int
    id: str
    customer: Customer
    product: Product
    principal: int
    term: int
    start: date
    due_day: int
    mode: str
    schedule: list[Row]  # the version in force
    due_count: int  # installments due on or before the world date
    schedule_v1: list[Row] | None = None  # the first version, when the schedule was changed
    changed_on: date | None = None
    change_from_n: int = 0
    early_n: int = 0  # the installment the customer asked to pay early, if any
    early_debit_day: date | None = None
    early_requested_on: date | None = None
    reissue_on: date | None = None
    tariff_version: int = 1

    @property
    def schedule_version(self) -> int:
        return 2 if self.schedule_v1 else 1

    @property
    def monthly_payment(self) -> int:
        return self.schedule[0][4]


def make_contracts(rng: Random, customers: list[Customer], owner_of: list[int], as_of: date) -> list[Contract]:
    products, modes = Weighted(tuple((p, p.weight) for p in PRODUCTS)), Weighted(MODES)
    first_month = as_of.year * 12 + as_of.month - 1 - HISTORY_MONTHS

    contracts: list[Contract] = []
    for idx, owner in enumerate(owner_of):
        product: Product = products.pick(rng)
        low, high, step = product.principal
        principal = low + step * rng.randrange((high - low) // step + 1)
        term = rng.choice(product.terms)
        month = first_month + rng.randrange(HISTORY_MONTHS)
        due_day = rng.choice(DUE_DAYS)
        start = date(month // 12, month % 12 + 1, due_day)
        mode = modes.pick(rng)
        schedule = build_schedule(principal, product.annual_bp, term, start, due_day)
        due_count = sum(1 for row in schedule if row[1] <= as_of)
        contract = Contract(
            idx, f"L-{idx + 1:05d}", customers[owner], product, principal, term, start, due_day,
            mode, schedule, due_count,
        )

        if mode == AUTO and due_day <= 15 and due_count >= 4 and rng.random() < 0.16:
            # The schedule was changed: a later due day from some installment on.
            moved = min(rng.randrange(2, 7), due_count - 1)
            contract.change_from_n = due_count - moved + 1
            previous_due = schedule[contract.change_from_n - 2][1]
            contract.changed_on = previous_due + timedelta(days=rng.randrange(3, 9))
            contract.schedule_v1 = schedule
            contract.schedule = move_due_day(
                schedule, start, contract.change_from_n, due_day + rng.choice((5, 10))
            )
        elif mode == AUTO and due_count >= 3 and rng.random() < 0.015:
            # The customer asked to pay one installment early.
            contract.early_n = rng.randrange(2, due_count + 1)
            contract.early_debit_day = schedule[contract.early_n - 1][1] - timedelta(days=rng.randrange(3, 13))
            contract.early_requested_on = contract.early_debit_day - timedelta(days=1)

        if rng.random() < 0.02:
            contract.reissue_on = start + timedelta(days=rng.randrange(10, max(11, (as_of - start).days)))
        contracts.append(contract)
    return contracts


def spaced(amount: int) -> str:
    return f"{amount:,}".replace(",", " ")


def date_uz(day: date) -> str:
    return f"{day.year}-yil {day.day}-{MONTHS_UZ[day.month - 1]}"


def render_contract(contract: Contract) -> str:
    fees = "; ".join(f"{wording} — {spaced(amount)} soʻm" for _, wording, amount in ALLOWED_FEES.values())
    rate = contract.product.annual_bp
    return _TEMPLATE.format(
        product_name=contract.product.name_uz,
        contract_id=contract.id,
        branch=f"{contract.customer.region}, {contract.customer.branch}",
        start_date=date_uz(contract.start),
        full_name=contract.customer.full_name,
        principal=spaced(contract.principal),
        term_months=contract.term,
        annual_rate=f"{rate // 100}" if rate % 100 == 0 else f"{rate // 100},{rate % 100:02d}",
        monthly_payment=spaced(contract.monthly_payment),
        fees=fees,
        due_day=contract.schedule[-1][1].day,
        penalty_rate=f"0,{PENALTY_BP_DAILY // 10}",
    )
