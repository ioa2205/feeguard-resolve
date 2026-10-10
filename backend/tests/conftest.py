import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(tmp_path / "worlds"))
    monkeypatch.setenv("SCAN_WARM_UP", "0")  # no background pass over a bank that the test deletes
    from app.main import app

    return TestClient(app)
