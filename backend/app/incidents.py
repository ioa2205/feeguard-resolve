"""Incidents: one mistake that hit two or more customers, handled once (DECISIONS D-040).

A check of the bank opens an incident for every mistake type that hit at least two
customers, before or without any complaint. Every later complaint with that
mistake is linked to it instead of starting from zero. One person proposes the
refund, another approves it (four eyes), and then every affected customer gets a
message in their own language, also the ones who never complained. The numbers
come from the kept bank-wide findings; nothing here reads the bank again.
"""

import json
import sqlite3
from collections import defaultdict

from . import db, schemas
from .ai.drafts import money
from .connector import Bank
from .engine import scan as scanning
from .engine.checkers import double_debit, early_debit, illegal_fee, late_posting
from .errors import ApiError

TYPES = (double_debit.TYPE, early_debit.TYPE, late_posting.TYPE, illegal_fee.TYPE)
PROPOSERS = ("officer", "jury")
APPROVERS = ("compliance", "jury")
_COLUMNS = "id, finding_type, opened_at, opened_by_run, opened_by, customers_seen, proposed_by, proposed_at, approved_by, approved_at"


def incident_id(finding_type: str) -> str:
    return f"INC-{finding_type.replace('_', '-')}"


def type_of(incident: str) -> str | None:
    return next((kind for kind in TYPES if incident_id(kind) == incident), None)


# --- Who is affected, from the kept findings --------------------------------


def affected(found: scanning.BankFindings, finding_type: str) -> dict[str, dict]:
    """Customer id -> their loans and money for one mistake type."""
    people: dict[str, dict] = defaultdict(lambda: {"contracts": [], "excess": 0, "affected": 0})
    for finding in found.by_type.get(finding_type, ()):
        person = people[found.owner_of[finding.contract_id]]
        if finding.contract_id not in person["contracts"]:
            person["contracts"].append(finding.contract_id)
        person["excess"] += finding.amount_excess
        person["affected"] += finding.amount_affected
    return dict(people)


def _amount(finding_type: str, person: dict) -> int:
    """What the customer is owed; for an early debit, what was taken early."""
    return person["affected"] if finding_type == early_debit.TYPE else person["excess"]


# --- Opened and grown by a check ---------------------------------------------


def sync(store: sqlite3.Connection, found: scanning.BankFindings, run_id: str, trigger: str) -> tuple[list[str], list[str]]:
    """Opens an incident for every mistake type that now hits two or more customers, and
    notes which open incidents grew. Returns (opened, grown)."""
    opened, grown = [], []
    for kind in TYPES:
        people = affected(found, kind)
        if len(people) < scanning.SYSTEMIC_FROM:
            continue
        key = incident_id(kind)
        row = store.execute("SELECT customers_seen FROM incidents WHERE id = ?", (key,)).fetchone()
        if row is None:
            store.execute(
                f"INSERT INTO incidents ({_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)",
                (key, kind, db.now(), run_id, trigger, len(people)),
            )
            opened.append(key)
        elif len(people) != row[0]:
            store.execute("UPDATE incidents SET customers_seen = ? WHERE id = ?", (len(people), key))
            if len(people) > row[0]:
                grown.append(key)
    return opened, grown


# --- Reading an incident ----------------------------------------------------------
# Per customer the store keeps three amounts: proposed, approved and told. A customer
# waits while the bank owes them more than was approved; a proposal waits while it
# holds more than was approved; a message is due while more was approved than told.
# So a refund approves exactly what was proposed, a customer found later gets a new
# proposal, and a customer owed more later gets one more message, for the difference.


def _row(store: sqlite3.Connection, key: str) -> dict | None:
    row = store.execute(f"SELECT {_COLUMNS} FROM incidents WHERE id = ?", (key,)).fetchone()
    return dict(zip(_COLUMNS.split(", "), row)) if row else None


def _ledger(store: sqlite3.Connection, key: str) -> dict[str, tuple[int, int, int]]:
    """Customer id -> (proposed, approved, told) amounts."""
    rows = store.execute(
        "SELECT customer_id, proposed_amount, approved_amount, notified_amount FROM incident_customers WHERE incident_id = ?",
        (key,),
    )
    return {customer: (proposed, approved, told) for customer, proposed, approved, told in rows}


