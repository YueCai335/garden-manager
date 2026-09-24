"""Season-allocation agent (ADR-0056), driven by a scripted fake model.

No test here calls OpenAI: ScriptedModel replays a fixed list of turns and
records every request it receives.
"""

import json
from copy import deepcopy
from datetime import date

import pytest

from app import database
from app.agent.allocation import (
    CROPS,
    AllocationRequest,
    AreaSnapshot,
    Assignment,
    GardenSnapshot,
    PlantingSnapshot,
    allocation_errors,
    build_scope,
    check_assignments,
    garden_snapshot,
    rotation_summary,
)
from app.agent.loop import (
    FINAL_OUTPUT_FORMAT,
    MAX_MODEL_REQUESTS,
    MAX_OUTPUT_TOKENS,
    MAX_REQUEST_BYTES,
    FinalAllocation,
    ModelProviderError,
    ModelTurn,
    ToolCall,
    run_allocation_agent,
)
from app.agent.openai_model import DEFAULT_MODEL
from app.agent.tools import TOOLS, tool_definitions
from app.rotation import KNOWN_CROP_FAMILIES, RotationPlanting, evaluate_rotation
from app.service import load_workspace
from tests.test_api import workspace_payload

TODAY = date(2026, 9, 23)  # plans the 2027 season; history window is 2024-2026

BED = AreaSnapshot("bed", "North raised bed", "raised-bed")
GROUND = AreaSnapshot("ground", "Back in-ground area", "in-ground")
POTS = AreaSnapshot("pots", "Patio containers", "container")
GREENHOUSE = AreaSnapshot("greenhouse", "Greenhouse shelf", "greenhouse")


def planting(id, family, year, area):
    return PlantingSnapshot(id, id.title(), family, date(year, 5, 1), area.id)


def garden(*areas, plantings=None):
    if plantings is None:
        plantings = (
            planting("tomatoes", "nightshade", 2026, BED),
            planting("cabbage", "brassica", 2024, BED),
            planting("beans", "legume", 2026, GROUND),
            planting("old-peppers", "nightshade", 2023, GROUND),  # outside the window
        )
    return GardenSnapshot("garden-1", areas or (BED, GROUND, POTS, GREENHOUSE), tuple(plantings))


def call(name, arguments="{}", call_id=None):
    args = arguments if isinstance(arguments, str) else json.dumps(arguments)
    return ModelTurn(tool_call=ToolCall(call_id or f"call-{name}", name, args))


def final(assignments, explanation="Placed by rotation.", **extra):
    return ModelTurn(text=json.dumps({"assignments": assignments, "explanation": explanation, **extra}))


def assign(*pairs):
    return {"assignments": [{"growing_area_id": area, "crop": crop} for area, crop in pairs]}


class ScriptedModel:
    name = "scripted-model"

    def __init__(self, *turns):
        self.turns = list(turns)
        self.requests = []

    def respond(self, request):
        self.requests.append(request)
        turn = self.turns.pop(0)
        if isinstance(turn, Exception):
            raise turn
        return turn


def run(model, snapshot=None, **request):
    request.setdefault("crops", ["tomato", "bean"])
    return run_allocation_agent(snapshot or garden(BED, GROUND), AllocationRequest(**request), model, today=TODAY)


def fed_back_output(request):
    """The last tool result the loop put into this request."""
    item = request.input[-1]
    assert item["type"] == "function_call_output"
    return item["call_id"], json.loads(item["output"])


# --- Input checks: needs_input without any model request ---


