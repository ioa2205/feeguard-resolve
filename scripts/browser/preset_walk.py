"""Drives the real-case presets (task P1) in headless Edge: one click loads a preset, one complaint finds the group.

Start the backend on :8000 and the frontend dev server on :5173 first, then:
    python scripts/browser/preset_walk.py
For each preset: "Load this public case", open one complaint about it, check it, "Find others like this".
Then a second click on a preset that is already built, and the screen at 360 px. Pictures go to docs/evidence/.
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
EVIDENCE = ROOT / "docs" / "evidence"
APP = "http://localhost:5173"
PRESETS = (("issuance-fee", "ILLEGAL_FEE", "Issuance fee not allowed"), ("late-posting", "LATE_POSTING", "Recorded late, then fined"))


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
try:
    b.size(1280, 720)
    for number, (preset_id, mistake, title) in enumerate(PRESETS, start=1):
        world_id = f"preset-{preset_id}"
        b.go(f"{APP}/sandbox/build")
        b.wait_text("Public cases")
        if number == 1:
            b.shot(str(EVIDENCE / "p1-public-cases-1280.png"), full=True)
        built_before = (ROOT / "worlds" / world_id / "bank.db").is_file()
        b.js(f"""[...document.querySelectorAll('button')].filter(e => e.innerText.trim() === 'Load this public case')[{number - 1}].click()""")
        took = b.wait_text("This public case is now the open demo bank", timeout=180)
        step(f"{title}: one click, demo bank {world_id} open after {took:.1f} s "
             f"({'already built' if built_before else 'built by this click'})")
        b.shot(str(EVIDENCE / f"p1-{preset_id}-loaded-1280.png"), full=True)

        b.go(f"{APP}/")
        b.wait_text("This demo bank rebuilds a public case")
        if number == 1:
            b.shot(str(EVIDENCE / "p1-complaints-public-case-1280x720.png"))
        complaint_id = wronged_complaint(world_id, mistake)
        b.go(f"{APP}/case/{complaint_id}")
        took = b.wait_text("CUSTOMER IS RIGHT", timeout=60)
        step(f"{title}: complaint {complaint_id} checked, 'Customer is right', shown after {took:.1f} s")
        b.shot(str(EVIDENCE / f"p1-{preset_id}-case-1280.png"))

        b.click("Find others like this", tag="a, button")
        took = b.wait_text("of them never complained", timeout=60)
        # The three sentences of the headline: customers hit, never complained, soʻm.
        headline = b.js("""(() => { const p = [...document.querySelectorAll('h2, p, div')]
            .filter(e => e.innerText.includes('of them never complained')).pop(); return p.innerText; })()""")
        headline = " ".join(headline.split())
        step(f"{title}: Find others after {took:.1f} s: {headline.strip()}")
        b.wait_text("Why it happened")
        b.shot(str(EVIDENCE / f"p1-{preset_id}-find-others-1280.png"), full=True)

    b.go(f"{APP}/sandbox/build")
    b.wait_text("Public cases")
    b.js("""[...document.querySelectorAll('button')].filter(e => e.innerText.trim() === 'Load this public case')[0].click()""")
    took = b.wait_text("This public case is now the open demo bank", timeout=60)
    step(f"second click on a built preset: open after {took:.1f} s")

    b.size(360, 740)
    b.go(f"{APP}/sandbox/build")
    b.wait_text("Public cases")
    time.sleep(2)
    b.js("[...document.querySelectorAll('h2')].find(h => h.innerText === 'Public cases').scrollIntoView()")
    wider = b.wider_than_screen()
    b.shot(str(EVIDENCE / "p1-public-cases-360.png"))
    step(f"360 px: /sandbox/build is {wider} px wider than the screen")
    b.go(f"{APP}/")
    b.wait_text("This demo bank rebuilds a public case")
    time.sleep(1)
    wider = b.wider_than_screen()
    b.shot(str(EVIDENCE / "p1-complaints-public-case-360.png"))
    step(f"360 px: Complaints is {wider} px wider than the screen")
finally:
    b.close()