def _owed(finding_type: str, people: dict[str, dict]) -> dict[str, int]:
    return {customer: _amount(finding_type, person) for customer, person in people.items()}


def _counts(owed: dict[str, int], ledger: dict[str, tuple[int, int, int]]) -> dict[str, int]:
    nothing = (0, 0, 0)
    return {
        "approved": sum(1 for customer in owed if ledger.get(customer, nothing)[1] > 0),
        "told": sum(1 for customer in owed if 0 < ledger.get(customer, nothing)[1] <= ledger.get(customer, nothing)[2]),
        "waiting": sum(1 for customer, amount in owed.items() if amount > ledger.get(customer, nothing)[1]),
        "unproposed": sum(1 for customer, amount in owed.items() if amount > max(ledger.get(customer, nothing)[:2])),
        "pending": sum(1 for proposed, approved, _ in ledger.values() if proposed > approved),
        "untold": sum(1 for _, approved, told in ledger.values() if approved > told),
    }


def _status(counts: dict[str, int]) -> str:
    if counts["pending"]:
        return "PROPOSED"
    if counts["waiting"]:
        return "OPEN"
    if counts["approved"]:
        return "APPROVED" if counts["untold"] else "NOTIFIED"
    return "OPEN"


def _complaints_checked(store: sqlite3.Connection, finding_type: str) -> int:
    (count,) = store.execute(
        "SELECT count(DISTINCT case_id) FROM findings WHERE type = ? AND case_id IS NOT NULL", (finding_type,)
    ).fetchone()
    return count


def build(store: sqlite3.Connection, row: dict, found: scanning.BankFindings, bank: Bank):
    """The incident as it stands, the affected people, and the scan items by customer."""
    kind = row["finding_type"]
    scan = scanning.scan(kind, found, bank)
    people = affected(found, kind)
    counts = _counts(_owed(kind, people), _ledger(store, row["id"]))
    incident = schemas.Incident(
        incident_id=row["id"], finding_type=kind, status=_status(counts),
        opened_at=row["opened_at"], opened_by_run=row["opened_by_run"], opened_by=row["opened_by"],
        customers=len(people), contracts=scan.affected_contracts, complained=scan.complained, silent=scan.silent,
        total_excess=scan.total_excess, total_affected=scan.total_affected, cause=scan.cause,
        complaints_checked=_complaints_checked(store, kind),
        proposed_by=row["proposed_by"], proposed_at=row["proposed_at"],
        approved_by=row["approved_by"], approved_at=row["approved_at"],
        approved_customers=counts["approved"], notified_customers=counts["told"], waiting_customers=counts["waiting"],
    )
    return incident, people, {item.customer_id: item for item in scan.items}


def all_incidents(store: sqlite3.Connection, found: scanning.BankFindings, bank: Bank) -> list[schemas.Incident]:
    rows = [_row(store, key) for (key,) in store.execute("SELECT id FROM incidents ORDER BY opened_at, id")]
    return [build(store, row, found, bank)[0] for row in rows if row]


def known(store: sqlite3.Connection) -> set[str]:
    """The incidents open right now. Read before a complaint is checked, to tell "known before"."""
    return {key for (key,) in store.execute("SELECT id FROM incidents")}


def detail(store: sqlite3.Connection, key: str, found: scanning.BankFindings, bank: Bank) -> schemas.IncidentDetail:
    row = _row(store, key)
    if not row:
        raise ApiError(404, "NOT_FOUND", "There is no incident with this id.")
    incident, people, items = build(store, row, found, bank)
    ledger = _ledger(store, key)
    owed = _owed(row["finding_type"], people)
    customers = []
    for customer_id, person in sorted(people.items(), key=lambda pair: (not items[pair[0]].complained, pair[0])):
        item = items[customer_id]
        _, approved, told = ledger.get(customer_id, (0, 0, 0))
        customers.append(schemas.IncidentCustomer(
            customer_id=customer_id, customer_name=item.customer_name, region=item.region,
            contracts=person["contracts"], amount_excess=person["excess"], amount_affected=person["affected"],
            complained=item.complained, complaint_id=item.complaint_id,
            approved=approved >= owed[customer_id] > 0, notified=told >= owed[customer_id] > 0,
        ))
    return schemas.IncidentDetail(incident=incident, customers=customers)


