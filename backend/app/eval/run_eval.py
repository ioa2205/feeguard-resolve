"""Compares FeeGuard's results with the answer key (PLAN Part 11). Tasks A5, A6 and A9.

Prints two tables: what the four checks found over the whole bank next to the
planted mistakes (the Scoreboard), and the verdict on every generated complaint
next to the verdict the Sandbox Bank expects.

    python -m app.eval.run_eval --world default

Only this folder and the Reveal endpoint may open truth.db.
"""

import argparse
import sqlite3
import sys
import statistics
import time
from collections import Counter
from pathlib import Path

from .. import db
from ..connector import Bank
from ..engine import investigate, scan
from ..engine.wording import som
from .scoreboard import answer_key, score

TRUTH_DB = "truth.db"


def complaint_verdicts(world_dir: Path) -> dict:
    """Checks every generated complaint and counts the verdicts that match the answer key.

    A look-alike or unrelated complaint from a customer who also has a real
    mistake may rightly end as SUPPORTED with a different mistake than claimed.
    """
    truth = sqlite3.connect(f"{(Path(world_dir) / TRUTH_DB).resolve().as_uri()}?mode=ro", uri=True)
    try:
        key = {row[0]: row[1:] for row in truth.execute(
            "SELECT complaint_id, kind, claim_type, expected_verdict, also_planted FROM complaint_key"
        )}
    finally:
        truth.close()

    total, right, read_total, read_right = Counter(), Counter(), Counter(), Counter()
    verdicts: dict[str, Counter] = {}
    wrong, times = [], []
    with Bank(world_dir) as bank:
        for complaint in bank.complaints():
            if complaint.id not in key:
                continue  # typed by a person: the answer key does not know it
            kind, claim_type, expected, also_planted = key[complaint.id]
            started = time.perf_counter()
            result = investigate.investigate(bank, complaint)
            times.append((time.perf_counter() - started) * 1000)

            read_total[claim_type] += 1
            read_right[claim_type] += result.understood.claim_type == claim_type
            other_mistake = also_planted and result.verdict == "SUPPORTED" and result.claim_match is False
            total[kind] += 1
            verdicts.setdefault(kind, Counter())[result.verdict] += 1
            if result.verdict == expected or other_mistake:
                right[kind] += 1
            else:
                wrong.append((complaint.id, kind, claim_type, result.understood.claim_type, expected, result.verdict))
    return {
        "total": dict(total), "right": dict(right), "verdicts": {kind: dict(c) for kind, c in verdicts.items()},
        "read_total": dict(read_total), "read_right": dict(read_right), "wrong": wrong,
        "median_ms": statistics.median(times) if times else 0.0, "slowest_ms": max(times, default=0.0),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare FeeGuard's results with the answer key.")
    parser.add_argument("--world", default="default")
    parser.add_argument("--show-wrong", type=int, default=10, help="how many wrong verdicts to list")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")  # soʻm on a Windows console

    world_dir = db.worlds_dir() / args.world
    with Bank(world_dir) as bank:
        found = scan.check_bank(bank)
    print(f"Mistakes over the whole demo bank {args.world} ({len(found.owner_of):,} loans, checked in {found.seconds:.1f} s)")
    print(f"  {'type':<14} {'planted':>8} {'found':>7} {'missed':>7} {'false':>7} {'traps':>7}   soʻm planted / found")
    for row in score(answer_key(world_dir), found):
        print(f"  {row.type:<14} {row.planted:>8} {row.found:>7} {row.missed:>7} {row.false_alarms:>7} "
              f"{row.traps_flagged:>3} of {row.traps_planted:<3} {som(row.amount_planted)} / {som(row.amount_found)}")
    print("  (traps: look-alikes of the answer key that were flagged; early debit soʻm is money taken early)")

    result = complaint_verdicts(world_dir)
    names = {"VICTIM": "really wronged", "TRAP": "look-alike (bank was right)", "OTHER": "not about a payment"}
    print(f"Verdicts on the generated complaints of demo bank {args.world}")
    for kind, name in names.items():
        if kind in result["total"]:
            print(f"  {name:<28} {result['right'].get(kind, 0):>4} of {result['total'][kind]:<4} right   {result['verdicts'][kind]}")
    all_right, everything = sum(result["right"].values()), sum(result["total"].values())
    print(f"  {'all':<28} {all_right:>4} of {everything}")
    print("Claim type read from the text (the reader named in GET /api/health)")
    for claim_type, count in sorted(result["read_total"].items()):
        print(f"  {claim_type:<28} {result['read_right'].get(claim_type, 0):>4} of {count}")
    print(f"Time for one complaint: median {result['median_ms']:.0f} ms, slowest {result['slowest_ms']:.0f} ms")
    for row in result["wrong"][: args.show_wrong]:
        print("  wrong:", *row)


if __name__ == "__main__":
    main()
