"""Screenshots of every product screen (V2_PLAN W1.6) in each language, at 1440 and 390 px. Each
picture is the whole page. Prints, per screen, the script errors and how far the page sticks out
sideways (it must be 0), and writes them to product-shots.json.

    python scripts/browser/product_shots.py docs/evidence/v2-product [http://localhost:5173] [--langs uz,ru,en] [--only case-right,others]

The screens are read-only except one: "others" runs Find others, which writes one audit entry.
"""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

out = Path(sys.argv[1])
app = sys.argv[2].rstrip("/") if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else "http://localhost:5173"
langs = sys.argv[sys.argv.index("--langs") + 1].split(",") if "--langs" in sys.argv else ["uz", "ru", "en"]
only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
out.mkdir(parents=True, exist_ok=True)

SCREENS = [
    ("complaints", "/app", 2.5),
    ("case-right", "/app/case/C-0306", 4.5),
    ("case-bank-right", "/app/case/C-0001", 3.5),
    ("case-not-checked", "/app/case/C-0010", 3.0),
    ("others", "/app/others/F-0306-1", 5.5),
    ("incidents", "/app/incidents", 3.0),
    ("incident", "/app/incidents/INC-DOUBLE-DEBIT", 3.5),
    ("report", "/app/report", 3.0),
    ("audit", "/app/audit", 3.0),
    ("phone", "/app/phone?customer=CU-00662", 3.5),
    ("demo", "/app/demo", 3.0),
    ("results", "/app/results", 4.0),
    ("not-found", "/app/no-such-screen", 2.0),
]
WATCH = "window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push(String(e.reason))); true"

report = {}
browser = Browser()
try:
    for lang in langs:
        for width, height in ((1440, 900), (390, 844)):
            browser.size(width, height)
            browser.go(f"{app}/app/no-such-screen")  # an address of the app, so its storage can be set
            browser.js(f"localStorage.setItem('feeguard.ui-lang', '{lang}'); localStorage.removeItem('feeguard.world'); localStorage.setItem('feeguard.actor', 'officer'); true")
            for name, path, wait in SCREENS:
                if only and name not in only:
                    continue
                browser.size(width, height)
                browser.go(app + path)
                browser.js(WATCH)
                browser.js("document.fonts.ready.then(() => true)")
                time.sleep(wait)
                wider = browser.js("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                total = browser.js("document.documentElement.scrollHeight")
                # The whole page in one picture: the screen grows to the page.
                browser.size(width, min(max(total, height), 9000))
                time.sleep(1.2)
                tag = f"{name}-{lang}-{width}"
                browser.shot(str(out / f"{tag}.png"))
                report[tag] = {
                    "errors": browser.js("window.__errs"),
                    "wider_px": wider,
                    "page_height": total,
                    "html_lang": browser.js("document.documentElement.lang"),
                    "words": browser.js("document.body.innerText.length"),
                }
                print(tag, json.dumps(report[tag], ensure_ascii=False))
finally:
    browser.close()
(out / "product-shots.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
bad = {tag: r for tag, r in report.items() if r["errors"] or r["wider_px"] > 0}
print(f"{len(report)} pictures; with a script error or sideways overflow: {len(bad)}")
for tag, r in bad.items():
    print(" ", tag, r["wider_px"], r["errors"])