@pytest.mark.parametrize(
    ("snapshot", "request_fields", "message"),
    [
        (garden(BED), {"crops": []}, "Select at least one crop"),
        (garden(BED), {"crops": ["potato"]}, "Unsupported crops: potato"),
        (garden(BED), {"crops": ["tomato", "tomato"]}, "each crop only once"),
        (garden(BED), {"crops": ["tomato"], "preference": "x" * 201}, "200 characters"),
        (garden(GREENHOUSE), {"crops": ["tomato"]}, "no raised bed"),
        (
            garden(BED, GROUND, POTS, AreaSnapshot("bed-2", "South bed", "raised-bed")),
            {"crops": ["tomato"]},
            "Choose up to 3",
        ),
        (
            garden(BED, GROUND, POTS, AreaSnapshot("bed-2", "South bed", "raised-bed")),
            {"crops": ["tomato"], "growing_area_ids": ["bed", "ground", "pots", "bed-2"]},
            "Choose up to 3",
        ),
        (garden(BED), {"crops": ["tomato"], "growing_area_ids": []}, "at least one growing area"),
        # An area of another garden is simply absent from this garden's snapshot.
        (garden(BED), {"crops": ["tomato"], "growing_area_ids": ["other-garden-bed"]}, "not in this garden"),
        (garden(BED, GREENHOUSE), {"crops": ["tomato"], "growing_area_ids": ["greenhouse"]}, "greenhouse"),
        (garden(BED, GROUND), {"crops": ["tomato"], "growing_area_ids": ["bed", "bed"]}, "each growing area only once"),
    ],
)
def test_incomplete_input_needs_input_without_a_model_request(snapshot, request_fields, message):
    model = ScriptedModel()

    result = run_allocation_agent(snapshot, AllocationRequest(**request_fields), model, today=TODAY)

    assert result.status == "needs_input"
    assert any(message in item for item in result.missing_inputs), result.missing_inputs
    assert result.trace == []
    assert model.requests == []


def test_scope_records_the_complete_input():
    scope, missing = build_scope(
        garden(),
        AllocationRequest(crops=["lettuce", "tomato"], preference="生菜放容器", growing_area_ids=["pots", "bed"]),
        TODAY,
    )

    assert missing == []
    assert scope.model_dump() == {
        "season_year": 2027,
        "areas": [
            {"id": "pots", "name": "Patio containers", "kind": "container"},
            {"id": "bed", "name": "North raised bed", "kind": "raised-bed"},
        ],
        "crops": ["lettuce", "tomato"],
        "preference": "生菜放容器",
    }


def test_eligible_areas_are_selected_when_there_are_at_most_three():
    scope, _ = build_scope(garden(), AllocationRequest(crops=["tomato"]), TODAY)

    assert [area.id for area in scope.areas] == ["bed", "ground", "pots"]


# --- Deterministic rules ---


def test_rotation_summary_covers_only_selected_areas_and_three_previous_years():
    snapshot = garden()
    scope, _ = build_scope(snapshot, AllocationRequest(crops=["tomato"], growing_area_ids=["bed", "ground"]), TODAY)

    rows = [row.model_dump() for row in rotation_summary(snapshot, scope)]

    assert rows == [
        {"growing_area_id": "bed", "year": 2026, "rotation_group": "nightshade"},
        {"growing_area_id": "bed", "year": 2024, "rotation_group": "brassica"},
        {"growing_area_id": "ground", "year": 2026, "rotation_group": "legume"},
    ]


def test_allocation_rules_reject_out_of_scope_duplicate_and_missing_crops():
    scope, _ = build_scope(
        garden(), AllocationRequest(crops=["tomato", "bean"], growing_area_ids=["bed", "ground"]), TODAY
    )

    def errors(*pairs, complete=True):
        return allocation_errors(
            scope, [Assignment(growing_area_id=a, crop=c) for a, c in pairs], complete=complete
        )

    assert errors(("bed", "tomato"), ("bed", "bean")) == []  # one area may hold several crops
    assert "not one of the selected areas" in errors(("pots", "tomato"), ("bed", "bean"))[0]
    assert "was not selected" in errors(("bed", "tomato"), ("bed", "bean"), ("bed", "lettuce"))[0]
    assert "more than once" in errors(("bed", "tomato"), ("ground", "tomato"), ("bed", "bean"))[0]
    assert "not assigned" in errors(("bed", "tomato"))[0]
    assert errors(("bed", "tomato"), complete=False) == []  # a partial candidate may be checked


