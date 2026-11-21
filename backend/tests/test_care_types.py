"""Five care types and their optional details (ADR-0085)."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import create_engine, inspect

from app.schemas import ALL_CARE_DETAIL_FIELDS, CARE_DETAIL_FIELDS, CareEventInput, CareTaskInput, care_note_output_schema
from app.service import CARE_DETAIL_RESPONSE_FIELDS
from tests.test_api import workspace_payload


def garden_event(**fields):
    return {"id": "event-new", "date": "2026-11-19", "note": "", "targetScope": "garden", **fields}


def garden_task(**fields):
    return {"id": "task-new", "dueDate": "2026-11-20", "note": "", "targetScope": "garden", **fields}


def test_records_and_tasks_of_every_new_type_round_trip_with_their_details(client):
    payload = workspace_payload()
    garden = payload["gardens"][0]
    garden["careEvents"] += [
        garden_event(id="planted", type="planting", plantName="Basil", plantCount=2),
        garden_event(id="pruned", type="pruning", pruneDetail="Side shoots"),
        garden_event(id="treated", type="pest-treatment", pestProblem="Aphids", pestTreatment="Soap spray"),
        garden_event(id="pruned-plain", type="pruning"),
    ]
    garden["careTasks"] += [
        garden_task(id="plant-basil", type="planting", plantName="Basil"),
        garden_task(id="feed", type="fertilizing", fertilizerProduct="Fish emulsion", fertilizerAmount=50, fertilizerUnit="ml"),
    ]
    payload["careEvents"] = [{"id": "all-pruned", "type": "pruning", "date": "2026-11-19", "note": "", "targetScope": "all-gardens", "pruneDetail": "Dead wood"}]
    payload["careTasks"] = [{"id": "all-pests", "type": "pest-treatment", "dueDate": "2026-11-21", "note": "", "targetScope": "all-gardens", "pestProblem": "Slugs"}]

    imported = client.put("/workspaces/local-workspace-1/import", json=payload)

    assert imported.status_code == 201
    assert imported.json() == {**payload, "revision": 0}
    assert client.get("/workspaces/local-workspace-1").json() == {**payload, "revision": 0}


@pytest.mark.parametrize(
    ("care_type", "details"),
    [
        ("watering", {"plantName": "Basil"}),
        ("pruning", {"fertilizerAmount": 2}),
        ("planting", {"pruneDetail": "Side shoots"}),
        ("pest-treatment", {"plantCount": 3}),
        ("fertilizing", {"pestProblem": "Aphids"}),
    ],
)
def test_a_detail_from_another_care_type_is_rejected(client, care_type, details):
    payload = workspace_payload()
    payload["gardens"][0]["careEvents"].append(garden_event(type=care_type, **details))

    response = client.put("/workspaces/local-workspace-1/import", json=payload)

    assert response.status_code == 422
    assert f"{care_type} care cannot include" in response.text


@pytest.mark.parametrize("model", [CareEventInput, CareTaskInput])
@pytest.mark.parametrize("count", [0, 1000, 1.5])
def test_plant_count_is_a_whole_number_from_1_to_999(model, count):
    base = garden_event(type="planting") if model is CareEventInput else garden_task(type="planting")
    with pytest.raises(ValidationError):
        model.model_validate({**base, "plantCount": count})


def test_blank_detail_text_is_rejected():
    with pytest.raises(ValidationError):
        CareEventInput.model_validate(garden_event(type="pruning", pruneDetail="   "))


def test_unknown_care_type_is_rejected():
    with pytest.raises(ValidationError):
        CareEventInput.model_validate(garden_event(type="harvesting"))


def test_detail_field_lists_agree_between_schema_and_response():
    assert set(ALL_CARE_DETAIL_FIELDS) == set(CARE_DETAIL_RESPONSE_FIELDS)
    assert set(CARE_DETAIL_FIELDS) == {"watering", "fertilizing", "planting", "pruning", "pest-treatment"}


def test_the_ai_note_contract_still_reads_two_care_types():
    # The extraction contract changes in plan step N3, with a new evaluation; N1 must not change it.
    type_schema = care_note_output_schema()["properties"]["type"]
    assert type_schema["anyOf"][0]["enum"] == ["watering", "fertilizing"]


def test_migration_adds_and_removes_the_detail_columns(tmp_path):
    database_path = tmp_path / "garden.db"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{database_path}")
    url = f"sqlite+pysqlite:///{database_path}"
    new = {"plant_name", "plant_count", "prune_detail", "pest_problem", "pest_treatment"}
    fertilizer = {"fertilizer_product", "fertilizer_amount", "fertilizer_unit"}

    def columns(table):
        return {column["name"] for column in inspect(create_engine(url)).get_columns(table)}

    command.upgrade(config, "head")
    for table in ("care_events", "workspace_care_events"):
        assert new | fertilizer <= columns(table)
    for table in ("care_tasks", "workspace_care_tasks"):
        assert new | fertilizer <= columns(table)

    command.downgrade(config, "20261004_09")
    for table in ("care_events", "workspace_care_events"):
        assert not new & columns(table)
        assert fertilizer <= columns(table)
    for table in ("care_tasks", "workspace_care_tasks"):
        assert not (new | fertilizer) & columns(table)
