"""Real-case presets (task P1): one click loads the preset, one complaint finds the whole group.

Fake data only. The answer key is read here to check FeeGuard, never by FeeGuard itself.
"""

import os
import sqlite3
import time
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app.engine import scan
from app.generator import presets, world
from app.schemas import CaseResult, PresetList, ScanResult

# The cause FeeGuard should name for each public pattern (the hidden settings of the generator).
CAUSE = {"issuance-fee": ("tariff", "version 2"), "late-posting": ("channel", "PAYNET")}
# Names of the banks in the news. The app names the pattern, never the bank (PLAN Part 11).
BANKS_IN_THE_NEWS = ("hamkor", "tbc", "davr")


def rows(path, sql, args=()):
    with closing(sqlite3.connect(path)) as opened:
        return opened.execute(sql, args).fetchall()


def wait_until(condition, seconds=90):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.05)
    return False


@pytest.fixture(scope="module")
def banks(tmp_path_factory):
    """Both preset banks, each built by one click through the API, one after the other."""
    parent = tmp_path_factory.mktemp("worlds")
    with pytest.MonkeyPatch.context() as patch:
        patch.setenv("WORLDS_DIR", str(parent))
        patch.setenv("SCAN_WARM_UP", "0")
        patch.setenv("RATE_LIMIT", "off")
        from app.main import app

        client = TestClient(app)
        clicks = {}
        for preset in presets.PRESETS:
            started = time.perf_counter()
            clicks[preset.preset_id] = client.post(f"/api/presets/{preset.preset_id}", headers={"X-Actor": "jury"})
            ready = wait_until(lambda: client.get(f"/api/worlds/{preset.world_id}").json()["status"] == "ready")
            assert ready, f"{preset.world_id} was not built"
            print(f"{preset.world_id}: one click to ready in {time.perf_counter() - started:.1f} s")
            # The audit entry is written just after the bank is ready.
            assert wait_until(lambda: client.get("/api/audit", headers={"X-World-Id": preset.world_id}).json()["entries"])
    return parent, clicks


@pytest.fixture()
def client(banks, monkeypatch):
    monkeypatch.setenv("WORLDS_DIR", str(banks[0]))
    monkeypatch.setenv("SCAN_WARM_UP", "0")
    for preset in presets.PRESETS:
        scan.forget(preset.world_id)
    from app.main import app

    return TestClient(app)


def test_the_presets_name_the_pattern_and_its_sources_never_the_bank(client):
    listed = PresetList.model_validate(client.get("/api/presets").json())

    assert [p.preset_id for p in listed.items] == ["issuance-fee", "late-posting"]
    assert [p.mistake for p in listed.items] == ["ILLEGAL_FEE", "LATE_POSTING"]
    assert [p.title for p in listed.items] == [
        "Issuance fee not allowed (public case, Oct 2025)", "Recorded late, then fined (public case, Oct 2025)",
    ]
    for preset in listed.items:
        assert preset.world_id == f"preset-{preset.preset_id}"
        assert preset.sources and all(source.url.startswith("https://") for source in preset.sources)
        shown = preset.model_dump_json().lower()
        assert not any(bank in shown for bank in BANKS_IN_THE_NEWS)


@pytest.mark.parametrize("preset", presets.PRESETS, ids=lambda preset: preset.preset_id)
def test_one_click_builds_the_preset_bank_with_only_its_mistake(client, banks, preset):
    parent, clicks = banks
    truth = parent / preset.world_id / "truth.db"

    assert clicks[preset.preset_id].status_code == 200
    assert clicks[preset.preset_id].json() == {"world_id": preset.world_id}
    shown = client.get(f"/api/worlds/{preset.world_id}").json()
    assert (shown["seed"], shown["size"]) == (presets.SEED, presets.SIZE)
    planted = rows(truth, "SELECT defect_type, count(*) FROM ground_truth WHERE is_trap = 0 GROUP BY 1")
    assert [kind for kind, _ in planted] == [preset.mistake] and planted[0][1] >= 50
    # The build is in the bank's own audit log, with the preset and nothing hidden.
    entry = client.get("/api/audit", headers={"X-World-Id": preset.world_id}).json()["entries"][-1]
    assert entry["action"] == "DEMO_BANK_BUILT" and entry["actor"] == "jury"
    assert entry["payload"] == {"world_id": preset.world_id, "preset": preset.preset_id, "seed": presets.SEED,
                                "size": presets.SIZE, "surprise": False, "mistakes": [preset.mistake], "traps": 20}


def test_a_second_click_opens_the_same_bank_without_building_it_again(client, monkeypatch):
    def no_build(*args, **kwargs):
        raise AssertionError("the preset bank was built a second time")

    monkeypatch.setattr(world, "start_build", no_build)

    response = client.post("/api/presets/issuance-fee")

    assert response.status_code == 200
    assert response.json() == {"world_id": "preset-issuance-fee"}


@pytest.mark.parametrize("preset", presets.PRESETS, ids=lambda preset: preset.preset_id)
def test_one_complaint_finds_the_whole_group(client, banks, preset):
    truth = banks[0] / preset.world_id / "truth.db"
    in_bank = {"X-World-Id": preset.world_id}
    complaint_id = rows(
        truth, "SELECT complaint_id FROM complaint_key WHERE kind = 'VICTIM' AND claim_type = ? ORDER BY 1",
        (preset.mistake,),
    )[0][0]
    group = rows(truth, "SELECT contract_id, installment_n, excess_amount FROM ground_truth "
                        "WHERE defect_type = ? AND is_trap = 0", (preset.mistake,))

    case = CaseResult.model_validate(client.post(f"/api/cases/{complaint_id}/investigate", headers=in_bank).json())
    finding = next(f for f in case.findings if f.type == preset.mistake)
    found = ScanResult.model_validate(client.post(f"/api/findings/{finding.finding_id}/scan", headers=in_bank).json())

    assert case.verdict == "SUPPORTED"
    assert sorted((i.contract_id, i.installment_n, i.amount_excess) for i in found.items) == sorted(group)
    assert found.affected_contracts == len({contract_id for contract_id, _, _ in group})
    assert found.complained + found.silent == found.affected_customers
    assert found.silent > found.complained > 0
    top = found.cause.attributes[0]
    assert (top.name, top.value) == CAUSE[preset.preset_id]
    print(f"{preset.world_id}: complaint {complaint_id} -> {found.affected_customers} customers, "
          f"{found.silent} never complained, {found.total_excess} to return, cause {top.name} {top.value}")


def test_nobody_adds_a_debit_by_hand_to_a_preset_bank(client):
    response = client.post("/api/worlds/preset-late-posting/tamper",
                           json={"contract_id": "L-00001", "action": "extra_debit", "amount": 100000, "card_id": "K-1"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PRESET_BANK"


def test_an_unknown_preset_answers_404(client):
    assert client.post("/api/presets/no-such-case").status_code == 404


def test_old_demo_banks_make_room_but_never_the_default_or_a_preset_one(tmp_path):
    for age, name in enumerate(["default", "preset-issuance-fee", "w-1", "preset-late-posting", "w-2", "w-3"]):
        (tmp_path / name).mkdir()
        (tmp_path / name / world.BANK_DB).write_text("")
        (tmp_path / name / world.BUILD_RECORD).write_text("{}")
        stamp = 1_000_000 + age
        os.utime(tmp_path / name / world.BUILD_RECORD, (stamp, stamp))

    removed = world.prune(tmp_path, keep=3)

    assert removed == ["w-1", "w-2", "w-3"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["default", "preset-issuance-fee", "preset-late-posting"]
