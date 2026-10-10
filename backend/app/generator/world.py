"""Builds one demo bank ("world") from a seed and settings. Tasks A1 and A2.

Same seed and settings, same world: one seeded random generator, used in a
fixed order, and no server clock anywhere in the data.

    python -m app.generator.world --seed 2026 --size 20000 --id default
"""

import argparse
import json
import logging
import shutil
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from random import Random
from typing import Callable

from .. import db
from ..models import BANK_INDEXES, BANK_TABLES
from . import complaints, defects
from .contracts import ALLOWED_FEES, PENALTY_BP_DAILY, PRODUCTS, make_contracts, render_contract
from .customers import make_customers
from .events import make_events

BANK_DB = "bank.db"
# How long the build took. Kept next to the bank, not in it: a time is no part of the world.
BUILD_RECORD = "build.json"
DEFAULT_AS_OF = date(2026, 10, 10)
DEFAULT_RATE = 0.02
SIZES = (5000, 20000)

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Settings:
    seed: int
    size: int
    defects: dict[str, float] = field(default_factory=lambda: {kind: DEFAULT_RATE for kind in defects.TYPES})
    complaint_rate: float = 0.15
    traps: int = 20
    surprise: bool = False
    as_of_date: date = DEFAULT_AS_OF


def build_world(parent: Path, world_id: str, settings: Settings,
                on_progress: Callable[[int], None] = lambda percent: None) -> dict[str, int]:
    """Writes worlds/<world_id>/ and returns the row counts. Replaces nothing: the
    folder must not exist yet."""
    target = parent / world_id
    if target.exists():
        raise FileExistsError(f"world {world_id} already exists")
    building = parent / f"{world_id}.building"
    shutil.rmtree(building, ignore_errors=True)
    building.mkdir(parents=True)

    rng = Random(settings.seed)
    as_of = settings.as_of_date
    rates = defects.resolve_rates(settings.defects, settings.surprise, rng)
    customers, owner_of = make_customers(rng, settings.size)
    on_progress(10)
    contracts = make_contracts(rng, customers, owner_of, as_of)
    on_progress(30)
    plan = defects.plan_defects(contracts, rates, settings.surprise, rng, as_of)
    events = make_events(contracts, plan, rng, as_of)
    traps = defects.pick_traps(events.lookalikes, settings.traps, rng)
    complaint_rows, complaint_key = complaints.make_complaints(
        contracts, events, traps, rng, as_of, settings.complaint_rate
    )
    on_progress(60)

    schedule_rows = []
    for c in contracts:
        versions = ((1, c.schedule_v1), (2, c.schedule)) if c.schedule_v1 else ((1, c.schedule),)
        for version, rows in versions:
            schedule_rows.extend(
                (c.id, version, n, due.isoformat(), part, interest, total)
                for n, due, part, interest, total in rows
            )
    fees_json = json.dumps(
        [{"code": code, "name": name, "amount": amount} for code, (name, _, amount) in ALLOWED_FEES.items()]
    )
    tables = {
        "world": [(world_id, settings.seed, settings.size, as_of.isoformat(), "ready", as_of.isoformat())],
        "customers": [
            (c.id, c.full_name, c.region, c.phone_masked, c.segment, c.preferred_lang) for c in customers
        ],
        "cards": [(card[0], c.id, *card[1:]) for c in customers for card in c.cards],
        "products": [
            (p.code, p.name, p.annual_bp / 10_000, fees_json, PENALTY_BP_DAILY / 10_000,
             2 if p.code == plan.fee_product else 1)
            for p in PRODUCTS
        ],
        "contracts": [
            (c.id, c.customer.id, c.product.code, c.customer.branch, c.principal,
             c.product.annual_bp / 10_000, c.term, c.start.isoformat(), c.schedule[-1][1].day,
             c.schedule_version, c.changed_on and c.changed_on.isoformat(),
             c.early_requested_on and c.early_requested_on.isoformat(), c.tariff_version,
             render_contract(c))
            for c in contracts
        ],
        "schedule_items": schedule_rows,
        "debits": events.debits,
        "payments": events.payments,
        "charges": events.charges,
        "complaints": complaint_rows,
    }
    on_progress(75)

    bank = sqlite3.connect(building / BANK_DB)
    try:
        bank.executescript("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;" + BANK_TABLES)
        for table, rows in tables.items():
            marks = ", ".join("?" * len(rows[0])) if rows else ""
            if rows:
                bank.executemany(f"INSERT INTO {table} VALUES ({marks})", rows)
        bank.executescript(BANK_INDEXES)
        bank.commit()
    finally:
        bank.close()
    on_progress(95)

    defects.write_truth(
        building,
        events.planted,
        traps,
        {
            "seed": settings.seed,
            "size": settings.size,
            "as_of_date": as_of.isoformat(),
            "defects": rates,
            "complaint_rate": settings.complaint_rate,
            "traps": settings.traps,
            "surprise": settings.surprise,
            "hidden": plan.hidden,
        },
        complaint_key,
    )
    building.rename(target)
    on_progress(100)

    counts = {table: len(rows) for table, rows in tables.items()}
    for kind in defects.TYPES:
        counts[f"planted {kind}"] = sum(1 for row in events.planted if row[0] == kind)
        counts[f"trap {kind}"] = sum(1 for row in traps if row[0] == kind)
    for kind in (complaints.VICTIM, complaints.TRAP, complaints.UNRELATED):
        counts[f"complaints {kind}"] = sum(1 for row in complaint_key if row[1] == kind)
    return counts


