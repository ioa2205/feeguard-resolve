"""The pictures of the landing page's link previews (V2_PLAN W2): the first screen of /uz, /ru and
/en, taken at 1600 x 840 and saved at 1200 x 630 in frontend/public/og/.

    python scripts/browser/og_images.py [http://localhost:5173]
"""

import io
import base64
import sys
import time
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from cdp import Browser  # noqa: E402

APP = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:5173"
OUT = Path(__file__).resolve().parents[2] / "frontend" / "public" / "og"
OUT.mkdir(parents=True, exist_ok=True)

browser = Browser()
try:
    browser.size(1600, 840)
    for lang in ("uz", "ru", "en"):
        browser.go(f"{APP}/{lang}")
        browser.js("document.fonts.ready.then(() => true)")
        time.sleep(6.5)  # the sentence is typed, its red line drawn, the caret gone
        browser.js("document.querySelector('.lp .cue')?.remove(); document.documentElement.style.overflow = 'hidden'; true")
        data = browser.send("Page.captureScreenshot", format="png")["data"]
        picture = Image.open(io.BytesIO(base64.b64decode(data))).convert("RGB").resize((1200, 630), Image.LANCZOS)
        path = OUT / f"landing-{lang}.png"
        picture.save(path, optimize=True)
        print(path.name, picture.size, path.stat().st_size // 1024, "KB")
finally:
    browser.close()
