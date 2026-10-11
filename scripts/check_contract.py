"""Checks every mock in frontend/src/mocks against backend/app/schemas.py.

The two apps share only the HTTP API, so neither reads the other's files. This
script stands outside both and holds them to the same shapes. Run it after any
change to schemas.py, types.ts or a mock:

    python scripts/check_contract.py
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from pydantic import ValidationError  # noqa: E402

from app import schemas  # noqa: E402

MOCKS = {
    "action-plan.json": schemas.ActionPlan,
    "audit.json": schemas.AuditLog,
    "case-not-supported.json": schemas.CaseResult,
    "case-supported.json": schemas.CaseResult,
    "check-run.json": schemas.CheckRun,
    "checks.json": schemas.CheckRunList,
    "complaint-created.json": schemas.ComplaintCreated,
    "complaints.json": schemas.ComplaintList,
    "customers.json": schemas.CustomerList,
    "decision.json": schemas.Decision,
    "draft-reply.json": schemas.DraftReply,
    "error.json": schemas.ErrorResponse,
    "health.json": schemas.Health,
    "incident-detail.json": schemas.IncidentDetail,
    "incidents.json": schemas.IncidentList,
    "presets.json": schemas.PresetList,
    "quarterly.json": schemas.QuarterlyReport,
    "req-action-plan-update.json": schemas.ActionPlanUpdate,
    "req-complaint-create.json": schemas.ComplaintCreate,
    "req-decision.json": schemas.DecisionRequest,
    "req-tamper.json": schemas.TamperRequest,
    "req-world-create.json": schemas.WorldCreate,
    "reveal.json": schemas.Reveal,
    "scan.json": schemas.ScanResult,
    "scoreboard.json": schemas.Scoreboard,
    "statement.json": schemas.CustomerStatement,
    "tamper-result.json": schemas.TamperResult,
    "world-created.json": schemas.WorldCreated,
    "world.json": schemas.World,
    "worlds.json": schemas.WorldList,
}


def main() -> int:
    folder = ROOT / "frontend" / "src" / "mocks"
    on_disk = {path.name for path in folder.glob("*.json")}
    problems = [f"{name}: no shape is named for this mock" for name in sorted(on_disk - set(MOCKS))]
    problems += [f"{name}: the mock file is missing" for name in sorted(set(MOCKS) - on_disk)]

    for name in sorted(on_disk & set(MOCKS)):
        try:
            MOCKS[name].model_validate_json((folder / name).read_text(encoding="utf-8"))
        except ValidationError as error:
            problems += [
                f"{name}: {'.'.join(str(part) for part in item['loc'])}: {item['msg']}"
                for item in error.errors()
            ]

    for problem in problems:
        print(problem)
    if problems:
        print(f"FAILED: {len(problems)} problem(s)")
        return 1
    print(f"OK: {len(MOCKS)} mocks match schemas.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
