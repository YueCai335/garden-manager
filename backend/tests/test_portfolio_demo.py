from datetime import date


def test_portfolio_demo_keeps_photo_upload_local_and_garden_note_closed_by_default(client, monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")
    monkeypatch.delenv("CARE_NOTE_PUBLIC_ENABLED", raising=False)

    care_note = client.post(
        "/workspaces/local-workspace-1/gardens/garden-1/ai/care-note-draft",
        json={"note": "Watered the tomatoes.", "today": date.today().isoformat()},
    )
    photo = client.post(
        "/workspaces/local-workspace-1/gardens/garden-1/plant-health/photos",
        files={"photo": ("leaf.jpg", b"image", "image/jpeg")},
    )

    assert care_note.status_code == 503
    # Public Garden Note stays off until CARE_NOTE_PUBLIC_ENABLED is set (ADR-0059).
    assert care_note.json()["detail"] == "AI Garden Note is not available in the demo right now. You can still fill in the record manually."
    assert photo.status_code == 503
    assert photo.json()["detail"] == "Photo upload is available in the local app for this portfolio demo."


def test_runtime_config_reports_portfolio_demo_mode(client, monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")

    response = client.get("/runtime-config")

    assert response.status_code == 200
    assert response.json() == {"portfolioDemo": True, "careNotePublicAvailable": False, "careNoteBatchAvailable": False}
