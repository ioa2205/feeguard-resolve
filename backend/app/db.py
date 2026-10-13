"""Where the demo banks live on disk, and FeeGuard's own database file.

Each demo bank is one folder under the worlds directory. This module opens
only feeguard.db. Bank data is read through connector.py.
"""

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import FEEGUARD_TABLES

FEEGUARD_DB = "feeguard.db"
TASHKENT = timezone(timedelta(hours=5))  # no daylight saving


def worlds_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "worlds"
    return Path(os.environ.get("WORLDS_DIR", default))


def storage_ready() -> bool:
    path = worlds_dir()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False
    return os.access(path, os.W_OK)


def now() -> str:
    """The time of an action in FeeGuard: Tashkent time, to the second, no offset."""
    return datetime.now(TASHKENT).replace(tzinfo=None, microsecond=0).isoformat()


def open_feeguard(world_id: str) -> sqlite3.Connection:
    """FeeGuard's own records for one demo bank. The folder must exist."""
    store = sqlite3.connect(worlds_dir() / world_id / FEEGUARD_DB, timeout=10)
    store.executescript(FEEGUARD_TABLES)
    return store


# --- Cases and decisions --------------------------------------------------


def save_case(store: sqlite3.Connection, result: dict, findings: list[dict]) -> None:
    """Stores a checked complaint. Checking it again replaces the case, its findings and
    its decision; the audit log keeps the history (DECISIONS D-018)."""
    case_id = result["case_id"]
    understood = result["understood"]
    store.execute("DELETE FROM cases WHERE id = ?", (case_id,))
    store.execute("DELETE FROM findings WHERE case_id = ?", (case_id,))
    store.execute("DELETE FROM decisions WHERE case_id = ?", (case_id,))
    store.execute(
        "INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (case_id, case_id, json.dumps(understood), result["verdict"], result["total_excess"],
         json.dumps(result, ensure_ascii=False), understood["mode"], now()),
    )
    store.executemany(
        "INSERT INTO findings VALUES (?, ?, ?, ?, ?, ?, ?, '{}', 'CASE')",
        [
            (f["finding_id"], case_id, f["contract_id"], f["type"], f["amount_excess"], f["amount_affected"],
             json.dumps(f["evidence"], ensure_ascii=False))
            for f in findings
        ],
    )


def load_case(store: sqlite3.Connection, case_id: str) -> dict | None:
    """The stored result of a case, exactly as it was sent."""
    row = store.execute("SELECT evidence_json FROM cases WHERE id = ?", (case_id,)).fetchone()
    return json.loads(row[0]) if row else None


def save_draft(store: sqlite3.Connection, case_id: str, draft: dict) -> None:
    """Keeps the letter now on screen with the stored case."""
    stored = load_case(store, case_id)
    stored["draft_reply"] = draft
    store.execute("UPDATE cases SET evidence_json = ? WHERE id = ?", (json.dumps(stored, ensure_ascii=False), case_id))


def save_decision(store: sqlite3.Connection, decision: dict) -> None:
    store.execute(
        "INSERT INTO decisions (case_id, action, note, actor, at, corrected_verdict, corrected_excess, audit_id) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (decision["case_id"], decision["action"], decision["note"], decision["actor"], decision["at"],
         decision["corrected_verdict"], decision["corrected_excess"], decision["audit_id"]),
    )


def load_decision(store: sqlite3.Connection, case_id: str) -> dict | None:
    row = store.execute(
        "SELECT case_id, action, note, actor, at, corrected_verdict, corrected_excess, audit_id "
        "FROM decisions WHERE case_id = ? ORDER BY id DESC LIMIT 1",
        (case_id,),
    ).fetchone()
    names = ("case_id", "action", "note", "actor", "at", "corrected_verdict", "corrected_excess", "audit_id")
    return dict(zip(names, row)) if row else None


def case_states(store: sqlite3.Connection) -> dict[str, tuple[str, str | None, int]]:
    """For every checked complaint: (verdict, action of its decision or None, soʻm to return)."""
    rows = store.execute(
        """SELECT c.id, c.verdict,
                  (SELECT d.action FROM decisions d WHERE d.case_id = c.id ORDER BY d.id DESC LIMIT 1),
                  c.excess_amount
           FROM cases c"""
    )
    return {case_id: (verdict, action, to_return) for case_id, verdict, action, to_return in rows}


def finding_type(store: sqlite3.Connection, finding_id: str) -> str | None:
    row = store.execute("SELECT type FROM findings WHERE id = ?", (finding_id,)).fetchone()
    return row[0] if row else None