def test_assignment_checks_match_the_existing_rotation_rule():
    snapshot = garden()
    scope, _ = build_scope(snapshot, AllocationRequest(crops=["tomato", "bean"]), TODAY)
    assignments = [Assignment(growing_area_id="bed", crop="tomato"), Assignment(growing_area_id="ground", crop="bean")]

    checks = check_assignments(snapshot, scope, assignments)

    for check, (area, family) in zip(checks, [(BED, "nightshade"), (GROUND, "legume")]):
        expected = evaluate_rotation(
            growing_area_kind=area.kind,
            crop_family=family,
            planting_date=date(2027, 1, 1),
            plantings=[
                RotationPlanting(p.id, p.common_name, p.crop_family, p.planting_date)
                for p in snapshot.plantings
                if p.growing_area_id == area.id
            ],
        )
        assert check.warning is expected["warning"] is True
        assert check.repeated_years == [2026]
        assert check.rotation_friendly_groups == expected["rotation_friendly_crop_families"]


def test_tool_schemas_are_generated_from_the_argument_models():
    definitions = {definition["name"]: definition for definition in tool_definitions()}

    assert set(definitions) == {"get_planting_history", "check_allocation"}
    for name, tool in TOOLS.items():
        assert definitions[name]["type"] == "function"
        assert definitions[name]["strict"] is False
        assert definitions[name]["parameters"] == tool.args_model.model_json_schema()


# --- Loop ---


def test_agent_reads_history_revises_after_a_warning_and_returns_a_draft():
    model = ScriptedModel(
        call("get_planting_history", call_id="c1"),
        call("check_allocation", assign(("bed", "tomato"), ("ground", "bean")), call_id="c2"),
        call("check_allocation", assign(("ground", "tomato"), ("bed", "bean")), call_id="c3"),
        final(
            [{"growing_area_id": "ground", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}],
            "Swapped so neither crop repeats its group.",
        ),
    )

    result = run(model)

    assert result.status == "draft"
    assert [a.model_dump() for a in result.allocation] == [
        {"growing_area_id": "ground", "crop": "tomato"},
        {"growing_area_id": "bed", "crop": "bean"},
    ]
    assert result.explanation == "Swapped so neither crop repeats its group."
    assert result.warnings == []
    assert result.season_year == 2027
    assert result.scope.crops == ["tomato", "bean"]
    assert [row.growing_area_id for row in result.rotation_summary] == ["bed", "bed", "ground"]
    assert [(step.step, step.tool, step.short_result) for step in result.trace] == [
        (1, "get_planting_history", "3 history rows for 2 areas"),
        (2, "check_allocation", "2 checked, 2 rotation warnings"),
        (3, "check_allocation", "2 checked, 0 rotation warnings"),
    ]
    assert result.trace[1].args == assign(("bed", "tomato"), ("ground", "bean"))
    assert len(model.requests) == 4


def test_each_tool_result_is_fed_into_the_next_request():
    model = ScriptedModel(
        call("get_planting_history", call_id="c1"),
        call("check_allocation", assign(("bed", "tomato"), ("ground", "bean")), call_id="c2"),
        final([{"growing_area_id": "bed", "crop": "tomato"}, {"growing_area_id": "ground", "crop": "bean"}]),
    )

    run(model)

    first = model.requests[0].input
    assert len(first) == 1 and first[0]["role"] == "user"
    call_id, history = fed_back_output(model.requests[1])
    assert call_id == "c1"
    assert history["history"] == {"bed": {"2026": ["nightshade"], "2024": ["brassica"]}, "ground": {"2026": ["legume"]}}
    assert model.requests[1].input[-2] == {
        "type": "function_call",
        "call_id": "c1",
        "name": "get_planting_history",
        "arguments": "{}",
    }
    call_id, checks = fed_back_output(model.requests[2])
    assert call_id == "c2"
    assert [check["warning"] for check in checks["checks"]] == [True, True]
    assert checks["checks"][0]["repeated_years"] == [2026]


def test_a_draft_keeps_server_computed_warnings_and_ignores_model_written_ones():
    model = ScriptedModel(
        call("get_planting_history"),
        final(
            [{"growing_area_id": "bed", "crop": "tomato"}, {"growing_area_id": "ground", "crop": "bean"}],
            warnings=[],  # the model claims there are none
        ),
    )

    result = run(model)

    assert result.status == "draft"
    assert [(w.growing_area_id, w.crop, w.repeated_years) for w in result.warnings] == [
        ("bed", "tomato", [2026]),
        ("ground", "bean", [2026]),
    ]


