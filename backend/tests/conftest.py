import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _no_rate_limit(monkeypatch):
    """The suite sends hundreds of requests from one address; tests/test_limits.py turns the limit back on."""
    monkeypatch.setenv("RATE_LIMIT", "off")
    # Tests never reach Gemini, even when a key is set in the shell (D-037); tests/test_gemini.py uses a fake one.
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(tmp_path / "worlds"))
    monkeypatch.setenv("SCAN_WARM_UP", "0")  # no background pass over a bank that the test deletes
    from app.main import app

    return TestClient(app)
