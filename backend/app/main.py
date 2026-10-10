"""FeeGuard API: JSON and CSV only. It never serves a page (PLAN Part 12).

Task M0.2 froze every path of PLAN Part 10 here. A path that is not built yet
answers 501 and names the task that builds it.
"""

from typing import Annotated, NoReturn

from fastapi import Depends, FastAPI, Header, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import db
from .errors import ApiError
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

app = FastAPI(
    title="FeeGuard Resolve API",
    version="0.1.0",
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


def _world(x_world_id: Annotated[str, Header(max_length=40)] = DEFAULT_WORLD_ID) -> str:
    return x_world_id


def _actor(x_actor: Annotated[Actor, Header()] = "officer") -> Actor:
    return x_actor


WorldId = Annotated[str, Depends(_world)]
ActingAs = Annotated[Actor, Depends(_actor)]


def _not_built(task: str) -> NoReturn:
    raise ApiError(501, "NOT_BUILT", f"Not built yet. Task {task} builds it.")


@app.get("/api/health", response_model=Health)
def health() -> Health:
    # The local model is wired in task B3. Until then complaints are read by rules.
    return Health(
        db="ok" if db.storage_ready() else "error",
        llm_mode="rules",
        model_name=None,
    )


# --- Sandbox Bank: demo banks --------------------------------------------


@app.post("/api/worlds", response_model=WorldCreated)
def create_world(body: WorldCreate, actor: ActingAs) -> WorldCreated:
    _not_built("A1")


@app.get("/api/worlds", response_model=WorldList)
def list_worlds() -> WorldList:
    _not_built("A1")


@app.get("/api/worlds/{world_id}", response_model=World)
def get_world(world_id: str) -> World:
    _not_built("A1")


@app.post("/api/worlds/{world_id}/tamper", response_model=TamperResult)
def tamper(world_id: str, body: TamperRequest, actor: ActingAs) -> TamperResult:
    _not_built("A10")


@app.get("/api/customers", response_model=CustomerList)
def search_customers(
    world: WorldId,
    search: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> CustomerList:
    _not_built("A1")


@app.get("/api/customers/{customer_id}/statement", response_model=CustomerStatement)
def customer_statement(customer_id: str, world: WorldId) -> CustomerStatement:
    _not_built("A1")


@app.post("/api/complaints", response_model=ComplaintCreated)
def create_complaint(body: ComplaintCreate, world: WorldId, actor: ActingAs) -> ComplaintCreated:
    _not_built("A5")


# --- FeeGuard: complaints, cases, scan -----------------------------------


@app.get("/api/complaints", response_model=ComplaintList)
def list_complaints(
    world: WorldId,
    status: ComplaintStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ComplaintList:
    _not_built("A5")


@app.post("/api/cases/{complaint_id}/investigate", response_model=CaseResult)
def investigate(complaint_id: str, world: WorldId, actor: ActingAs) -> CaseResult:
    _not_built("A5")


@app.get("/api/cases/{case_id}", response_model=CaseResult)
def get_case(case_id: str, world: WorldId) -> CaseResult:
    _not_built("A5")


@app.post("/api/cases/{case_id}/decision", response_model=Decision)
def decide(case_id: str, body: DecisionRequest, world: WorldId, actor: ActingAs) -> Decision:
    _not_built("A5")


@app.post("/api/cases/{case_id}/improve-draft", response_model=DraftReply)
def improve_draft(case_id: str, world: WorldId, actor: ActingAs) -> DraftReply:
    _not_built("B6")


@app.post("/api/findings/{finding_id}/scan", response_model=ScanResult)
def scan(finding_id: str, world: WorldId, actor: ActingAs) -> ScanResult:
    _not_built("A7")


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
    _not_built("A7")


@app.get("/api/audit", response_model=AuditLog)
def audit_log(
    world: WorldId,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> AuditLog:
    _not_built("A11")


# --- Sandbox Bank: scoring. These two read the answer key. -----------------


@app.get("/api/eval/{world_id}", response_model=Scoreboard)
def scoreboard(world_id: str) -> Scoreboard:
    _not_built("A9")


@app.get("/api/eval/{world_id}/reveal", response_model=Reveal)
def reveal(world_id: str, actor: ActingAs) -> Reveal:
    _not_built("A9")