def test_loop_stops_after_five_model_requests():
    model = ScriptedModel(*[call("get_planting_history", call_id=f"c{n}") for n in range(1, 7)])

    result = run(model)

    assert result.status == "generation_failed"
    assert result.failure_reason == "step_limit"
    assert len(model.requests) == MAX_MODEL_REQUESTS
    assert [step.step for step in result.trace] == [1, 2, 3, 4, 5]
    assert result.allocation == []


def test_unknown_tool_is_reported_back_and_not_executed():
    model = ScriptedModel(
        call("delete_garden", call_id="c1"),
        call("get_planting_history", call_id="c2"),
        final([{"growing_area_id": "ground", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}]),
    )

    result = run(model)

    call_id, output = fed_back_output(model.requests[1])
    assert call_id == "c1"
    assert output == {"error": "Unknown tool delete_garden. Available tools: get_planting_history, check_allocation."}
    assert result.trace[0].short_result.startswith("error: Unknown tool delete_garden")
    assert result.status == "draft"


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        (assign(("bed", "potato")), "assignments.0.crop"),
        ({"assignments": [{"growing_area_id": "bed"}]}, "assignments.0.crop: Field required"),
        ({"assignments": []}, "assignments: List should have at least 1 item"),
        ({"assignments": [], "delete": True}, "delete: Extra inputs are not permitted"),
        ("{not json", "Invalid arguments for check_allocation"),
        (assign(("pots", "tomato")), "not one of the selected areas"),
        (assign(("bed", "lettuce")), "was not selected"),
    ],
)
def test_invalid_tool_arguments_are_rejected_and_the_model_can_correct_them(arguments, message):
    good = assign(("ground", "tomato"), ("bed", "bean"))
    model = ScriptedModel(
        call("check_allocation", arguments, call_id="bad"),
        call("check_allocation", good, call_id="fixed"),
        final(good["assignments"]),
    )

    result = run(model)

    call_id, output = fed_back_output(model.requests[1])
    assert call_id == "bad"
    assert message in output["error"]
    assert result.trace[0].short_result.startswith("error:")
    assert result.trace[1].short_result == "2 checked, 0 rotation warnings"
    assert result.status == "draft"


def test_truncated_output_fails_generation():
    model = ScriptedModel(call("get_planting_history"), ModelTurn(text='{"assignments": [', truncated=True))

    result = run(model)

    assert (result.status, result.failure_reason) == ("generation_failed", "output_limit")
    assert result.allocation == []


@pytest.mark.parametrize(
    "turn",
    [
        ModelTurn(text="Put tomatoes in the ground."),
        ModelTurn(text=None),
        final([{"growing_area_id": "ground", "crop": "tomato"}]),  # bean missing
        final([{"growing_area_id": "pots", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}]),
        final([{"growing_area_id": "bed", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}], "x" * 1501),
    ],
)
def test_invalid_final_output_fails_generation(turn):
    result = run(ScriptedModel(turn))

    assert (result.status, result.failure_reason) == ("generation_failed", "invalid_final")
    assert result.allocation == []


def test_provider_failure_returns_provider_unavailable():
    model = ScriptedModel(call("get_planting_history"), ModelProviderError("rate limited"))

    result = run(model)

    assert result.status == "provider_unavailable"
    assert [step.tool for step in result.trace] == ["get_planting_history"]


# --- Request size and output limit ---


def test_every_request_carries_the_full_payload_and_output_limit():
    model = ScriptedModel(
        call("get_planting_history"),
        final([{"growing_area_id": "ground", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}]),
    )

    run(model)

    for request in model.requests:
        params = request.to_params()
        assert params["model"] == "scripted-model"
        assert params["max_output_tokens"] == MAX_OUTPUT_TOKENS == 800
        assert params["tools"] == tool_definitions()
        assert params["text"] == FINAL_OUTPUT_FORMAT
        assert params["text"]["format"]["schema"] == FinalAllocation.model_json_schema()
        assert params["text"]["format"]["strict"] is False
        assert (params["parallel_tool_calls"], params["store"]) == (False, False)
        assert request.byte_size() == len(json.dumps(params, ensure_ascii=False, separators=(",", ":")).encode())


