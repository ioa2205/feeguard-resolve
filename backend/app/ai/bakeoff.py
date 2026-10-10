"""Model bake-off: the same sample complaints through each candidate model. Task B1.

Run it on the server that will host the model, with Ollama up and the
candidates pulled:

    LLM_URL=http://localhost:11434 python -m app.ai.bakeoff <model> <model> ...

For each model it prints how often the answer came back in the asked form, how
often the claim type and the month were right, and how long one complaint took.
Write the numbers and the choice in docs/DECISIONS.md. Check each model's
licence on its own page before choosing: it must allow commercial use.

The samples are data/ai_written_samples.jsonl. An AI wrote them, for this
choice and for unit tests only. They are not the hand-written test set of
Proof 3 and must never be reported as such.
"""

import json
import os
import statistics
import sys
import time
from datetime import date
from pathlib import Path

from . import llm
from .parse_complaint import parse

SAMPLES = Path(__file__).resolve().parents[2] / "data" / "ai_written_samples.jsonl"


def load_samples() -> list[dict]:
    return [json.loads(line) for line in SAMPLES.read_text(encoding="utf-8").splitlines() if line.strip()]


def run(model: str, samples: list[dict]) -> dict:
    os.environ["LLM_MODEL"] = model
    answered = claims = months = 0
    seconds = []
    for sample in samples:
        started = time.perf_counter()
        reading = parse(sample["text"], date.fromisoformat(sample["received"]))
        seconds.append(time.perf_counter() - started)
        if reading.mode == "llm":
            # Only an answer the model gave counts. A fallback to rules is a miss.
            answered += 1
            claims += reading.claim_type == sample["claim_type"]
            months += reading.period == sample["period"]
    return {
        "model": model, "n": len(samples), "answered": answered, "claims": claims, "months": months,
        "median_s": statistics.median(seconds), "slowest_s": max(seconds),
    }


def main() -> int:
    models = sys.argv[1:]
    if not models:
        print(__doc__)
        return 2
    if not os.environ.get("LLM_URL") or not llm.is_local(os.environ["LLM_URL"]):
        print("Set LLM_URL to the local Ollama address, for example http://localhost:11434.")
        return 2
    samples = load_samples()
    print(f"{'model':<28} {'in form':>8} {'claim':>7} {'month':>7} {'median':>8} {'slowest':>8}")
    for model in models:
        result = run(model, samples)
        n = result["n"]
        print(
            f"{model:<28} {result['answered']:>5}/{n} {result['claims']:>4}/{n} {result['months']:>4}/{n}"
            f" {result['median_s']:>6.1f} s {result['slowest_s']:>6.1f} s"
        )
    print(f"The limit for one complaint is {llm.TIME_LIMIT:.0f} s. Slower answers fall back to rules.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
