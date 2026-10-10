"""Drives the real app in headless Edge, the way a juror would. Prints each step and saves pictures.

Start the backend on :8000 and the frontend dev server on :5173 first, then:
    python scripts/browser/jury_walk.py <new seed>
Builds a demo bank, adds a debit by hand, writes a complaint, checks and confirms it,
saves a plan row, prints the report to PDF, opens the Scoreboard, the answer key and
the audit log, and measures every new screen at 360 px. Pictures go to docs/evidence/.
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
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 4242
WORLD = f"w-{SEED}"


def step(text):
    print(f"[{time.strftime('%H:%M:%S')}] {text}", flush=True)


def clean_customer(world_dir: Path):
    """A customer whose loan is paid by automatic debit and has no planted mistake (the harness may read the key)."""
    bank = sqlite3.connect(world_dir / "bank.db")
    truth = sqlite3.connect(world_dir / "truth.db")
    wronged = {row[0] for row in truth.execute("SELECT contract_id FROM ground_truth")}
    for contract_id, customer_id, name in bank.execute(
        """SELECT DISTINCT d.contract_id, c.customer_id, u.full_name FROM debits d
           JOIN contracts c ON c.id = d.contract_id JOIN customers u ON u.id = c.customer_id
           WHERE (SELECT count(*) FROM contracts x WHERE x.customer_id = c.customer_id) = 1
           ORDER BY d.contract_id"""
    ):
        if contract_id not in wronged:
            return contract_id, customer_id, name
    raise RuntimeError("no clean customer")


b = Browser()
try:
    b.size(1280, 720)
    b.go(f"{APP}/sandbox/build")
    b.wait_text("A new demo bank")
    b.shot(str(EVIDENCE / "c4-build-1280x720.png"))
    step("Build a demo bank: form shown")

    b.fill_labelled("Seed", SEED)
    b.click("Build the demo bank")
    took = b.wait_text("is ready and now open", timeout=180)
    step(f"demo bank {WORLD} built and opened in the browser after {took:.1f} s")
    b.shot(str(EVIDENCE / "c4-build-ready-1280x720.png"))

    contract_id, customer_id, name = clean_customer(ROOT / "worlds" / WORLD)
    step(f"chosen customer {customer_id} {name}, loan {contract_id}")
    b.fill_labelled("Customer name or number", customer_id)
    b.click("Find the customer")
    b.wait_text(customer_id)
    b.click(name)
    b.wait_text("Add the debit")
    b.fill_labelled("Amount", 345000)
    b.click("Add the debit")
    b.wait_text("was taken from")
    b.shot(str(EVIDENCE / "c4-debit-added-1280.png"), full=True)
    step("debit of 345 000 soʻm added by hand")

    b.click(f"write a complaint for {name}", tag="a")
    b.wait_text("Messages from the bank")
    b.wait_text("345 000")
    b.shot(str(EVIDENCE / "c4-customer-phone-1280.png"), full=True)
    step("A customer's phone shows the added debit")

    b.fill("textarea", "С моей карты второй раз сняли 345 000 сум за кредит. Верните, пожалуйста, деньги.")
    b.click("Send complaint")
    b.wait_text("The bank registered complaint")
    complaint_id = b.js("document.querySelector('[role=status] strong').innerText")
    step(f"complaint {complaint_id} sent")

    b.click("Check it in FeeGuard", tag="a")
    took = b.wait_text("CUSTOMER IS RIGHT")
    page = b.text()
    assert "345 000" in page, page[:2000]
    step(f"Case {complaint_id}: verdict 'Customer is right', 345 000 soʻm to return, shown {took:.1f} s after the click")
    b.shot(str(EVIDENCE / "c4-case-from-added-debit-1440.png"), full=False)

    b.click("Confirm")
    b.wait_text("Confirmed by")
    step("verdict confirmed")

    b.go(f"{APP}/reports")
    b.wait_text("Plan of measures")
    b.wait_text("Approve this row")
    b.js("""(() => { const el = document.querySelector('input[aria-label^="Responsible person"]');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, 'Dilshod Rahimov (invented)'); el.dispatchEvent(new Event('input', {bubbles: true})); })()""")
    b.click("Save this row")
    b.wait_text("Approve this row")
    b.wait_text("Quarterly analysis of complaints")
    b.wait_text("Recurring issues")
    b.shot(str(EVIDENCE / "c5-fix-plan-and-report-1280.png"), full=True)
    b.pdf(str(EVIDENCE / "c5-fix-plan-print.pdf"))
    step("Fix plan and report shown; a row saved; printed to PDF")

    b.go(f"{APP}/sandbox/scoreboard")
    b.wait_text("FeeGuard found", timeout=120)
    b.shot(str(EVIDENCE / "c6-scoreboard-own-bank-1280.png"), full=True)
    step("Scoreboard of the new bank: " + b.text().split("FeeGuard found", 1)[1][:160].replace("\n", " "))

    b.go(f"{APP}/sandbox/build#answer-key")
    b.wait_text("Show the answer key")
    b.click("Show the answer key")
    b.wait_text("Hidden cause")
    b.shot(str(EVIDENCE / "c4-answer-key-1280.png"), full=True)
    step("answer key shown")

    b.go(f"{APP}/audit")
    b.wait_text("CHAIN INTACT")
    b.shot(str(EVIDENCE / "c6-audit-1280x720.png"))
    lines = [line for line in b.text().split("\n") if line.strip()]
    head = next(i for i, line in enumerate(lines) if line.strip().upper().startswith("TIME"))
    step("Audit log: " + " | ".join(lines[head + 1:head + 12]))

    for path, name in (("/sandbox/scoreboard", "c6-scoreboard"), ("/audit", "c6-audit"), ("/reports", "c5-reports"),
                       ("/sandbox/build", "c4-build"), (f"/sandbox/customer?customer={customer_id}", "c4-customer-phone")):
        b.size(360, 740)
        b.go(f"{APP}{path}")
        time.sleep(2.5)
        wider = b.wider_than_screen()
        b.shot(str(EVIDENCE / f"{name}-360.png"))
        step(f"360 px: {path} is {wider} px wider than the screen")
finally:
    b.close()