# --- Building in the background, for the API ------------------------------


class Busy(Exception):
    """Another demo bank is being built. Only one is built at a time."""


_building: dict[str, dict] = {}  # world_id -> what GET /api/worlds/{id} shows while it builds
_one_build = threading.Lock()


def start_build(settings: Settings, world_id: str | None = None,
                on_ready: Callable[[str], None] | None = None) -> str:
    """Builds in the background. `on_ready` is called with the world id once the build has succeeded."""
    if not _one_build.acquire(blocking=False):
        raise Busy
    try:
        parent = db.worlds_dir()
        parent.mkdir(parents=True, exist_ok=True)
        world_id = world_id or _free_id(parent, settings.seed)
        _building[world_id] = {
            "world_id": world_id, "status": "building", "progress": 0, "size": settings.size,
            "seed": settings.seed, "as_of_date": settings.as_of_date.isoformat(),
        }
        threading.Thread(target=_build, args=(parent, world_id, settings, on_ready), daemon=True).start()
    except BaseException:
        _one_build.release()
        raise
    return world_id


def record_build(folder: Path, seconds: float) -> None:
    (folder / BUILD_RECORD).write_text(json.dumps({"build_ms": round(seconds * 1000)}), encoding="utf-8")


def build_ms(world_id: str) -> int | None:
    """How long the demo bank took to build, when it was measured."""
    try:
        return json.loads((db.worlds_dir() / world_id / BUILD_RECORD).read_text(encoding="utf-8"))["build_ms"]
    except (OSError, ValueError, KeyError):
        return None


def _build(parent: Path, world_id: str, settings: Settings,
           on_ready: Callable[[str], None] | None = None) -> None:
    state = _building[world_id]
    built = False
    try:
        started = time.perf_counter()
        build_world(parent, world_id, settings, lambda percent: state.update(progress=percent))
        record_build(parent / world_id, time.perf_counter() - started)
        del _building[world_id]
        built = True
    except Exception:
        log.exception("building world %s failed", world_id)
        state["status"] = "failed"
    finally:
        _one_build.release()
    if built and on_ready:
        on_ready(world_id)


def _free_id(parent: Path, seed: int) -> str:
    world_id, number = f"w-{seed}", 1
    while (parent / world_id).exists() or world_id in _building:
        number += 1
        world_id = f"w-{seed}-{number}"
    return world_id


def get_world(world_id: str) -> dict | None:
    """What may be shown about a world. Never its hidden settings."""
    if world_id in _building:
        return dict(_building[world_id])
    path = db.worlds_dir() / world_id / BANK_DB
    if not path.is_file():
        return None
    bank = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
    try:
        seed, size, as_of = bank.execute("SELECT seed, size, as_of_date FROM world").fetchone()
    finally:
        bank.close()
    return {"world_id": world_id, "status": "ready", "progress": 100, "size": size, "seed": seed, "as_of_date": as_of}


def list_worlds() -> list[dict]:
    parent = db.worlds_dir()
    on_disk = sorted(p.name for p in parent.iterdir() if (p / BANK_DB).is_file()) if parent.is_dir() else []
    names = on_disk + [name for name in _building if name not in on_disk]
    # The default world first, then by name.
    names.sort(key=lambda name: (name != "default", name))
    return [world for world in map(get_world, names) if world]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build one demo bank.")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--size", type=int, default=20000)
    parser.add_argument("--id", default="default")
    parser.add_argument("--traps", type=int, default=20)
    parser.add_argument("--surprise", action="store_true")
    parser.add_argument("--replace", action="store_true", help="delete the world first if it exists")
    args = parser.parse_args()

    parent = db.worlds_dir()
    if args.replace:
        shutil.rmtree(parent / args.id, ignore_errors=True)
    started = time.perf_counter()
    counts = build_world(parent, args.id, Settings(args.seed, args.size, traps=args.traps, surprise=args.surprise))
    seconds = time.perf_counter() - started
    record_build(parent / args.id, seconds)
    for name, count in counts.items():
        print(f"{name:>24}  {count:>9,}")
    print(f"{'built in':>24}  {seconds:>8.1f} s   seed {args.seed}, world {args.id}")


if __name__ == "__main__":
    main()
