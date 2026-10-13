"""Save the landing page's story from the API, for when the API does not answer (D-048).

The landing page reads `GET /api/landing` live. This copy of the same answer is shown only when
that call fails or is slow, and the page then says the numbers come from a saved copy. Run it
against the default demo bank (seed 2026, 20 000 loans) after its complaint C-0306 is checked:

    python scripts/landing_snapshot.py [http://localhost:8000]
"""

import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
OUT = Path(__file__).resolve().parent.parent / "frontend" / "src" / "landing" / "story-snapshot.json"

with urllib.request.urlopen(f"{BASE}/api/landing", timeout=120) as response:
    story = json.load(response)

saved = {
    "made": datetime.now().isoformat(timespec="minutes"),
    "source": f"{BASE}/api/landing",
    "story": story,
}
OUT.write_text(json.dumps(saved, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{OUT.name}: {len(story['rows'])} loans, {story['incident']['customers']} customers, {OUT.stat().st_size // 1024} KB")
