"""Runs the hand-written complaint test set in AI mode and in rules mode (Proof 3). Task B7.

    python -m app.eval.language_test            # print the numbers
    python -m app.eval.language_test --save     # also keep them for the Scoreboard

The test set, data/complaint_testset.jsonl, is written by people, by hand
(CLAUDE.md rule 8). This file only reads it. One line per complaint:
`text`, `received`, `claim_type`, `claimed_excess`, `period`, `lang`.

A claim type is right when it equals the label. An amount is right when the
amount read equals the label, also when both are empty. AI mode counts only
the answers the model gave; a fallback to rules is a miss in AI mode.
"""

import argparse
import json
import statistics
import sys
import time
from collections import Counter
from datetime import date
from pathlib import Path

from .. import schemas
from ..ai import llm
from ..ai.parse_complaint import parse

DATA = Path(__file__).resolve().parents[2] / "data"
TESTSET = DATA / "complaint_testset.jsonl"
RESULT = DATA / "language_test_result.json"


def load(path: Path = TESTSET) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run(lines: list[dict], mode: str) -> dict:
    """Reads every line in one mode. Returns the counts, overall and by language variant."""
    total, types, amounts, answered = Counter(), Counter(), Counter(), 0
    seconds = []
    for line in lines:
        started = time.perf_counter()
        reading = parse(line["text"], date.fromisoformat(line["received"]), use_model=mode == "llm")
        seconds.append(time.perf_counter() - started)
        counted = mode == "rules" or reading.mode == "llm"
        answered += reading.mode == mode
        for key in ("all", line["lang"]):
            total[key] += 1
            types[key] += counted and reading.claim_type == line["claim_type"]
            amounts[key] += counted and reading.claimed_excess == line["claimed_excess"]
    return {
        "mode": mode, "total": dict(total), "type_correct": dict(types), "amount_correct": dict(amounts),
        "answered": answered, "median_s": statistics.median(seconds) if seconds else 0.0,
        "slowest_s": max(seconds, default=0.0),
    }


def score(result: dict) -> schemas.LanguageScore:
    return schemas.LanguageScore(
        mode=result["mode"], n=result["total"].get("all", 0),
        type_correct=result["type_correct"].get("all", 0), amount_correct=result["amount_correct"].get("all", 0),
    )


def saved_scores(path: Path = RESULT) -> list[schemas.LanguageScore]:
    """The last saved run, for the Scoreboard. Empty until the test has been run."""
    if not path.is_file():
        return []
    return [schemas.LanguageScore.model_validate(item) for item in json.loads(path.read_text(encoding="utf-8"))["scores"]]


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the hand-written complaint test set.")
    parser.add_argument("--save", action="store_true", help=f"keep the numbers in {RESULT.name} for the Scoreboard")
    args = parser.parse_args()
    if not TESTSET.is_file():
        print(f"{TESTSET.name} is missing. The team writes it by hand (task B5); nothing is generated.")
        return 2
    lines = load()
    modes = ["rules"] + (["llm"] if llm.settings() else [])
    if "llm" not in modes:
        print("No local model is set up (LLM_URL, LLM_MODEL), so only rules mode is measured.")
    results = [run(lines, mode) for mode in modes]
    for result in results:
        print(f"{result['mode']} mode, {result['answered']} of {result['total']['all']} read in this mode, "
              f"median {result['median_s']:.2f} s, slowest {result['slowest_s']:.2f} s")
        for key in sorted(result["total"], key=lambda key: key != "all"):
            n = result["total"][key]
            print(f"  {key:<8} claim type {result['type_correct'][key]:>3} of {n:<3}  amount {result['amount_correct'][key]:>3} of {n}")
    if args.save:
        RESULT.write_text(json.dumps({
            "testset_lines": len(lines), "scores": [score(result).model_dump() for result in results], "runs": results,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Saved in {RESULT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
