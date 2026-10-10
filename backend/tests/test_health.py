def test_health_reports_storage_and_the_reader(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"db": "ok", "llm_mode": "rules", "model_name": None}


def test_health_says_error_when_the_worlds_folder_cannot_be_made(client, tmp_path, monkeypatch):
    a_file = tmp_path / "not_a_folder"
    a_file.write_text("x", encoding="utf-8")
    monkeypatch.setenv("WORLDS_DIR", str(a_file / "worlds"))

    assert client.get("/api/health").json()["db"] == "error"
