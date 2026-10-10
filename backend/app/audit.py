"""Audit log with a SHA-256 hash chain (PLAN Part 22). Task A11.

Every entry holds the hash of the entry before it, so a changed or removed
entry breaks the chain from that point on. Writing is here since task A5,
because every result must name its audit entry. The screen and the check that
a changed row is noticed are task A11.
"""

import hashlib
import json
import sqlite3

from . import db

FIRST_HASH = "0" * 64


def _hash(prev_hash: str, at: str, actor: str, action: str, payload_json: str) -> str:
    return hashlib.sha256("\n".join((prev_hash, at, actor, action, payload_json)).encode("utf-8")).hexdigest()


def audit_id(number: int) -> str:
    return f"A-{number}"


def append(store: sqlite3.Connection, actor: str, action: str, payload: dict) -> str:
    """Adds one entry and returns its id. The caller commits."""
    last = store.execute("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").fetchone()
    prev_hash = last[0] if last else FIRST_HASH
    at = db.now()
    payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    cursor = store.execute(
        "INSERT INTO audit_log (at, actor, action, payload_json, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?)",
        (at, actor, action, payload_json, prev_hash, _hash(prev_hash, at, actor, action, payload_json)),
    )
    return audit_id(cursor.lastrowid)


def first_broken(store: sqlite3.Connection) -> str | None:
    """The id of the first entry whose hash does not fit, or None when the chain is intact."""
    prev_hash = FIRST_HASH
    for number, at, actor, action, payload_json, stored_prev, stored in store.execute(
        "SELECT id, at, actor, action, payload_json, prev_hash, hash FROM audit_log ORDER BY id"
    ):
        if stored_prev != prev_hash or stored != _hash(prev_hash, at, actor, action, payload_json):
            return audit_id(number)
        prev_hash = stored
    return None
