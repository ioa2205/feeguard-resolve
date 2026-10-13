"""Every action of the product, done for real in headless Edge, the way a visitor would
(V2_PLAN W1.6). It prints what each step showed and, with a folder, saves pictures.

    python scripts/browser/product_walk.py [folder for pictures] [http://localhost:5173]

It WRITES to the open demo bank: it checks a complaint, approves, corrects and rejects three
others, takes one incident through propose, approve and tell, sends a complaint from the
customer's phone, builds a demo bank, adds a debit in it and loads a public case. Run it on a
scratch copy (WORLDS_DIR), never on the live demo. Start the backend on :8000 and the frontend
dev server on :5173 first. Windows with Microsoft Edge; needs `websocket-client`.
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("http") else None
APP = next((arg.rstrip("/") for arg in sys.argv[1:] if arg.startswith("http")), "http://localhost:5173")
WATCH = ("window.__errs = window.__errs || []; if (!window.__w) { window.__w = 1; "
         "addEventListener('error', e => __errs.push(String(e.message))); "
         "addEventListener('unhandledrejection', e => __errs.push(String(e.reason))) }; true")


def api(path):
    with urllib.request.urlopen(APP + path) as response:
        return json.load(response)


complaints = api("/api/complaints?limit=500")["items"]
unchecked = next(c["complaint_id"] for c in complaints if c["status"] == "NEW")
waiting = [c["complaint_id"] for c in complaints if c["status"] == "CHECKED"]
if len(waiting) < 3:
    sys.exit("The open demo bank needs at least 3 complaints waiting for a decision.")
to_approve, to_correct, to_reject = waiting[-1], waiting[-2], waiting[0]
incident = next((i["incident_id"] for i in api("/api/incidents")["items"] if i["status"] == "OPEN" and i["total_excess"] > 0), None)
customer = api("/api/customers?limit=1")["items"][0]["customer_id"]

b = Browser()
errors = []


def go(path, wait=2.5):
    b.go(APP + path)
    b.js(WATCH)
    time.sleep(wait)


def text(selector):
    return b.js(f"(document.querySelector({json.dumps(selector)}) || {{}}).innerText || ''").replace("\n", " | ")


def press(label):
    found = b.js(
        f"(() => {{ const el = [...document.querySelectorAll('button, a')].find(e => e.offsetParent !== null && "
        f"e.innerText.trim().startsWith({json.dumps(label)})); if (!el) return false; el.click(); return true }})()")
    if not found:
        errors.append(f"no button: {label}")
    return found


def done(name):
    errors.extend(b.js("window.__errs || []"))
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        b.shot(str(OUT / f"walk-{name}.png"))


def step(words):
    print(f"[{time.strftime('%H:%M:%S')}] {words}", flush=True)


try:
    b.size(1440, 900)
    go("/app/no-such-screen", 1.5)
    b.js("localStorage.setItem('feeguard.ui-lang', 'en'); localStorage.removeItem('feeguard.world'); localStorage.setItem('feeguard.actor', 'officer'); true")

    go("/app")
    b.js("document.querySelector('.lang__btn').click(); true")
    time.sleep(0.4)
    b.js("[...document.querySelectorAll('.lang__menu button')].find(x => x.lang === 'ru').click(); true")
    time.sleep(0.6)
    address, lang = b.js("location.pathname"), b.js("document.documentElement.lang")
    step(f"language: Russian chosen, address {address}, lang {lang}, title {text('.h-big')}")
    b.js("document.querySelector('.lang__btn').click(); true")
    time.sleep(0.3)
    b.js("[...document.querySelectorAll('.lang__menu button')].find(x => x.lang === 'en').click(); true")
    time.sleep(0.5)
    press("Demo tools")
    time.sleep(0.5)
    done("demo-tools")
    opened = b.js("document.querySelector('.tools-menu').hasAttribute('data-open')")
    step(f"demo tools: open {opened}")

    go(f"/app/case/{unchecked}")
    before = text(".sheet.pad .h2")
    press("Check this complaint")
    time.sleep(4.5)
    step(f"check {unchecked}: '{before}' -> {text('.stamp')}, {text('.money')}")
    done("checked")

    go(f"/app/case/{to_approve}", 3)
    b.fill(".field textarea.input", "Checked against the statement.")
    press("Approve the reply")
    time.sleep(2)
    step(f"approve {to_approve}: {text('.decided')}")
    done("approved")

    go(f"/app/case/{to_correct}", 3)
    press("Correct the verdict")
    time.sleep(0.8)
    b.fill(".correct input.input", "3000000")
    press("Save the correction")
    time.sleep(2)
    step(f"correct {to_correct}: {text('.decided')}")

    go(f"/app/case/{to_reject}", 3)
    press("Reject it")
    time.sleep(2)
    step(f"reject {to_reject}: {text('.decided')}")
    go("/app")
    step(f"complaints: {text('.waiting p')}")

    if incident:
        go(f"/app/incidents/{incident}", 4)
        press("Propose the refund")
        time.sleep(3)
        step(f"incident {incident}, proposed: {text('.sheet.pad .h2')}")
        press("Approve the refund")
        time.sleep(2)
        step(f"  the officer tries to approve: {text('.problem p')}")
        done("incident-four-eyes")
        b.js("localStorage.setItem('feeguard.actor', 'compliance'); true")
        go(f"/app/incidents/{incident}", 4)
        press("Approve the refund")
        time.sleep(3)
        step(f"  approved as compliance head: {text('.sheet.pad .h2')}")
        press("Tell the customers")
        time.sleep(4)
        step(f"  told: {text('.sheet.pad .h2')}")
        done("incident-told")
        b.js("localStorage.setItem('feeguard.actor', 'officer'); true")

    go(f"/app/phone?customer={customer}", 3.5)
    b.fill(".write textarea", "Iyul oyida kredit toʻlovim ikki marta yechildi. Pulimni qaytaring.")
    press("Send the complaint")
    time.sleep(9)
    states = b.js("[...document.querySelectorAll('.step')].map(x => x.className.replace('step ', '')).join(',')")
    step(f"phone: complaint sent as {customer}; live run steps: {states}")
    done("phone-live-run")

    go("/app/results", 4)
    press("Show the answer key")
    time.sleep(3)
    key_rows = b.js("document.querySelectorAll('#answer-key .tbl tbody tr').length")
    step(f"results: {text('.headline')}; answer key rows shown: {key_rows}")

    go("/app/report", 3.5)
    measures = b.js("[...document.querySelectorAll('.sheet.pad h3.h3')].map(x => x.innerText).join(' ; ')")
    step(f"report: measures {measures}")
    done("report")

    go("/app/demo", 3)
    b.fill(".fields-row input[type=number]", str(1000 + int(time.time()) % 9000))  # a bank number nobody used
    press("Build the demo bank")
    for _ in range(90):
        time.sleep(2)
        if "built=" in b.js("location.search"):
            break
    time.sleep(2)
    step(f"demo bank built: {text('.decided .ok-line')}")
    b.js("document.querySelector('#debit .picker li button').click(); true")
    time.sleep(2.5)
    press("Add the debit")
    time.sleep(2.5)
    step(f"debit added: {text('#debit .decided')}")
    done("debit-added")
    press("Load this public case")
    for _ in range(60):
        time.sleep(1.5)
        if "case=" in b.js("location.search"):
            break
    go("/app", 3)
    step(f"public case open: {text('.empty')[:120]}")
    b.js("localStorage.removeItem('feeguard.world'); true")

    go("/app/audit", 3)
    step(f"audit log: {text('.ok-line')}")
    for old in ("/case/x", "/scan/x", "/reports", "/audit", "/sandbox/customer", "/sandbox/build", "/sandbox/scoreboard"):
        go(old, 2)
        now = b.js("location.pathname")
        step(f"old address {old} -> {now}")
    errors.extend(b.js("window.__errs || []"))
finally:
    b.close()
step(f"script errors and missing buttons in the whole walk: {len(errors)}")
for error in errors:
    print("  " + error)
sys.exit(1 if errors else 0)
