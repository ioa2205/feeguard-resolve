"""FeeGuard API: JSON and CSV only. It never serves a page (PLAN Part 12).

Task M0.2 froze every path of PLAN Part 10 here. A path that is not built yet
answers 501 and names the task that builds it.
"""

import logging
import os
import sqlite3
import threading
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from typing import Annotated, NoReturn

from fastapi import Depends, FastAPI, Header, Path, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import audit, db, schemas
from .ai import llm, parse_complaint
from .connector import Bank
from .engine import investigate as investigation
from .engine import scan as scanning
from .engine.wording import charge_name
from .errors import ApiError
from .generator import complaints as sandbox_complaints
from .generator import world
from .reports import exports
from .schemas import (
    DEFAULT_WORLD_ID,
    ActionPlan,
    ActionPlanRow,
    ActionPlanUpdate,
    Actor,
    AuditLog,
    CaseResult,
    ComplaintCreate,
    ComplaintCreated,
    ComplaintList,
    ComplaintStatus,
    CustomerList,
    CustomerStatement,
    Decision,
    DecisionRequest,
    DefectType,
    DraftReply,
    ErrorResponse,
    Health,
    QuarterlyReport,
    Reveal,
    ScanResult,
    Scoreboard,
    TamperRequest,
    TamperResult,
    World,
    WorldCreate,
    WorldCreated,
    WorldList,
)

DEFAULT_WORLD_SEED = 2026
DECIDED = {"CONFIRM": "CONFIRMED", "DISMISS": "DISMISSED", "CORRECT": "CORRECTED"}

log = logging.getLogger(__name__)


def _warm(world_id: str) -> None:
    """Runs the four checks over a whole demo bank once, so the first "Find others" is fast."""
    if os.environ.get("SCAN_WARM_UP", "1") == "0":
        return
    try:
        with Bank(db.worlds_dir() / world_id) as bank:
            found = scanning.findings_of(world_id, bank)
        log.info("demo bank %s checked in %.1f s", world_id, found.seconds)
    except Exception:
        log.exception("could not check demo bank %s ahead of time", world_id)


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    # The default demo bank is built once, in the background, when it is missing.
    # DEFAULT_WORLD_SIZE=5000 gives a smaller one on a small machine; 0 builds none.
    size = int(os.environ.get("DEFAULT_WORLD_SIZE", "20000"))
    if world.get_world(DEFAULT_WORLD_ID):
        threading.Thread(target=_warm, args=(DEFAULT_WORLD_ID,), daemon=True).start()
    elif size:
        world.start_build(world.Settings(seed=DEFAULT_WORLD_SEED, size=size), DEFAULT_WORLD_ID, on_ready=_warm)
    yield


app = FastAPI(
    title="FeeGuard Resolve API",
    version="0.1.0",
    lifespan=_lifespan,
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url=None,
    responses={status: {"model": ErrorResponse} for status in (400, 404, 409, 429)},
)

_CODES = {400: "BAD_REQUEST", 404: "NOT_FOUND", 409: "CONFLICT", 429: "TOO_MANY_REQUESTS"}


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


@app.exception_handler(ApiError)
async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
    return _error(exc.status, exc.code, exc.message)


@app.exception_handler(StarletteHTTPException)
async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return _error(exc.status_code, _CODES.get(exc.status_code, "ERROR"), str(exc.detail))


