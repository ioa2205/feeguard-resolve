"""Checks of the whole bank (DECISIONS D-039): the full pass once, then only what changed.

The first check of a demo bank reads every loan. Every later check, the daily one
included, reads only the loans that got a debit, payment or charge since the last
check, and gives exactly what a full pass would give (tests/test_daily_check.py).
Each check is recorded, and opens or grows the incidents (app/incidents.py).
"""

import json
import logging
import os
import threading
import time
from datetime import datetime, timedelta

from . import db, incidents, schemas
from .connector import Bank
from .engine import scan as scanning

log = logging.getLogger(__name__)
# One check of a demo bank at a time, from reading to recording, so run ids never clash
# and the incidents always follow the newest findings.
_locks: dict[str, threading.Lock] = {}
_guard = threading.Lock()


def _lock(world_id: str) -> threading.Lock:
    with _guard:
        return _locks.setdefault(world_id, threading.Lock())


def daily_at() -> str | None:
    """When the daily check runs, Tashkent time, or None when it is off. DAILY_CHECK_AT=off turns it off."""
    value = os.environ.get("DAILY_CHECK_AT", "02:30").strip().lower()
    if value in ("", "off"):
        return None
    try:
        hour, minute = (int(part) for part in value.split(":"))
    except ValueError:
        return None
    return f"{hour:02d}:{minute:02d}" if 0 <= hour < 24 and 0 <= minute < 60 else None


def run(world_id: str, trigger: str) -> schemas.CheckRun | None:
    """Checks a demo bank and records it. None when a check that nobody asked for found nothing to read."""
    with _lock(world_id):
        started = time.perf_counter()
        with Bank(db.worlds_dir() / world_id) as bank:
            result, full = scanning.check_changes(world_id, bank)
        elapsed_ms = round((time.perf_counter() - started) * 1000)
        if not full and not result.loans and trigger in ("FIRST_USE", "AFTER_CHANGE"):
            return None
        store = db.open_feeguard(world_id)
        try:
            with store:
                (count,) = store.execute("SELECT count(*) FROM check_runs").fetchone()
                run_id = f"CR-{count + 1:04d}"
                opened, grown = incidents.sync(store, result.found, run_id, trigger)
                values = (run_id, db.now(), trigger, "ALL" if full else "CHANGED",
                          result.loans, len(result.found.owner_of), result.new, result.gone, elapsed_ms,
                          json.dumps(opened), json.dumps(grown))
                store.execute("INSERT INTO check_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", values)
        finally:
            store.close()
    log.info("demo bank %s: %s check read %d of %d loans in %d ms", world_id, trigger, result.loans,
             len(result.found.owner_of), elapsed_ms)
    return incidents.run_row(values)


def findings(world_id: str, bank: Bank) -> scanning.BankFindings:
    """The kept findings of a demo bank. The first use runs and records the full pass."""
    kept = scanning.peek(world_id)
    if kept is None:
        run(world_id, "FIRST_USE")
        kept = scanning.findings_of(world_id, bank)
    return kept


def history(store, limit: int = 50) -> schemas.CheckRunList:
    rows = store.execute("SELECT * FROM check_runs ORDER BY at DESC, id DESC LIMIT ?", (limit,)).fetchall()
    (total,) = store.execute("SELECT count(*) FROM check_runs").fetchone()
    return schemas.CheckRunList(items=[incidents.run_row(row) for row in rows], daily_at=daily_at(), total=total)


def _seconds_until(at: str) -> float:
    now = datetime.now(db.TASHKENT)
    hour, minute = (int(part) for part in at.split(":"))
    next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return (next_run - now).total_seconds()


def start_daily(ready_worlds) -> threading.Event | None:
    """Runs the check of changed loans every day at DAILY_CHECK_AT for every ready demo bank."""
    at = daily_at()
    if at is None:
        return None
    stop = threading.Event()

    def loop() -> None:
        while not stop.wait(_seconds_until(at)):
            for world_id in ready_worlds():
                try:
                    run(world_id, "DAILY")
                except Exception:
                    log.exception("daily check of demo bank %s failed", world_id)

    threading.Thread(target=loop, name="daily-check", daemon=True).start()
    return stop