def links(store: sqlite3.Connection, found: scanning.BankFindings | None, bank: Bank, finding_types: list[str],
          known_before: set[str]) -> list[schemas.IncidentLink]:
    """The incidents of a case's mistake types. `known_before`: the incidents open before the check."""
    if found is None:
        return []
    result = []
    for kind in dict.fromkeys(finding_types):
        row = _row(store, incident_id(kind))
        if not row:
            continue
        incident = build(store, row, found, bank)[0]
        result.append(schemas.IncidentLink(
            incident_id=incident.incident_id, finding_type=kind, status=incident.status,
            known_before=incident.incident_id in known_before, opened_at=incident.opened_at, opened_by=incident.opened_by,
            customers=incident.customers, silent=incident.silent, total_excess=incident.total_excess,
            cause_sentence=incident.cause.sentence if incident.cause else None,
            cause_sentence_t=incident.cause.sentence_t if incident.cause else None,
        ))
    return result


# --- Four eyes and the messages to customers -------------------------------


def _found_row(store: sqlite3.Connection, key: str) -> dict:
    row = _row(store, key)
    if not row:
        raise ApiError(404, "NOT_FOUND", "There is no incident with this id.")
    return row


def propose(store: sqlite3.Connection, key: str, actor: str, found: scanning.BankFindings, bank: Bank) -> schemas.Incident:
    """Puts every customer the bank owes more than approved or proposed into the proposal."""
    row = _found_row(store, key)
    if actor not in PROPOSERS:
        raise ApiError(409, "WRONG_ROLE", "A complaint officer proposes the refund; the compliance head approves it.")
    owed = _owed(row["finding_type"], affected(found, row["finding_type"]))
    ledger = _ledger(store, key)
    new = {customer: amount for customer, amount in owed.items() if amount > max(ledger.get(customer, (0, 0, 0))[:2])}
    if not new:
        if _counts(owed, ledger)["pending"]:
            raise ApiError(409, "ALREADY_PROPOSED", "The refund is proposed already. The compliance head approves it next.")
        raise ApiError(409, "NOTHING_WAITING", "Every affected customer is already in an approved refund.")
    for customer, amount in new.items():
        store.execute(
            "INSERT INTO incident_customers (incident_id, customer_id, proposed_amount) VALUES (?, ?, ?) "
            "ON CONFLICT (incident_id, customer_id) DO UPDATE SET proposed_amount = excluded.proposed_amount",
            (key, customer, amount),
        )
    store.execute("UPDATE incidents SET proposed_by = ?, proposed_at = ? WHERE id = ?", (actor, db.now(), key))
    return build(store, _row(store, key), found, bank)[0]


def approve(store: sqlite3.Connection, key: str, actor: str, found: scanning.BankFindings, bank: Bank) -> schemas.Incident:
    """Approves exactly what was proposed. The person who proposed it cannot."""
    row = _found_row(store, key)
    if not any(proposed > approved for proposed, approved, _ in _ledger(store, key).values()):
        raise ApiError(409, "NOT_PROPOSED", "A complaint officer must propose the refund first.")
    if actor not in APPROVERS:
        raise ApiError(409, "WRONG_ROLE", "Only the compliance head approves a refund.")
    if actor == row["proposed_by"]:
        raise ApiError(409, "FOUR_EYES", "The person who proposed the refund cannot approve it. Switch to the compliance head.")
    at = db.now()
    store.execute(
        "UPDATE incident_customers SET approved_amount = proposed_amount, approved_at = ? "
        "WHERE incident_id = ? AND proposed_amount > approved_amount", (at, key),
    )
    store.execute("UPDATE incidents SET approved_by = ?, approved_at = ? WHERE id = ?", (actor, at, key))
    return build(store, _row(store, key), found, bank)[0]


