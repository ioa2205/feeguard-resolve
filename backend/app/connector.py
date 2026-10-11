"""The only door to bank data. Opens bank.db read-only (CLAUDE.md rule 11). Task A3.

In a real bank only this file changes: it would read the bank's exports or a
read replica and return the same records.
"""

import json
import re
import sqlite3
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

BANK_DB = "bank.db"
SUCCESS, FAILED = "SUCCESS", "FAILED"
# The next installment is at most this far after the world date.
LOOK_AHEAD = timedelta(days=62)


@dataclass(frozen=True, slots=True)
class Installment:
    contract_id: str
    version: int
    n: int
    due_date: date
    principal_due: int
    interest_due: int
    total_due: int


@dataclass(frozen=True, slots=True)
class Debit:
    id: str
    contract_id: str
    card_id: str
    amount: int
    created_at: datetime
    status: str
    batch_run_id: str | None = None
    retry_of: str | None = None
    reversed_by: str | None = None
    reversed_at: datetime | None = None

    @property
    def kept(self) -> bool:
        """The money left the card and was not returned."""
        return self.status == SUCCESS and self.reversed_by is None


@dataclass(frozen=True, slots=True)
class Payment:
    id: str
    contract_id: str
    amount: int
    channel: str
    paid_at: datetime  # the money was received
    posted_at: datetime  # the money was recorded on the loan
    debit_id: str | None = None


@dataclass(frozen=True, slots=True)
class Charge:
    id: str
    contract_id: str
    kind: str
    code: str
    amount: int
    charged_at: datetime
    installment_n: int | None = None


@dataclass(frozen=True, slots=True)
class Card:
    id: str
    network: str
    last4: str
    is_primary: bool

    @property
    def label(self) -> str:
        return f"{self.network} ··{self.last4}"


@dataclass(frozen=True, slots=True)
class Contract:
    id: str
    customer_id: str
    product_code: str
    product_name: str
    branch: str
    principal: int
    term_months: int
    start_date: date
    due_day: int
    schedule_version: int
    schedule_changed_on: date | None
    early_repayment_requested_on: date | None
    tariff_version: int
    allowed_fees: tuple[str, ...]  # fee codes the contract lists


@dataclass(frozen=True, slots=True)
class Customer:
    id: str
    full_name: str
    region: str
    phone_masked: str
    preferred_lang: str


@dataclass(frozen=True, slots=True)
class Complaint:
    id: str
    customer_id: str
    customer_name: str
    contract_id: str | None
    text: str
    lang: str
    channel: str
    created_at: datetime
    source: str


@dataclass(slots=True)
class ContractData:
    """Everything the engine needs about one contract."""

    contract: Contract
    schedule: list[Installment] = field(default_factory=list)  # the version in force
    debits: list[Debit] = field(default_factory=list)
    payments: list[Payment] = field(default_factory=list)
    charges: list[Charge] = field(default_factory=list)
    cards: dict[str, Card] = field(default_factory=dict)


def _day(text: str | None) -> date | None:
    return date.fromisoformat(text) if text else None


def _time(text: str | None) -> datetime | None:
    return datetime.fromisoformat(text) if text else None


