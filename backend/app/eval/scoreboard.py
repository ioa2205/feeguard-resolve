"""Scoreboard and Reveal: FeeGuard's findings next to the answer key (PLAN Part 11, Proof 1). Task A9.

Only this folder and the generator may open truth.db. FeeGuard's findings come
from the same bank-wide pass as "Find others" (`engine/scan.py`).

Matching: a finding and a planted mistake match when they have the same type,
loan and installment. Per (loan, installment): found = min(findings, planted),
missed = planted - found, false alarms = findings - found. A false alarm on a
look-alike from the answer key also counts as a trap that was flagged.
"""

import json
import sqlite3
import statistics
from collections import defaultdict
from pathlib import Path

from .. import schemas
from ..engine.checkers import early_debit
from ..engine.scan import BankFindings
from . import language_test

TRUTH_DB = "truth.db"
TYPES = ("DOUBLE_DEBIT", "EARLY_DEBIT", "LATE_POSTING", "ILLEGAL_FEE")


def _truth(world_dir: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{(Path(world_dir) / TRUTH_DB).resolve().as_uri()}?mode=ro", uri=True)


def answer_key(world_dir: Path) -> list[tuple]:
    """(id, defect_type, contract_id, installment_n, excess_amount, cause_tag, is_trap), in id order."""
    truth = _truth(world_dir)
    try:
        return truth.execute(
            "SELECT id, defect_type, contract_id, installment_n, excess_amount, cause_tag, is_trap FROM ground_truth ORDER BY id"
        ).fetchall()
    finally:
        truth.close()


def settings(world_dir: Path) -> dict:
    """The settings of the world, the hidden ones included."""
    truth = _truth(world_dir)
    try:
        return json.loads(truth.execute("SELECT config_json FROM config WHERE key = 'settings'").fetchone()[0])
    finally:
        truth.close()


def _amount(finding) -> int:
    """For an early debit the money involved; for the others the money to return."""
    return finding.amount_affected if finding.type == early_debit.TYPE else finding.amount_excess


def score(key: list[tuple], found: BankFindings) -> list[schemas.ScoreRow]:
    planted: dict[str, dict[tuple, list[int]]] = {kind: defaultdict(list) for kind in TYPES}
    traps: dict[str, dict[tuple, int]] = {kind: defaultdict(int) for kind in TYPES}
    for _, kind, contract_id, n, amount, _, is_trap in key:
        if is_trap:
            traps[kind][(contract_id, n)] += 1
        else:
            planted[kind][(contract_id, n)].append(amount)

    rows = []
    for kind in TYPES:
        findings: dict[tuple, list] = defaultdict(list)
        for finding in found.by_type.get(kind, ()):
            findings[(finding.contract_id, finding.installment_n)].append(finding)
        hit = missed = false_alarms = traps_flagged = amount_found = 0
        for slot in set(findings) | set(planted[kind]):
            mine, theirs = findings.get(slot, []), planted[kind].get(slot, [])
            matched = min(len(mine), len(theirs))
            hit += matched
            missed += len(theirs) - matched
            extra = len(mine) - matched
            false_alarms += extra
            traps_flagged += min(extra, traps[kind].get(slot, 0))
            amount_found += sum(_amount(finding) for finding in mine[:matched])
        rows.append(schemas.ScoreRow(
            type=kind, planted=sum(len(amounts) for amounts in planted[kind].values()), found=hit, missed=missed,
            false_alarms=false_alarms, amount_planted=sum(sum(amounts) for amounts in planted[kind].values()),
            amount_found=amount_found, traps_planted=sum(traps[kind].values()), traps_flagged=traps_flagged,
        ))
    return rows


def _median(values: list) -> int | None:
    numbers = [int(value) for value in values if value is not None]
    return round(statistics.median(numbers)) if numbers else None


def timings(store: sqlite3.Connection, world_build_ms: int | None) -> schemas.Timings:
    """Measured times: the build of this demo bank, and the median of the checks and scans done on it."""
    checks = [row[0] for row in store.execute("SELECT json_extract(evidence_json, '$.elapsed_ms') FROM cases")]
    scans = [row[0] for row in store.execute(
        "SELECT json_extract(payload_json, '$.elapsed_ms') FROM audit_log WHERE action = 'OTHERS_SEARCHED'"
    )]
    return schemas.Timings(world_build_ms=world_build_ms, investigate_ms=_median(checks), scan_ms=_median(scans))


def scoreboard(world_id: str, world_dir: Path, seed: int, size: int, found: BankFindings,
               store: sqlite3.Connection, world_build_ms: int | None) -> schemas.Scoreboard:
    """`elapsed_ms` is filled in by the caller."""
    return schemas.Scoreboard(
        world_id=world_id, seed=seed, size=size, per_type=score(answer_key(world_dir), found),
        language_test=language_test.saved_scores(), timings=timings(store, world_build_ms), elapsed_ms=0,
    )


def reveal(world_id: str, world_dir: Path) -> schemas.Reveal:
    key = answer_key(world_dir)
    config = settings(world_dir)
    counts: dict[tuple[str, bool], list[int]] = defaultdict(lambda: [0, 0])
    for _, kind, _, _, amount, _, is_trap in key:
        counts[(kind, bool(is_trap))][0] += 1
        counts[(kind, bool(is_trap))][1] += amount
    return schemas.Reveal(
        world_id=world_id, seed=config["seed"], settings=config,
        counts=[
            schemas.AnswerKeyCount(defect_type=kind, is_trap=trap, count=count, amount=amount)
            for (kind, trap), (count, amount) in sorted(counts.items(), key=lambda kv: (TYPES.index(kv[0][0]), kv[0][1]))
        ],
        items=[
            schemas.AnswerKeyRow(
                id=row_id, defect_type=kind, contract_id=contract_id, installment_n=n, excess_amount=amount,
                cause_tag=cause_tag, is_trap=bool(is_trap),
            )
            for row_id, kind, contract_id, n, amount, cause_tag, is_trap in key
        ],
        total=len(key),
    )