def notify(store: sqlite3.Connection, key: str, found: scanning.BankFindings, bank: Bank) -> tuple[schemas.Incident, int]:
    """Tells every customer what was approved for them and not told yet."""
    row = _found_row(store, key)
    kind = row["finding_type"]
    due = store.execute(
        "SELECT customer_id, approved_amount - notified_amount FROM incident_customers "
        "WHERE incident_id = ? AND approved_amount > notified_amount ORDER BY customer_id", (key,),
    ).fetchall()
    if not due:
        raise ApiError(409, "NOTHING_TO_SEND", "No approved customer is waiting for a message. Approve the refund first.")
    people = affected(found, kind)
    at = db.now()
    for customer_id, amount in due:
        customer = found.people.get(customer_id) or bank.customer(customer_id)
        lang = customer.preferred_lang if customer and customer.preferred_lang in NOTICE else "uz_latn"
        loans = people.get(customer_id, {}).get("contracts") or ["—"]
        text = NOTICE[lang][kind].format(name=customer.full_name if customer else "", loan=", ".join(loans),
                                         amount=money(amount, lang))
        store.execute(
            "INSERT INTO notices (customer_id, incident_id, finding_type, contract_id, lang, text, amount, at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (customer_id, key, kind, loans[0], lang, text, amount, at),
        )
    store.execute(
        "UPDATE incident_customers SET notified_amount = approved_amount, notified_at = ? "
        "WHERE incident_id = ? AND approved_amount > notified_amount", (at, key),
    )
    return build(store, _row(store, key), found, bank)[0], len(due)


def notices_of(store: sqlite3.Connection, customer_id: str) -> list[schemas.StatementMessage]:
    rows = store.execute(
        "SELECT at, contract_id, amount, finding_type, text, lang FROM notices WHERE customer_id = ? ORDER BY id",
        (customer_id,),
    )
    return [
        schemas.StatementMessage(at=at, kind="NOTICE", contract_id=contract_id, card=None, channel=None, charge_name=None,
                                 amount=amount, finding_type=kind, text=text, text_lang=lang)
        for at, contract_id, amount, kind, text, lang in rows
    ]


def confirmed_types(store: sqlite3.Connection) -> set[str]:
    """Mistake types whose refund a person approved on an incident."""
    return {kind for (kind,) in store.execute("SELECT finding_type FROM incidents WHERE approved_at IS NOT NULL")}


