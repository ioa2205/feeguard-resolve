"""The frozen list of paths. A new path needs an entry here and in docs/DECISIONS.md."""

from pathlib import Path

# PLAN Part 10.
PART_10 = {
    ("post", "/api/worlds"),
    ("get", "/api/worlds/{world_id}"),
    ("post", "/api/worlds/{world_id}/tamper"),
    ("get", "/api/customers"),
    ("get", "/api/customers/{customer_id}/statement"),
    ("post", "/api/complaints"),
    ("get", "/api/complaints"),
    ("post", "/api/cases/{complaint_id}/investigate"),
    ("post", "/api/cases/{case_id}/decision"),
    ("post", "/api/findings/{finding_id}/scan"),
    ("get", "/api/reports/action-plan"),
    ("put", "/api/reports/action-plan/{plan_id}"),
    ("get", "/api/reports/quarterly"),
    ("get", "/api/exports/refunds.csv"),
    ("get", "/api/eval/{world_id}"),
    ("get", "/api/eval/{world_id}/reveal"),
    ("get", "/api/audit"),
    ("get", "/api/health"),
}

# Added by DECISIONS D-016.
ADDED = {
    ("get", "/api/worlds"),
    ("get", "/api/cases/{case_id}"),
    ("post", "/api/cases/{case_id}/improve-draft"),
}


def _published(client):
    paths = client.get("/api/openapi.json").json()["paths"]
    return {(method, path) for path, methods in paths.items() for method in methods}


def test_the_published_paths_are_exactly_the_frozen_list(client):
    assert _published(client) == PART_10 | ADDED


def test_every_path_is_built_and_none_answers_501_any_more():
    source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text(encoding="utf-8")

    assert "NOT_BUILT" not in source and "501" not in source


def test_an_unknown_path_answers_404_in_the_error_shape(client):
    response = client.get("/api/nothing-here")

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found"}}


def test_a_complaint_of_10000_characters_answers_400(client):
    response = client.post("/api/complaints", json={"customer_id": "CU-1", "text": "a" * 10_000})

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert "aaaa" not in error["message"]


def test_an_unknown_actor_answers_400(client):
    response = client.post(
        "/api/complaints",
        json={"customer_id": "CU-1", "text": "Kartamdan ikki marta pul yechildi"},
        headers={"X-Actor": "admin"},
    )

    assert response.status_code == 400


def test_a_valid_request_gets_past_the_checks(client):
    response = client.post(
        "/api/complaints",
        json={"customer_id": "CU-1", "text": "Kartamdan ikki marta pul yechildi"},
        headers={"X-Actor": "jury", "X-World-Id": "default"},
    )

    # Past the shape checks: the answer is about the demo bank, which this test did not build.
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NO_DEMO_BANK"
