"""Drives the public cases in headless Edge: one click loads a case, one complaint finds the group.

Start the backend on :8000 and the frontend dev server on :5173 first, then:
    python scripts/browser/preset_walk.py [folder for pictures]
For each public case: "Load this public case", open one complaint about it, check it, "Find others".
Then a second click on a case that is already built, and the screens at 390 px.
Windows with Microsoft Edge; needs the `websocket-client` package.
"""

import sqlite3
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cdp import Browser  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
APP = "http://localhost:5173"
PRESETS = (("issuance-fee", "ILLEGAL_FEE", "Issuance fee not allowed"), ("late-posting", "LATE_POSTING", "Recorded late, then fined"))
HEADLINE = "[...document.querySelectorAll('.night .headline > div')].map(x => x.innerText.replace(/\\s+/g, ' ')).join('; ')"


def step(text):
    print(f"[{time.strftime('%H:%M:%S')}] {text}", flush=True)


def wronged_complaint(world_id: str, mistake: str) -> str:
    """A complaint from a customer the preset really wronged. The harness may read the answer key; FeeGuard never does."""
    truth = sqlite3.connect(ROOT / "worlds" / world_id / "truth.db")
    try:
        return truth.execute(
            "SELECT complaint_id FROM complaint_key WHERE kind = 'VICTIM' AND claim_type = ? ORDER BY 1", (mistake,)
        ).fetchone()[0]
    finally:
        truth.close()


b = Browser()


def shot(name, full=False):
    if EVIDENCE:
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        b.shot(str(EVIDENCE / name), full=full)


def load(number):
    """Presses the n-th "Load this public case" and waits until that bank is the open one."""
    b.js(f"[...document.querySelectorAll('button')].filter(e => e.innerText.trim() === 'Load this public case')[{number - 1}].click()")
    return b.wait_text("It is open: see the complaints", timeout=180)


try:
    b.size(1280, 720)
    b.go(f"{APP}/app/no-such-screen")
    b.js("localStorage.setItem('feeguard.ui-lang', 'en'); true")
    for number, (preset_id, mistake, title) in enumerate(PRESETS, start=1):
        world_id = f"preset-{preset_id}"
        b.go(f"{APP}/app/demo")
        b.wait_text("Public cases")
        built_before = (ROOT / "worlds" / world_id / "bank.db").is_file()
        took = load(number)
        step(f"{title}: one click, demo bank {world_id} open after {took:.1f} s "
             f"({'already built' if built_before else 'built by this click'})")
        shot(f"public-{preset_id}-loaded-1280.png", full=True)

        b.go(f"{APP}/app")
        b.wait_text("This demo bank rebuilds a public case")
        complaint_id = wronged_complaint(world_id, mistake)
        b.go(f"{APP}/app/case/{complaint_id}")
        b.wait_text("Complaint")
        time.sleep(1.5)
        if b.js("[...document.querySelectorAll('button')].some(e => e.innerText.trim() === 'Check this complaint')"):
            b.click("Check this complaint", tag="button")
        took = b.wait_text("CUSTOMER IS RIGHT", timeout=60)
        step(f"{title}: complaint {complaint_id} checked, 'Customer is right', shown after {took:.1f} s")
        shot(f"public-{preset_id}-complaint-1280.png", full=True)

        b.click("Find others", tag="a.btn")
        took = b.wait_text("never complained", timeout=60)
        # The three numbers of the headline: customers hit, never complained, soʻm.
        step(f"{title}: Find others after {took:.1f} s: {b.js(HEADLINE)}")
        b.wait_text("Why it happened")
        shot(f"public-{preset_id}-find-others-1280.png", full=True)

    b.go(f"{APP}/app/demo")
    b.wait_text("Public cases")
    took = load(1)
    step(f"second click on a built public case: open after {took:.1f} s")

    b.size(390, 844)
    b.go(f"{APP}/app/demo")
    b.wait_text("Public cases")
    time.sleep(2)
    step(f"390 px: demo tools is {b.wider_than_screen()} px wider than the screen")
    b.go(f"{APP}/app")
    b.wait_text("This demo bank rebuilds a public case")
    time.sleep(1)
    step(f"390 px: Complaints is {b.wider_than_screen()} px wider than the screen")
    shot("public-complaints-390.png")
    b.js("localStorage.removeItem('feeguard.world'); true")
finally:
    b.close()
