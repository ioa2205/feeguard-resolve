"""Screenshots of the landing page (V2_PLAN W2) in each language, at 1440 and 390 px: every screen
from top to bottom, and the night scene at fixed points of its scroll. Prints, per language and
width, the script errors, how far the page sticks out sideways (it must be 0) and the page height.

    python scripts/browser/landing_shots.py docs/evidence/v2-landing-app [http://localhost:5173] [--langs uz,ru,en]
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
out.mkdir(parents=True, exist_ok=True)
NIGHT = [0.0, 0.14, 0.32, 0.45, 0.75]
WATCH = "window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push(String(e.reason))); true"

report = {}
browser = Browser()
try:
    for lang in langs:
        for width, height in ((1440, 900), (390, 844)):
            browser.size(width, height)
            browser.go(f"{app}/no-such-screen")  # an address of the app, so its storage can be set
            browser.js(f"localStorage.setItem('feeguard.ui-lang', '{lang}'); true")
            browser.go(f"{app}/")
            browser.js(WATCH)
            browser.js("document.fonts.ready.then(() => true)")
            time.sleep(6.5)  # the sentence is typed, then the lines under it arrive
            tag = f"{lang}-{width}"
            total = browser.js("document.documentElement.scrollHeight")
            night = browser.js("(() => { const n = document.getElementById('night'); if (!n) return null; const r = n.getBoundingClientRect(); return [r.top + scrollY, r.height] })()")
            y, n = 0, 0
            while y < total and n < 24:
                inside = night and night[0] - height < y < night[0] + night[1]
                if not inside:
                    browser.js(f"window.scrollTo(0, {y})")
                    time.sleep(2.6)
                    browser.shot(str(out / f"{tag}-{n:02d}.png"))
                    n += 1
                y += height - 80
            if night:
                for i, p in enumerate(NIGHT):
                    browser.js(f"window.scrollTo(0, {night[0]} + {p} * ({night[1]} - innerHeight))")
                    time.sleep(1.2)
                    browser.shot(str(out / f"{tag}-night{i}.png"))
            report[tag] = {
                "errors": browser.js("window.__errs"),
                "wider_px": browser.js("document.documentElement.scrollWidth - document.documentElement.clientWidth"),
                "page_height": total,
                "screens": n,
                "title": browser.js("document.title"),
                "html_lang": browser.js("document.documentElement.lang"),
            }
            print(tag, json.dumps(report[tag], ensure_ascii=False))
finally:
    browser.close()
(out / "landing-shots.json").write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding="utf-8")
