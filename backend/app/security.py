"""Limits on the public API (PLAN Part 22). Task SEC1.

The site has no password, so abuse is held back here: a cap on the size of a
request, and a limit on requests per address and minute. Only Caddy reaches the
backend, and Caddy adds the real client address last to X-Forwarded-For, so
that last entry is trusted only when the request comes from an internal address.

One build at a time, the two sizes, the rates and the text length are checked
where they are used (generator/world.py and schemas.py).
"""

import ipaddress
import os
import threading
from collections import deque

MAX_BODY = 64 * 1024  # bytes; the longest real request, a complaint, is about 8 KB
WINDOW = 60.0  # seconds
# Requests per address and minute. Generous, because a jury may sit behind one address.
LIMITS = {"write": 120, "read": 1200}
WRITES = ("POST", "PUT", "PATCH", "DELETE")
MAX_ADDRESSES = 10_000  # remembered at once; idle ones are dropped first


def enabled() -> bool:
    return os.environ.get("RATE_LIMIT", "on") != "off"


def _internal(host: str) -> bool:
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_private or address.is_loopback


def client_address(peer: str | None, forwarded_for: str | None) -> str:
    """The address a request came from. Behind Caddy it is the last X-Forwarded-For entry."""
    peer = peer or "unknown"
    if forwarded_for and _internal(peer):
        return forwarded_for.split(",")[-1].strip() or peer
    return peer


class Limiter:
    """A sliding window of request times per (address, kind)."""

    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque] = {}
        self._lock = threading.Lock()

    def allow(self, address: str, kind: str, now: float) -> bool:
        with self._lock:
            if len(self._hits) >= MAX_ADDRESSES:
                self._drop_idle(now)
            hits = self._hits.setdefault((address, kind), deque())
            while hits and now - hits[0] > WINDOW:
                hits.popleft()
            if len(hits) >= LIMITS[kind]:
                return False
            hits.append(now)
            return True

    def _drop_idle(self, now: float) -> None:
        for key in [key for key, hits in self._hits.items() if not hits or now - hits[-1] > WINDOW]:
            del self._hits[key]

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = Limiter()