def test_a_first_request_over_the_byte_limit_is_never_sent():
    model = ScriptedModel()

    result = run_allocation_agent(
        garden(BED, GROUND), AllocationRequest(crops=["tomato"]), model, today=TODAY, max_request_bytes=100
    )

    assert (result.status, result.failure_reason) == ("generation_failed", "input_limit")
    assert model.requests == []


def test_a_tool_result_that_pushes_the_next_request_over_the_limit_stops_the_run():
    script = [call("get_planting_history"), call("get_planting_history"), ModelTurn(text="")]
    probe = ScriptedModel(*script)
    run(probe)
    second_request_size = probe.requests[1].byte_size()

    model = ScriptedModel(*script)
    result = run_allocation_agent(
        garden(BED, GROUND),
        AllocationRequest(crops=["tomato", "bean"]),
        model,
        today=TODAY,
        max_request_bytes=second_request_size - 1,
    )

    assert (result.status, result.failure_reason) == ("generation_failed", "input_limit")
    assert len(model.requests) == 1
    assert len(result.trace) == 1


def test_request_size_counts_utf8_bytes():
    ascii_model, chinese_model = ScriptedModel(ModelTurn(text="")), ScriptedModel(ModelTurn(text=""))

    run(ascii_model, preference="a" * 200)
    run(chinese_model, preference="生" * 200)

    # "生" is three bytes in UTF-8.
    assert chinese_model.requests[0].byte_size() - ascii_model.requests[0].byte_size() == 400


def test_the_heaviest_five_request_run_fits_the_default_byte_limit():
    # Every area grew every group in each of the three history years, so every
    # check returns full warning details; names and preference are at their longest.
    areas = tuple(
        AreaSnapshot(area_id, "名" * 200, kind)
        for area_id, kind in (("bed", "raised-bed"), ("ground", "in-ground"), ("pots", "container"))
    )
    plantings = tuple(
        planting(f"{area.id}-{year}-{family}", family, year, area)
        for area in areas
        for year in (2024, 2025, 2026)
        for family in (*KNOWN_CROP_FAMILIES, "other")
    )
    everything = assign(("bed", "tomato"), ("ground", "bean"), ("pots", "lettuce"), ("pots", "cucumber"), ("ground", "carrot"))
    model = ScriptedModel(
        call("get_planting_history", call_id="call_" + "x" * 24),
        *[call("check_allocation", everything, call_id=f"call_{n}" + "x" * 24) for n in range(3)],
        final(everything["assignments"], "说明" * 300),
    )
    model.name = DEFAULT_MODEL  # the real model name is part of every request

    result = run_allocation_agent(
        GardenSnapshot("garden-1", areas, plantings),
        AllocationRequest(crops=list(CROPS), preference="生" * 200),
        model,
        today=TODAY,
    )

    assert result.status == "draft"
    assert len(result.warnings) == 5
    assert max(request.byte_size() for request in model.requests) <= MAX_REQUEST_BYTES


# --- Unusable output, run reservation, and request logs ---


@pytest.mark.parametrize("reason", ["refusal", "empty_output", "incomplete_output", "multiple_tool_calls"])
def test_unusable_model_output_fails_generation_without_running_a_tool(reason):
    model = ScriptedModel(ModelTurn(tool_call=ToolCall("c1", "get_planting_history", "{}"), unusable=reason))

    result = run(model)

    assert (result.status, result.failure_reason) == ("generation_failed", reason)
    assert result.trace == []
    assert result.allocation == []


class Reservations:
    def __init__(self, allow=True):
        self.allow = allow
        self.calls = 0

    def __call__(self):
        self.calls += 1
        return self.allow