# The message to each affected customer, in their language. No deadline is promised:
# the bank sets it (CLAUDE.md rule 14). No AI writes it, so 1,000 messages cost nothing.
NOTICE = {
    "uz_latn": {
        double_debit.TYPE: (
            "Hurmatli {name}! Bank oʻz tekshiruvida {loan} kreditingiz boʻyicha toʻlov kartangizdan ikki marta "
            "yechilganini aniqladi. Ortiqcha olingan {amount} kartangizga qaytariladi. Buning uchun shikoyat "
            "yozishingiz shart emas. Noqulaylik uchun uzr soʻraymiz. Sandbox Bank"
        ),
        early_debit.TYPE: (
            "Hurmatli {name}! Bank oʻz tekshiruvida {loan} kreditingiz boʻyicha {amount} toʻlov muddatidan oldin "
            "yechilganini aniqladi. Yechish sanalari tuzatiladi. Buning uchun shikoyat yozishingiz shart emas. "
            "Noqulaylik uchun uzr soʻraymiz. Sandbox Bank"
        ),
        late_posting.TYPE: (
            "Hurmatli {name}! Bank oʻz tekshiruvida {loan} kreditingiz boʻyicha toʻlovingiz oʻz vaqtida qilingan, "
            "lekin kech qayd etilganini aniqladi. Shu sababli olingan {amount} jarima qaytariladi. Buning uchun "
            "shikoyat yozishingiz shart emas. Noqulaylik uchun uzr soʻraymiz. Sandbox Bank"
        ),
        illegal_fee.TYPE: (
            "Hurmatli {name}! Bank oʻz tekshiruvida {loan} kreditingiz boʻyicha shartnomada koʻzda tutilmagan "
            "{amount} komissiya olinganini aniqladi. Bu summa qaytariladi. Buning uchun shikoyat yozishingiz shart "
            "emas. Noqulaylik uchun uzr soʻraymiz. Sandbox Bank"
        ),
    },
    "uz_cyrl": {
        double_debit.TYPE: (
            "Ҳурматли {name}! Банк ўз текширувида {loan} кредитингиз бўйича тўлов картангиздан икки марта "
            "ечилганини аниқлади. Ортиқча олинган {amount} картангизга қайтарилади. Бунинг учун шикоят "
            "ёзишингиз шарт эмас. Ноқулайлик учун узр сўраймиз. Sandbox Bank"
        ),
        early_debit.TYPE: (
            "Ҳурматли {name}! Банк ўз текширувида {loan} кредитингиз бўйича {amount} тўлов муддатидан олдин "
            "ечилганини аниқлади. Ечиш саналари тузатилади. Бунинг учун шикоят ёзишингиз шарт эмас. "
            "Ноқулайлик учун узр сўраймиз. Sandbox Bank"
        ),
        late_posting.TYPE: (
            "Ҳурматли {name}! Банк ўз текширувида {loan} кредитингиз бўйича тўловингиз ўз вақтида қилинган, "
            "лекин кеч қайд этилганини аниқлади. Шу сабабли олинган {amount} жарима қайтарилади. Бунинг учун "
            "шикоят ёзишингиз шарт эмас. Ноқулайлик учун узр сўраймиз. Sandbox Bank"
        ),
        illegal_fee.TYPE: (
            "Ҳурматли {name}! Банк ўз текширувида {loan} кредитингиз бўйича шартномада кўзда тутилмаган "
            "{amount} комиссия олинганини аниқлади. Бу сумма қайтарилади. Бунинг учун шикоят ёзишингиз шарт "
            "эмас. Ноқулайлик учун узр сўраймиз. Sandbox Bank"
        ),
    },
    "ru": {
        double_debit.TYPE: (
            "Уважаемый(ая) {name}! При собственной проверке банк обнаружил, что платёж по кредиту {loan} был "
            "списан с вашей карты дважды. Лишние {amount} будут возвращены на вашу карту. Писать жалобу не нужно. "
            "Приносим извинения за неудобства. Sandbox Bank"
        ),
        early_debit.TYPE: (
            "Уважаемый(ая) {name}! При собственной проверке банк обнаружил, что по кредиту {loan} {amount} были "
            "списаны раньше срока. Даты списаний будут исправлены. Писать жалобу не нужно. Приносим извинения за "
            "неудобства. Sandbox Bank"
        ),
        late_posting.TYPE: (
            "Уважаемый(ая) {name}! При собственной проверке банк обнаружил, что ваш платёж по кредиту {loan} был "
            "внесён вовремя, но зачислен поздно. Начисленный из-за этого штраф {amount} будет возвращён. Писать "
            "жалобу не нужно. Приносим извинения за неудобства. Sandbox Bank"
        ),
        illegal_fee.TYPE: (
            "Уважаемый(ая) {name}! При собственной проверке банк обнаружил, что по кредиту {loan} была удержана "
            "комиссия {amount}, которой нет в договоре. Эта сумма будет возвращена. Писать жалобу не нужно. "
            "Приносим извинения за неудобства. Sandbox Bank"
        ),
    },
}


def run_row(row: tuple) -> schemas.CheckRun:
    (run_id, at, trigger, scope, loans_read, loans_total, new, gone, ms, opened, grown) = row
    return schemas.CheckRun(
        run_id=run_id, at=at, trigger=trigger, scope=scope, loans_read=loans_read, loans_total=loans_total,
        new_findings=new, gone_findings=gone, elapsed_ms=ms, incidents_opened=json.loads(opened),
        incidents_grown=json.loads(grown),
    )
