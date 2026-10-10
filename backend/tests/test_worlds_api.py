"""Building a demo bank through the API (task A1)."""

import threading
import time

from app.generator import world

REQUEST = {
    "seed": 7741,
    "size": 5000,
    "defects": {"DOUBLE_DEBIT": 0.02, "ILLEGAL_FEE": 0.03},
    "complaint_rate": 0.15,
    "traps": 8,
    "surprise": False,
}


def wait_until(condition, seconds=60):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return False


def test_a_new_demo_bank_is_built_in_the_background_and_becomes_ready(client):
    created = client.post("/api/worlds", json=REQUEST, headers={"X-Actor": "jury"})
    world_id = created.json()["world_id"]

    assert created.status_code == 200
    assert wait_until(lambda: client.get(f"/api/worlds/{world_id}").json()["status"] == "ready")
    shown = client.get(f"/api/worlds/{world_id}").json()
    # Exactly these fields. The hidden settings are never shown.
    assert shown == {
        "world_id": world_id, "status": "ready", "progress": 100,
        "size": 5000, "seed": 7741, "as_of_date": "2026-10-10",
    }
    assert client.get("/api/worlds").json() == {"items": [shown]}
    # The build is in the new bank's audit log, with what the builder chose and nothing hidden (task A11).
    logged = lambda: client.get("/api/audit", headers={"X-World-Id": world_id}).json()["entries"]
    assert wait_until(lambda: any(entry["action"] == "DEMO_BANK_BUILT" for entry in logged()))
    entry = logged()[-1]
    assert entry["actor"] == "jury"
    assert entry["payload"] == {"world_id": world_id, "seed": 7741, "size": 5000, "surprise": False,
                                "mistakes": ["DOUBLE_DEBIT", "ILLEGAL_FEE"], "traps": 8}


def test_a_second_build_at_the_same_time_answers_429(client, monkeypatch):
    release = threading.Event()
    monkeypatch.setattr(world, "build_world", lambda *args, **kwargs: release.wait(30))

    first = client.post("/api/worlds", json=REQUEST)
    second = client.post("/api/worlds", json=REQUEST)
    building = client.get(f"/api/worlds/{first.json()['world_id']}").json()
    release.set()

    assert first.status_code == 200
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "BUSY"
    assert building["status"] == "building"
    # The lock is free again once the build ends.
    assert wait_until(lambda: world._one_build.acquire(blocking=False))
    world._one_build.release()


def test_a_failed_build_says_failed_and_frees_the_lock(client, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("disk full")

    monkeypatch.setattr(world, "build_world", broken)

    world_id = client.post("/api/worlds", json=REQUEST).json()["world_id"]

    assert wait_until(lambda: client.get(f"/api/worlds/{world_id}").json()["status"] == "failed")
    assert wait_until(lambda: world._one_build.acquire(blocking=False))
    world._one_build.release()
    world._building.pop(world_id)


def test_an_unknown_demo_bank_answers_404(client):
    response = client.get("/api/worlds/w-404")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


def test_a_world_id_that_is_not_a_plain_name_is_refused(client):
    assert client.get("/api/worlds/..").status_code in (400, 404)
    assert client.get("/api/worlds/W_1!").status_code == 400
    assert client.get("/api/complaints", headers={"X-World-Id": "../../etc"}).status_code == 400


def test_a_size_that_is_not_offered_is_refused(client):
    response = client.post("/api/worlds", json={**REQUEST, "size": 1_000_000})

    assert response.status_code == 400
