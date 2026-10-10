"""Calls the local model at LLM_URL with an 8-second limit. Task B3.

The only code that talks to a model. The address must be on this machine or on
the internal network (CLAUDE.md rule 4). Any other address is treated as "no
model", so nothing can leave by accident. Without a model, or when it is slow
or down, the caller falls back to rules and says so.
"""

import ipaddress
import json
import os
import time
from urllib.parse import urlsplit

import httpx

TIME_LIMIT = 8.0  # seconds for one complaint, retries included
LOCAL_NAMES = {"localhost", "ollama", "host.docker.internal"}
STATUS_FOR = 30.0  # seconds a health answer is reused

# Tests put a fake model here. Nothing else may.
transport: httpx.BaseTransport | None = None
_status: tuple[float, bool] | None = None


class LlmUnavailable(Exception):
    """No model is set up, or it was slow or down."""


class LlmBadAnswer(LlmUnavailable):
    """The model answered, but not in the asked form. Worth asking once more."""


def is_local(url: str) -> bool:
    host = urlsplit(url).hostname or ""
    if host in LOCAL_NAMES:
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        # A bare name with no dot is a service on the internal Docker network.
        return bool(host) and "." not in host
    return address.is_loopback or address.is_private


def check_address() -> None:
    """Start-up check (PLAN Part 8): an LLM_URL that is not local stops the app."""
    url = os.environ.get("LLM_URL", "").strip()
    if url and not is_local(url):
        raise RuntimeError(
            "LLM_URL must point to a model on this machine or the internal Docker network. "
            "FeeGuard never sends complaint text to an outside AI service."
        )


def settings() -> tuple[str, str] | None:
    """The model address and name, or None when no local model is set up."""
    url = os.environ.get("LLM_URL", "").rstrip("/")
    model = os.environ.get("LLM_MODEL", "")
    if not url or not model or not is_local(url):
        return None
    return url, model


def ask_json(system: str, user: str, schema: dict, time_left: float, max_tokens: int = 150) -> dict:
    """One question, one answer in the given JSON form, at most `max_tokens` long."""
    found = settings()
    if not found or time_left <= 0:
        raise LlmUnavailable
    url, model = found
    request = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "stream": False,
        "format": schema,
        "options": {"temperature": 0, "num_predict": max_tokens},
        "keep_alive": "30m",
    }
    try:
        with httpx.Client(timeout=time_left, transport=transport) as client:
            response = client.post(f"{url}/api/chat", json=request)
            response.raise_for_status()
    except httpx.HTTPError as error:
        raise LlmUnavailable from error
    try:
        answer = json.loads(response.json()["message"]["content"])
    except (KeyError, TypeError, ValueError) as error:
        raise LlmBadAnswer from error
    if not isinstance(answer, dict):
        raise LlmBadAnswer
    return answer


def status() -> tuple[str, str | None]:
    """("llm" or "rules", model name). A quick check, reused for half a minute."""
    global _status
    found = settings()
    if not found:
        return "rules", None
    url, model = found
    now = time.monotonic()
    if _status is None or now - _status[0] > STATUS_FOR:
        try:
            with httpx.Client(timeout=1.0, transport=transport) as client:
                alive = client.get(f"{url}/api/tags").status_code == 200
        except httpx.HTTPError:
            alive = False
        _status = (now, alive)
    return ("llm" if _status[1] else "rules"), model