def test_a_run_is_reserved_once_just_before_its_first_request():
    reservations = Reservations()
    model = ScriptedModel(
        call("get_planting_history"),
        call("check_allocation", assign(("ground", "tomato"), ("bed", "bean"))),
        final([{"growing_area_id": "ground", "crop": "tomato"}, {"growing_area_id": "bed", "crop": "bean"}]),
    )

    result = run_allocation_agent(
        garden(BED, GROUND), AllocationRequest(crops=["tomato", "bean"]), model, today=TODAY, reserve_run=reservations
    )

    assert result.status == "draft"
    assert reservations.calls == 1
    assert len(model.requests) == 3


def test_a_refused_reservation_ends_the_run_before_any_request():
    reservations = Reservations(allow=False)
    model = ScriptedModel()

    result = run_allocation_agent(
        garden(BED, GROUND), AllocationRequest(crops=["tomato"]), model, today=TODAY, reserve_run=reservations
    )

    assert result.status == "budget_exhausted"
    assert (reservations.calls, model.requests) == (1, [])


@pytest.mark.parametrize(
    ("request_fields", "max_request_bytes"),
    [({"crops": ["potato"]}, MAX_REQUEST_BYTES), ({"crops": ["tomato"]}, 100)],
)
def test_needs_input_and_an_oversized_first_request_reserve_nothing(request_fields, max_request_bytes):
    reservations = Reservations()

    run_allocation_agent(
        garden(BED, GROUND),
        AllocationRequest(**request_fields),
        ScriptedModel(),
        today=TODAY,
        max_request_bytes=max_request_bytes,
        reserve_run=reservations,
    )

    assert reservations.calls == 0


def test_each_request_is_logged_with_unknown_usage_as_null(caplog):
    model = ScriptedModel(
        ModelTurn(tool_call=ToolCall("c1", "get_planting_history", "{}"), input_tokens=900, output_tokens=20),
        ModelProviderError("timeout"),
    )

    with caplog.at_level("INFO", logger="app.agent.loop"):
        run(model)

    records = [json.loads(record.getMessage()) for record in caplog.records]
    assert [(r["step"], r["outcome"], r["input_tokens"], r["output_tokens"]) for r in records] == [
        (1, "tool_call", 900, 20),
        (2, "provider_error", None, None),
    ]
    assert records[0]["bytes"] == model.requests[0].byte_size()


def test_usage_above_the_formatting_allowance_is_logged_as_a_warning(caplog):
    model = ScriptedModel(ModelTurn(text="", input_tokens=1_000_000))

    with caplog.at_level("INFO", logger="app.agent.loop"):
        run(model)

    assert [json.loads(r.getMessage())["event"] for r in caplog.records if r.levelname == "WARNING"] == [
        "season_allocation_allowance_exceeded"
    ]


# --- Persistence boundary ---


def test_a_run_writes_nothing_to_the_database_or_the_snapshot(client):
    payload = workspace_payload()
    payload["gardens"][0]["growingAreas"].append(
        {
            "id": "bed-2",
            "name": "South bed",
            "kind": "in-ground",
            "planPlacement": {"x": 4, "y": 1, "rotationDegrees": 0},
            "layout": None,
        }
    )
    payload["gardens"][0]["seasonPlans"] = [
        {
            "id": "plan-2027",
            "seasonYear": 2027,
            "plantings": [
                {"id": "planned-1", "commonName": "Garlic", "cropFamily": "allium", "growingAreaId": "bed-2"}
            ],
        }
    ]
    assert client.put("/workspaces/local-workspace-1/import", json=payload).status_code == 201
    before = client.get("/workspaces/local-workspace-1").json()

    with database.SessionLocal() as session:
        workspace = load_workspace(session, "local-workspace-1")
        snapshot = garden_snapshot(workspace.gardens[0])
        untouched = deepcopy(snapshot)
        model = ScriptedModel(
            call("get_planting_history"),
            call("check_allocation", assign(("bed-1", "tomato"), ("bed-2", "bean"))),
            final([{"growing_area_id": "bed-2", "crop": "tomato"}, {"growing_area_id": "bed-1", "crop": "bean"}]),
        )

        result = run_allocation_agent(snapshot, AllocationRequest(crops=["tomato", "bean"]), model, today=TODAY)

        assert result.status == "draft"
        assert not session.new and not session.dirty and not session.deleted
    assert snapshot == untouched
    assert client.get("/workspaces/local-workspace-1").json() == before
