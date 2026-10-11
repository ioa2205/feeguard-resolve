"""A read-only walk through a deployed FeeGuard (Caddy in front, production build), in headless Edge.

    python scripts/browser/stack_walk.py https://<domain> [folder for pictures]

Opens the Complaints screen, checks complaint C-0016 of the default demo bank (seed 2026: taken twice),
opens Find others and the Scoreboard, and reports every Content-Security-Policy violation and
script error the pages raised. It presses no decision button, so it can run against the public site
before the demo. Checking a complaint writes one audit entry, as it does for any visitor.
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

        took, fonts = visit("/", "Complaints about loan payments", "stack-complaints-1280x720")
        step(f"Complaints screen shown after {took:.1f} s, {fonts} font files loaded")

        took, _ = visit("/case/C-0016", "CUSTOMER IS RIGHT", "stack-case-c0016-1280x720", timeout=120)
        line = next((x for x in b.text().split("\n") if "To return" in x), "")
        step(f"Case C-0016: Customer is right, {line.strip()}, {took:.1f} s after opening")

        b.click("Find others like this", tag="a, button")
        b.wait_text("never complained", timeout=60)
        problems.extend(f"/scan: {p}" for p in b.js("window.__problems || []"))
        if SHOTS:
            b.shot(str(SHOTS / "stack-find-others-1280x720.png"))
        head = [x.strip() for x in b.text().split("\n") if x.strip()[:1].isdigit()]
        step("Find others: " + " ".join(head[:3]))

        took, _ = visit("/sandbox/scoreboard", "hidden mistakes", "stack-scoreboard-1280x720", timeout=120)
        line = next((x for x in b.text().split("\n") if x.strip().startswith("FeeGuard found")), "")
        step(f"Scoreboard: {line.strip()} ({took:.1f} s)")
    finally:
        b.close()
    step(f"Problems raised by the pages: {len(problems)}")
    for problem in problems:
        print("  " + problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
