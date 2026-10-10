import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(tmp_path / "worlds"))
    from app.main import app

    return TestClient(app)
