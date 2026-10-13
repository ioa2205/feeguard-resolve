"""A read-only walk through a deployed FeeGuard (Caddy in front, production build), in headless Edge.

    python scripts/browser/stack_walk.py https://<domain> [folder for pictures]

Opens the landing page and the Complaints screen, opens complaint C-0016 of the main demo bank
(taken twice), opens Find others and the Results, and reports every Content-Security-Policy
violation and script error the pages raised. It presses no decision button, so it can run against
the public site. Find others writes one audit entry, as it does for any visitor.
Accepts the self-signed certificate of a local run (Caddy with DOMAIN=localhost).
Windows with Microsoft Edge; needs `websocket-client`.
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cdp import Browser  # noqa: E402

sys.stdout.reconfigure(encoding="utf-8")
BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://localhost"
SHOTS = Path(sys.argv[2]) if len(sys.argv) > 2 else None
WATCH = """
window.__problems = [];
document.addEventListener('securitypolicyviolation', e => window.__problems.push('CSP ' + e.violatedDirective + ' ' + e.blockedURI));
window.addEventListener('error', e => window.__problems.push('error ' + e.message));
window.addEventListener('unhandledrejection', e => window.__problems.push('rejection ' + String(e.reason)));
"""
HEADLINE = "[...document.querySelectorAll('.headline > div')].map(x => x.innerText.replace(/\\s+/g, ' ')).join('; ')"


def step(text):
    print(f"[{time.strftime('%H:%M:%S')}] {text}", flush=True)


def main() -> int:
    problems = []
    b = Browser()
    try:
        b.send("Security.setIgnoreCertificateErrors", ignore=True)
        b.send("Page.addScriptToEvaluateOnNewDocument", source=WATCH)
        b.size(1280, 720)

        def visit(path, wanted, name, timeout=60):
            started = time.monotonic()
            b.go(f"{BASE}{path}")
            b.wait_text(wanted, timeout=timeout)
            took = time.monotonic() - started
            fonts = b.js("document.fonts.ready.then(() => [...document.fonts].filter(f => f.status === 'loaded').length)")
            problems.extend(f"{path}: {p}" for p in b.js("window.__problems || []"))
            if SHOTS:
                SHOTS.mkdir(parents=True, exist_ok=True)
                b.shot(str(SHOTS / f"{name}.png"))
            return took, fonts

        took, fonts = visit("/en", "How it works", "stack-landing-1280x720")
        step(f"Landing page shown after {took:.1f} s, {fonts} font files loaded")
        b.js("localStorage.setItem('feeguard.ui-lang', 'en'); true")

        took, _ = visit("/app", "FeeGuard checks each one", "stack-complaints-1280x720")
        step(f"Complaints screen shown after {took:.1f} s")

        took, _ = visit("/app/case/C-0016", "CUSTOMER IS RIGHT", "stack-complaint-c0016-1280x720", timeout=120)
        line = next((x for x in b.text().split("\n") if "to return to the customer" in x), "")
        step(f"Complaint C-0016: Customer is right, {line.strip()}, {took:.1f} s after opening")

        b.click("Find others", tag="a.btn")
        b.wait_text("never complained", timeout=60)
        problems.extend(f"/app/others: {p}" for p in b.js("window.__problems || []"))
        if SHOTS:
            b.shot(str(SHOTS / "stack-find-others-1280x720.png"))
        step("Find others: " + b.js(HEADLINE))

        took, _ = visit("/app/results", "hidden mistakes found", "stack-results-1280x720", timeout=120)
        step(f"Results: {b.js(HEADLINE)} ({took:.1f} s)")
    finally:
        b.close()
    step(f"Problems raised by the pages: {len(problems)}")
    for problem in problems:
        print("  " + problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
