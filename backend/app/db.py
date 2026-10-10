"""Where the demo banks live on disk, and FeeGuard's own database file.

Each demo bank is one folder under the worlds directory. This module opens
only feeguard.db. Bank data is read through connector.py.
"""

import os
from pathlib import Path

FEEGUARD_DB = "feeguard.db"


def worlds_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "worlds"
    return Path(os.environ.get("WORLDS_DIR", default))


def storage_ready() -> bool:
    path = worlds_dir()
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError:
        return False
    return os.access(path, os.W_OK)