@app.exception_handler(RequestValidationError)
async def _invalid_request(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Only the place and the reason. The input is never echoed back.
    first = exc.errors()[0]
    where = ".".join(str(part) for part in first["loc"])
    return _error(400, "INVALID_REQUEST", f"{where}: {first['msg']}")


# A world id becomes a folder name, so it is letters, digits and hyphens only.
WORLD_ID = r"^[a-z0-9-]{1,40}$"
WorldPath = Annotated[str, Path(pattern=WORLD_ID)]


def _world(x_world_id: Annotated[str, Header(pattern=WORLD_ID)] = DEFAULT_WORLD_ID) -> str:
    return x_world_id


def _actor(x_actor: Annotated[Actor, Header()] = "officer") -> Actor:
    return x_actor


WorldId = Annotated[str, Depends(_world)]
ActingAs = Annotated[Actor, Depends(_actor)]


def _not_built(task: str) -> NoReturn:
    raise ApiError(501, "NOT_BUILT", f"Not built yet. Task {task} builds it.")


def _no_demo_bank(world_id: str) -> NoReturn:
    state = world.get_world(world_id)
    if state and state["status"] == "building":
        raise ApiError(409, "BUILDING", "This demo bank is still being built. Try again in a moment.") from None
    raise ApiError(404, "NO_DEMO_BANK", "There is no demo bank with this id.") from None


def _bank(world_id: str) -> Bank:
    """The bank data of a demo bank, read-only. Close it after use."""
    try:
        return Bank(db.worlds_dir() / world_id)
    except FileNotFoundError:
        _no_demo_bank(world_id)


@contextmanager
def _store(world_id: str) -> Iterator[sqlite3.Connection]:
    """FeeGuard's own records of a demo bank. Saved when the block ends without an error."""
    if not (db.worlds_dir() / world_id).is_dir():
        _no_demo_bank(world_id)
    store = db.open_feeguard(world_id)
    try:
        with store:
            yield store
    finally:
        store.close()


def _complaint_shape(complaint, states: dict) -> schemas.Complaint:
    verdict, action = states.get(complaint.id, (None, None))
    return schemas.Complaint(
        complaint_id=complaint.id, customer_id=complaint.customer_id, customer_name=complaint.customer_name,
        contract_id=complaint.contract_id, text=complaint.text, lang=complaint.lang, channel=complaint.channel,
        created_at=complaint.created_at, source=complaint.source,
        status=DECIDED[action] if action else ("CHECKED" if verdict else "NEW"),
        answer_due=None,  # the deadline is not verified yet (DECISIONS, legal fact b)
        verdict=verdict,
    )


def _customer_shape(customer) -> schemas.Customer:
    return schemas.Customer(
        customer_id=customer.id, full_name=customer.full_name, region=customer.region,
        phone_masked=customer.phone_masked, preferred_lang=customer.preferred_lang,
    )


@app.get("/api/health", response_model=Health)
def health() -> Health:
    # "rules" whenever no local model is set up or it does not answer. Never hidden.
    llm_mode, model_name = llm.status()
    return Health(db="ok" if db.storage_ready() else "error", llm_mode=llm_mode, model_name=model_name)


# --- Sandbox Bank: demo banks --------------------------------------------


@app.post("/api/worlds", response_model=WorldCreated)
def create_world(body: WorldCreate, actor: ActingAs) -> WorldCreated:
    """Returns at once. The demo bank is built in the background, one at a time."""
    settings = world.Settings(
        seed=body.seed, size=body.size, defects=dict(body.defects),
        complaint_rate=body.complaint_rate, traps=body.traps, surprise=body.surprise,
    )
    try:
        return WorldCreated(world_id=world.start_build(settings, on_ready=_warm))
    except world.Busy:
        raise ApiError(429, "BUSY", "Another demo bank is being built. Try again in a moment.") from None


@app.get("/api/worlds", response_model=WorldList)
def list_worlds() -> WorldList:
    return WorldList(items=world.list_worlds())


@app.get("/api/worlds/{world_id}", response_model=World)
def get_world(world_id: WorldPath) -> World:
    found = world.get_world(world_id)
    if not found:
        raise ApiError(404, "NOT_FOUND", "There is no demo bank with this id.")
    return World(**found)


@app.post("/api/worlds/{world_id}/tamper", response_model=TamperResult)
def tamper(world_id: WorldPath, body: TamperRequest, actor: ActingAs) -> TamperResult:
    _not_built("A10")


@app.get("/api/customers", response_model=CustomerList)
def search_customers(
    world: WorldId,
    search: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> CustomerList:
    with _bank(world) as bank:
        found, total = bank.find_customers(search, limit)
    return CustomerList(items=[_customer_shape(customer) for customer in found], total=total)


@app.get("/api/customers/{customer_id}/statement", response_model=CustomerStatement)
def customer_statement(customer_id: str, world: WorldId) -> CustomerStatement:
    """What one customer saw from the bank, oldest first."""
    with _bank(world) as bank:
        customer = bank.customer(customer_id)
        if not customer:
            raise ApiError(404, "NOT_FOUND", "The bank has no customer with this id.")
        loans = bank.load(bank.contract_ids_of(customer_id))

    cards: dict = {}
    contracts, messages = [], []
    for data in loans.values():
        contract = data.contract
        cards.update(data.cards)
        contracts.append(schemas.ContractSummary(
            contract_id=contract.id, product_code=contract.product_code, product_name=contract.product_name,
            principal=contract.principal, monthly_payment=data.schedule[0].total_due if data.schedule else 0,
            due_day=contract.due_day, start_date=contract.start_date, term_months=contract.term_months,
        ))

        def message(at, kind, amount, card=None, channel=None, name=None, contract_id=contract.id):
            messages.append(schemas.StatementMessage(
                at=at, kind=kind, contract_id=contract_id, card=card, channel=channel, charge_name=name, amount=amount,
            ))

        for debit in data.debits:
            label = data.cards[debit.card_id].label if debit.card_id in data.cards else None
            message(debit.created_at, "DEBIT" if debit.status == "SUCCESS" else "DEBIT_FAILED", debit.amount, card=label)
            if debit.reversed_at:
                message(debit.reversed_at, "REVERSAL", debit.amount, card=label)
        for payment in data.payments:
            if not payment.debit_id:
                message(payment.paid_at, "PAYMENT", payment.amount, channel=payment.channel)
        for charge in data.charges:
            message(charge.charged_at, charge.kind, charge.amount, name=charge_name(charge.code))
    messages.sort(key=lambda one: one.at)
    return CustomerStatement(
        customer=_customer_shape(customer),
        cards=[
            schemas.Card(card_id=card.id, network=card.network, label=card.label, is_primary=card.is_primary)
            for card in sorted(cards.values(), key=lambda card: (not card.is_primary, card.id))
        ],
        contracts=contracts,
        messages=messages,
    )


@app.post("/api/complaints", response_model=ComplaintCreated)
def create_complaint(body: ComplaintCreate, world: WorldId, actor: ActingAs) -> ComplaintCreated:
    """A complaint typed in the Sandbox Bank. The bank stores it; FeeGuard only reads it."""
    text = body.text.strip()
    if not text:
        raise ApiError(400, "INVALID_REQUEST", "body.text: write the complaint in words.")
    _bank(world).close()  # the demo bank must exist and be ready
    complaint_id = sandbox_complaints.add_complaint(
        db.worlds_dir() / world, body.customer_id, text, parse_complaint.detect_lang(text)
    )
    if not complaint_id:
        raise ApiError(404, "NOT_FOUND", "The bank has no customer with this id.")
    with _store(world) as store:
        audit.append(store, actor, "COMPLAINT_RECEIVED", {"complaint_id": complaint_id, "customer_id": body.customer_id})
    return ComplaintCreated(complaint_id=complaint_id)


# --- FeeGuard: complaints, cases, scan -----------------------------------


@app.get("/api/complaints", response_model=ComplaintList)
def list_complaints(
    world: WorldId,
    status: ComplaintStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ComplaintList:
    with _bank(world) as bank:
        received = bank.complaints()
    with _store(world) as store:
        states = db.case_states(store)
    shown = [_complaint_shape(complaint, states) for complaint in received]
    if status:
        shown = [complaint for complaint in shown if complaint.status == status]
    # Waiting for an answer, the oldest first. Then the decided ones, the newest first.
    waiting = [complaint for complaint in shown if complaint.status in ("NEW", "CHECKED")]
    decided = [complaint for complaint in shown if complaint.status not in ("NEW", "CHECKED")]
    ordered = waiting + decided[::-1]
    return ComplaintList(items=ordered[offset:offset + limit], total=len(ordered))


@app.post("/api/cases/{complaint_id}/investigate", response_model=CaseResult)
def investigate(complaint_id: str, world: WorldId, actor: ActingAs) -> CaseResult:
    """Checks one complaint against the bank's records and stores the result."""
    started = time.perf_counter()
    with _bank(world) as bank:
        complaint = bank.complaint(complaint_id)
        if not complaint:
            raise ApiError(404, "NOT_FOUND", "There is no complaint with this number.")
        result = investigation.investigate(bank, complaint)
    with _store(world) as store:
        audit_id = audit.append(store, actor, "COMPLAINT_CHECKED", {
            "complaint_id": complaint_id, "verdict": result.verdict, "claim_type": result.understood.claim_type,
            "read_by": result.understood.mode, "to_return": result.total_excess,
            "findings": [finding.finding_id for finding in result.findings],
        })
        result = result.model_copy(update={
            "audit_id": audit_id, "elapsed_ms": round((time.perf_counter() - started) * 1000),
        })
        stored = result.model_dump(mode="json")
        db.save_case(store, stored, stored["findings"])
    return result


@app.get("/api/cases/{case_id}", response_model=CaseResult)
def get_case(case_id: str, world: WorldId) -> CaseResult:
    """A checked complaint as it was stored, with the decision made since."""
    with _store(world) as store:
        stored = db.load_case(store, case_id)
        decision = db.load_decision(store, case_id)
    if not stored:
        raise ApiError(404, "NOT_FOUND", "This complaint has not been checked yet.")
    stored["decision"] = decision
    stored["complaint"]["status"] = DECIDED[decision["action"]] if decision else "CHECKED"
    return CaseResult.model_validate(stored)


@app.post("/api/cases/{case_id}/decision", response_model=Decision)
def decide(case_id: str, body: DecisionRequest, world: WorldId, actor: ActingAs) -> Decision:
    """A person confirms, dismisses or corrects the verdict."""
    if body.action == "CORRECT" and body.corrected_verdict is None:
        raise ApiError(400, "INVALID_REQUEST", "body.corrected_verdict: a correction needs the right verdict.")
    correcting = body.action == "CORRECT"
    with _store(world) as store:
        stored = db.load_case(store, case_id)
        if not stored:
            raise ApiError(404, "NOT_FOUND", "This complaint has not been checked yet.")
        if db.load_decision(store, case_id):
            raise ApiError(409, "ALREADY_DECIDED", "This complaint already has a decision.")
        decision = {
            "case_id": case_id, "action": body.action, "note": body.note, "actor": actor, "at": db.now(),
            "corrected_verdict": body.corrected_verdict if correcting else None,
            "corrected_excess": body.corrected_excess if correcting else None,
        }
        decision["audit_id"] = audit.append(store, actor, f"VERDICT_{DECIDED[body.action]}", {
            **{key: decision[key] for key in ("case_id", "note", "corrected_verdict", "corrected_excess")},
            "verdict": stored["verdict"], "to_return": stored["total_excess"],
        })
        db.save_decision(store, decision)
    return Decision(**decision)


@app.post("/api/cases/{case_id}/improve-draft", response_model=DraftReply)
def improve_draft(case_id: str, world: WorldId, actor: ActingAs) -> DraftReply:
    _not_built("B6")


@app.post("/api/findings/{finding_id}/scan", response_model=ScanResult)
def scan(finding_id: str, world: WorldId, actor: ActingAs) -> ScanResult:
    """Everyone with the same mistake as this finding, including those who never complained."""
    started = time.perf_counter()
    with _store(world) as store:
        finding_type = db.finding_type(store, finding_id)
    if not finding_type:
        raise ApiError(404, "NOT_FOUND", "There is no finding with this id.")
    with _bank(world) as bank:
        result = scanning.scan(finding_type, scanning.findings_of(world, bank), bank)
    with _store(world) as store:
        audit.append(store, actor, "OTHERS_SEARCHED", {
            "finding_id": finding_id, "finding_type": finding_type, "customers": result.affected_customers,
            "never_complained": result.silent, "to_return": result.total_excess,
        })
    return result.model_copy(update={"elapsed_ms": round((time.perf_counter() - started) * 1000)})


# --- FeeGuard: reports and audit -----------------------------------------


@app.get("/api/reports/action-plan", response_model=ActionPlan)
def action_plan(world: WorldId) -> ActionPlan:
    _not_built("A8")


@app.put("/api/reports/action-plan/{plan_id}", response_model=ActionPlanRow)
def update_action_plan(
    plan_id: str, body: ActionPlanUpdate, world: WorldId, actor: ActingAs
) -> ActionPlanRow:
    _not_built("A8")


@app.get("/api/reports/quarterly", response_model=QuarterlyReport)
def quarterly(world: WorldId) -> QuarterlyReport:
    _not_built("A8")


@app.get(
    "/api/exports/refunds.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}}},
)
def refunds_csv(finding_type: DefectType, world: WorldId, actor: ActingAs) -> Response:
    with _bank(world) as bank:
        result = scanning.scan(finding_type, scanning.findings_of(world, bank), bank)
    with _store(world) as store:
        audit.append(store, actor, "REFUND_LIST_DOWNLOADED", {
            "finding_type": finding_type, "to_return": result.total_excess,
        })
    return Response(
        content=exports.refunds_csv(result),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="refunds-{finding_type.lower()}.csv"'},
    )


@app.get("/api/audit", response_model=AuditLog)
def audit_log(
    world: WorldId,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditLog:
    _not_built("A11")


# --- Sandbox Bank: scoring. These two read the answer key. -----------------


@app.get("/api/eval/{world_id}", response_model=Scoreboard)
def scoreboard(world_id: WorldPath) -> Scoreboard:
    _not_built("A9")


@app.get("/api/eval/{world_id}/reveal", response_model=Reveal)
def reveal(world_id: WorldPath, actor: ActingAs) -> Reveal:
    _not_built("A9")
