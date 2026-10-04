from datetime import date


def test_portfolio_demo_keeps_ai_and_photo_features_local(client, monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")

    care_note = client.post(
        "/workspaces/local-workspace-1/gardens/garden-1/ai/care-note-draft",
        json={"note": "Watered the tomatoes.", "today": date.today().isoformat()},
    )
    photo = client.post(
        "/workspaces/local-workspace-1/gardens/garden-1/plant-health/photos",
        files={"photo": ("leaf.jpg", b"image", "image/jpeg")},
    )

    assert care_note.status_code == 503
    assert care_note.json()["detail"] == "AI assistance is available in the local app for this portfolio demo."
    assert photo.status_code == 503
    assert photo.json()["detail"] == "Photo upload is available in the local app for this portfolio demo."


def test_runtime_config_reports_portfolio_demo_mode(client, monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")

    response = client.get("/runtime-config")

    assert response.status_code == 200
    assert response.json() == {"portfolioDemo": True}
