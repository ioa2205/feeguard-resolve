"""Measures the three speeds of task P4 through the public API, the way a visitor meets them.

    python scripts/speed_check.py https://<domain> --seed <a seed nobody used>
    python scripts/speed_check.py http://127.0.0.1:8000 --seed 9101

On Windows use 127.0.0.1, not localhost: localhost tries IPv6 first and adds 2 s to every call.
With --world an existing bank is measured instead of building a new one (no build time then).

Standard library only, so it runs from any laptop against the server. It builds one new
20,000-loan demo bank (one build at a time; it may delete the oldest demo bank to make room),
checks five of its complaints, then runs Find others. Every time is wall clock seen by this
script, so it includes the network; the server's own time is printed beside it.
Paste the printed table into docs/EVAL.md, "Speed on the VPS", with the date, commit and server size.
"""

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")


def call(base, method, path, world=None, body=None, timeout=120):
    headers = {"X-Actor": "jury"}
    if world:
        headers["X-World-Id"] = world
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            answer = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f"{method} {path} answered {error.code}: {error.read().decode(errors='replace')}") from None
    return answer, time.perf_counter() - started


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure investigate, scan and building a 20,000-loan bank.")
    parser.add_argument("base", help="for example https://feeguard.example.uz or http://localhost:8000")
    parser.add_argument("--seed", type=int, help="a seed that has not been built on this server")
    parser.add_argument("--world", help="measure this existing demo bank instead of building one")
    parser.add_argument("--complaints", type=int, default=5)
    args = parser.parse_args()
    base = args.base.rstrip("/")

    health, _ = call(base, "GET", "/api/health")
    print(f"health: {health}")

    if args.world:
        world, built = args.world, None
    else:
        if args.seed is None:
            raise SystemExit("give --seed for a new bank, or --world for an existing one")
        world, built = build(base, args.seed)
    measure(base, world, built, args.complaints)


def build(base, seed):
    created, _ = call(base, "POST", "/api/worlds", body={
        "seed": seed, "size": 20000, "traps": 20, "complaint_rate": 0.15, "surprise": False,
        "defects": {"DOUBLE_DEBIT": 0.02, "EARLY_DEBIT": 0.02, "LATE_POSTING": 0.02, "ILLEGAL_FEE": 0.02},
    })
    world = created["world_id"]
    started = time.perf_counter()
    while True:
        state, _ = call(base, "GET", f"/api/worlds/{world}")
        if state["status"] != "building":
            break
        time.sleep(0.5)
    built = time.perf_counter() - started
    if state["status"] != "ready":
        raise SystemExit(f"building {world} failed")
    print(f"new 20,000-loan bank {world}: ready after {built:.1f} s")
    return world, built


def measure(base, world, built, wanted):
    # The first complaints of the register may all be look-alikes; checking goes on until one
    # gives a mistake to scan. Every check is timed.
    complaints, _ = call(base, "GET", "/api/complaints", world)
    checks, server_ms, finding = [], [], None
    for item in complaints["items"]:
        if len(checks) >= wanted and finding:
            break
        case, seconds = call(base, "POST", f"/api/cases/{item['complaint_id']}/investigate", world)
        checks.append(seconds)
        server_ms.append(case["elapsed_ms"])
        print(f"investigate {item['complaint_id']}: {seconds:.2f} s (server {case['elapsed_ms']} ms), {case['verdict']}")
        if finding is None and case["findings"]:
            finding = case["findings"][0]["finding_id"]
    if finding is None:
        raise SystemExit("no complaint of this bank gave a mistake to scan")

    scans = []
    for number in range(4):
        result, seconds = call(base, "POST", f"/api/findings/{finding}/scan", world, timeout=300)
        scans.append(seconds)
        print(f"scan {number + 1}: {seconds:.2f} s (server {result['elapsed_ms']} ms), "
              f"{result['affected_customers']} customers, {result['silent']} never complained")

    print()
    print("| Action | Target | Measured |")
    print("|---|---|---|")
    print(f"| Investigate one complaint | under 10 s | median {statistics.median(checks):.2f} s, slowest {max(checks):.2f} s "
          f"({len(checks)} complaints; server median {statistics.median(server_ms):.0f} ms) |")
    print(f"| Scan 20,000 loans | under 5 s | first {scans[0]:.2f} s (waits for the first pass over the new bank), "
          f"then median {statistics.median(scans[1:]):.2f} s |")
    print(f"| Create a 20,000-loan bank | under 60 s | {f'{built:.1f} s' if built else 'not measured (existing bank)'} |")


if __name__ == "__main__":
    main()