class Bank:
    def __init__(self, world_dir: Path) -> None:
        path = (Path(world_dir) / BANK_DB).resolve()
        if not path.is_file():
            raise FileNotFoundError(path)
        self._db = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True, check_same_thread=False)
        # Reading a whole bank is about three times faster with these two (measured, task A3).
        self._db.execute("PRAGMA mmap_size = 1073741824")
        self._db.execute("PRAGMA cache_size = -200000")
        seed, size, as_of = self._db.execute("SELECT seed, size, as_of_date FROM world").fetchone()
        self.seed: int = seed
        self.size: int = size
        self.as_of: date = date.fromisoformat(as_of)

    def close(self) -> None:
        self._db.close()

    def __enter__(self) -> "Bank":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def contract_ids_of(self, customer_id: str) -> list[str]:
        rows = self._db.execute("SELECT id FROM contracts WHERE customer_id = ? ORDER BY id", (customer_id,))
        return [row[0] for row in rows]

    def contract_text(self, contract_id: str) -> str | None:
        row = self._db.execute("SELECT contract_text FROM contracts WHERE id = ?", (contract_id,)).fetchone()
        return row[0] if row else None

    def clauses(self, contract_id: str, numbers: Iterable[str]) -> list[tuple[str, str]]:
        """The numbered clauses of a contract, quoted as written: (number, text)."""
        text = self.contract_text(contract_id) or ""
        found = []
        for number in numbers:
            match = re.search(rf"^{re.escape(number)}\. (.+)$", text, flags=re.MULTILINE)
            if match:
                found.append((number, match.group(1)))
        return found

    _CUSTOMER = "SELECT id, full_name, region, phone_masked, preferred_lang FROM customers"
    _COMPLAINT = """SELECT m.id, m.customer_id, c.full_name, m.contract_id, m.text, m.lang, m.channel,
                           m.created_at, m.source
                    FROM complaints m JOIN customers c ON c.id = m.customer_id"""

    def customer(self, customer_id: str) -> Customer | None:
        row = self._db.execute(f"{self._CUSTOMER} WHERE id = ?", (customer_id,)).fetchone()
        return Customer(*row) if row else None

    def customers(self) -> dict[str, Customer]:
        """Every customer of the bank, by id."""
        return {row[0]: Customer(*row) for row in self._db.execute(self._CUSTOMER)}

    def find_customers(self, search: str, limit: int) -> tuple[list[Customer], int]:
        """Customers whose name or id contains `search`, in id order, and how many there are."""
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where = "WHERE full_name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'"
        args = (f"%{escaped}%", f"%{escaped}%")
        (total,) = self._db.execute(f"SELECT count(*) FROM customers {where}", args).fetchone()
        rows = self._db.execute(f"{self._CUSTOMER} {where} ORDER BY id LIMIT ?", (*args, limit))
        return [Customer(*row) for row in rows], total

    @staticmethod
    def _complaint(row: tuple) -> Complaint:
        return Complaint(*row[:7], datetime.fromisoformat(row[7]), row[8])

    def complaint(self, complaint_id: str) -> Complaint | None:
        row = self._db.execute(f"{self._COMPLAINT} WHERE m.id = ?", (complaint_id,)).fetchone()
        return self._complaint(row) if row else None

    # --- What changed since the last check (DECISIONS D-039) ---------------------
    # The demo bank only adds rows, so the highest row number of each table marks how far
    # a check read. A real bank would give every export row a "changed at" time, so that
    # a changed row (a reversal, a new schedule) is found the same way.
    _CHANGING = {"debits": "contract_id", "payments": "contract_id", "charges": "contract_id", "contracts": "id"}

    def marks(self) -> dict[str, int]:
        """How far each table of money records reaches now, and the bank's date."""
        marks = {table: self._db.execute(f"SELECT coalesce(max(rowid), 0) FROM {table}").fetchone()[0]
                 for table in self._CHANGING}
        marks["as_of"] = self.as_of.toordinal()
        return marks

    def changed_since(self, marks: dict[str, int]) -> set[str]:
        """The loans that got a debit, payment or charge after `marks`, the new loans, and,
        when the bank's date moved on, the loans with an installment that came into view."""
        changed: set[str] = set()
        for table, column in self._CHANGING.items():
            rows = self._db.execute(f"SELECT DISTINCT {column} FROM {table} WHERE rowid > ?", (marks.get(table, 0),))
            changed.update(contract_id for (contract_id,) in rows)
        then = marks.get("as_of", self.as_of.toordinal())
        if then != self.as_of.toordinal():
            low, high = sorted((date.fromordinal(then) + LOOK_AHEAD, self.as_of + LOOK_AHEAD))
            rows = self._db.execute(
                "SELECT DISTINCT contract_id FROM schedule_items WHERE due_date > ? AND due_date <= ?",
                (low.isoformat(), high.isoformat()),
            )
            changed.update(contract_id for (contract_id,) in rows)
        return changed

    def complaints(self) -> list[Complaint]:
        """Every complaint, the oldest first."""
        return [self._complaint(row) for row in self._db.execute(f"{self._COMPLAINT} ORDER BY m.created_at, m.id")]

    def load(self, contract_ids: Iterable[str] | None = None) -> dict[str, ContractData]:
        """Contracts with their schedule in force, debits, payments, charges and cards.
        With no ids: every contract of the bank."""
        if contract_ids is None:
            where, args = "", ()
        else:
            args = tuple(contract_ids)
            if not args:
                return {}
            where = f"WHERE contract_id IN ({', '.join('?' * len(args))})"
        by_id: dict[str, ContractData] = {}

        contracts = self._db.execute(
            f"""SELECT c.id, c.customer_id, c.product_code, p.name, c.branch, c.principal,
                       c.term_months, c.start_date, c.due_day, c.schedule_version,
                       c.schedule_changed_on, c.early_repayment_requested_on, c.tariff_version,
                       p.allowed_fees_json
                FROM contracts c JOIN products p ON p.code = c.product_code
                {where.replace('contract_id', 'c.id')}""",
            args,
        )
        fees_of: dict[str, tuple[str, ...]] = {}
        customers: dict[str, list[ContractData]] = defaultdict(list)
        for row in contracts:
            fees = fees_of.setdefault(row[13], tuple(fee["code"] for fee in json.loads(row[13])))
            data = ContractData(
                Contract(*row[:7], date.fromisoformat(row[7]), row[8], row[9], _day(row[10]), _day(row[11]), row[12], fees)
            )
            by_id[row[0]] = data
            customers[row[1]].append(data)

        horizon = (self.as_of + LOOK_AHEAD).isoformat()
        for row in self._db.execute(
            f"""SELECT s.contract_id, s.version, s.n, s.due_date, s.principal_due, s.interest_due, s.total_due
                FROM schedule_items s JOIN contracts c
                  ON c.id = s.contract_id AND c.schedule_version = s.version
                {where.replace('contract_id', 's.contract_id')} {'AND' if where else 'WHERE'} s.due_date <= ?
                ORDER BY s.contract_id, s.n""",
            (*args, horizon),
        ):
            by_id[row[0]].schedule.append(Installment(row[0], row[1], row[2], date.fromisoformat(row[3]), *row[4:]))

        for row in self._db.execute(
            f"""SELECT id, contract_id, card_id, amount, created_at, status, batch_run_id, retry_of,
                       reversed_by, reversed_at
                FROM debits {where} ORDER BY created_at, id""",
            args,
        ):
            by_id[row[1]].debits.append(Debit(*row[:4], datetime.fromisoformat(row[4]), *row[5:9], _time(row[9])))

        for row in self._db.execute(
            f"SELECT id, contract_id, amount, channel, paid_at, posted_at, debit_id FROM payments {where} ORDER BY paid_at, id",
            args,
        ):
            by_id[row[1]].payments.append(
                Payment(*row[:4], datetime.fromisoformat(row[4]), datetime.fromisoformat(row[5]), row[6])
            )

        for row in self._db.execute(
            f"SELECT id, contract_id, kind, code, amount, charged_at, installment_n FROM charges {where} ORDER BY charged_at, id",
            args,
        ):
            by_id[row[1]].charges.append(Charge(*row[:5], datetime.fromisoformat(row[5]), row[6]))

        owners = tuple(customers)
        if not owners:
            return by_id
        if contract_ids is None:
            cards = self._db.execute("SELECT id, customer_id, network, last4, is_primary FROM cards")
        else:
            cards = self._db.execute(
                f"SELECT id, customer_id, network, last4, is_primary FROM cards WHERE customer_id IN ({', '.join('?' * len(owners))})",
                owners,
            )
        for card_id, customer_id, network, last4, is_primary in cards:
            for data in customers.get(customer_id, ()):
                data.cards[card_id] = Card(card_id, network, last4, bool(is_primary))
        return by_id
