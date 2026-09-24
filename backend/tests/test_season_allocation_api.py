"""Season-allocation endpoint, public run limit, and OpenAI adapter (ADR-0056).

Every test uses a scripted model or a fake OpenAI client; none calls OpenAI.
Tables come from create_all, which does not run the migration's seed row, so
public-mode tests insert the budget row themselves.
"""

import os
import subprocess
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import httpx
import openai
import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from app import database
from app.agent.allocation import AllocationRequest
from app.agent.budget import PUBLIC_BUDGET_NAME, public_run_limit, reserve_public_run
from app.agent.loop import ModelProviderError, ModelRequest, ModelTurn, ToolCall
from app.agent.openai_model import DEFAULT_MODEL, OpenAIAllocationModel, turn_from_response
from app.agent.service import load_demo_garden, public_run_lock, season_allocation
from app.main import app, get_season_allocation_model
from app.models import AgentRunBudget
from tests.test_api import workspace_payload
from tests.test_season_allocation import ScriptedModel, call, final

URL = "/workspaces/local-workspace-1/gardens/{garden}/ai/season-allocation"
DEMO_URL = URL.format(garden="demo-garden")
TODAY = date(2026, 9, 24)  # plans 2027; the 2026 demo and fixture plantings are in the window


class FixedDate(date):
    @classmethod
    def today(cls):
        return TODAY


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr("app.main.date", FixedDate)


@pytest.fixture
def model_slot():
    """Each HTTP request gets the model placed in slot["model"]."""
    slot = {"model": None}
    app.dependency_overrides[get_season_allocation_model] = lambda: slot["model"]
    yield slot
    app.dependency_overrides.pop(get_season_allocation_model, None)


@pytest.fixture
def public_demo(monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")
    monkeypatch.setenv("AGENT_PUBLIC_RUN_LIMIT", "2")
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=PUBLIC_BUDGET_NAME, used_runs=0))
        session.commit()


def used_runs():
    with database.SessionLocal() as session:
        return session.scalar(select(AgentRunBudget.used_runs).where(AgentRunBudget.name == PUBLIC_BUDGET_NAME))


def local_draft_model():
    return ScriptedModel(
        call("get_planting_history"),
        call("check_allocation", {"assignments": [{"growing_area_id": "bed-1", "crop": "tomato"}]}),
        final([{"growing_area_id": "bed-1", "crop": "tomato"}], "Tomatoes follow tomatoes here."),
    )


def demo_draft_model():
    return ScriptedModel(
        call("get_planting_history"),
        final(
            [
                {"growing_area_id": "demo-in-ground-area", "crop": "tomato"},
                {"growing_area_id": "demo-raised-bed", "crop": "bean"},
            ]
        ),
    )


# --- Local mode ---


def test_local_run_returns_a_camel_case_draft(client, model_slot):
    client.put("/workspaces/local-workspace-1/import", json=workspace_payload())
    model_slot["model"] = local_draft_model()

    response = client.post(URL.format(garden="garden-1"), json={"crops": ["tomato"], "preference": "  "})

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "draft"
    assert body["seasonYear"] == 2027
    assert body["scope"] == {
        "seasonYear": 2027,
        "areas": [{"id": "bed-1", "name": "North bed", "kind": "raised-bed"}],
        "crops": ["tomato"],
        "preference": "",
    }
    assert body["allocation"] == [{"growingAreaId": "bed-1", "crop": "tomato"}]
    assert body["explanation"] == "Tomatoes follow tomatoes here."
    assert body["missingInputs"] == [] and body["failureReason"] is None
    assert body["rotationSummary"] == [{"growingAreaId": "bed-1", "year": 2026, "rotationGroup": "nightshade"}]
    assert body["warnings"] == [
        {
            "growingAreaId": "bed-1",
            "crop": "tomato",
            "rotationGroup": "nightshade",
            "warning": True,
            "repeatedYears": [2026],
            "rotationFriendlyGroups": ["brassica", "cucurbit", "legume", "allium", "root", "leafy"],
        }
    ]
    assert [(step["step"], step["tool"], step["shortResult"]) for step in body["trace"]] == [
        (1, "get_planting_history", "1 history rows for 1 areas"),
        (2, "check_allocation", "1 checked, 1 rotation warnings"),
    ]
    # Trace arguments are shown exactly as the model sent them.
    assert body["trace"][1]["args"] == {"assignments": [{"growing_area_id": "bed-1", "crop": "tomato"}]}


@pytest.mark.parametrize(
    ("workspace", "garden", "detail"),
    [("missing", "garden-1", "Workspace not found"), ("local-workspace-1", "missing", "Garden not found in this workspace")],
)
def test_local_run_reports_a_missing_workspace_or_garden(client, model_slot, workspace, garden, detail):
    client.put("/workspaces/local-workspace-1/import", json=workspace_payload())
    model_slot["model"] = ScriptedModel()

    response = client.post(f"/workspaces/{workspace}/gardens/{garden}/ai/season-allocation", json={"crops": ["tomato"]})

    assert (response.status_code, response.json()["detail"]) == (404, detail)
    assert model_slot["model"].requests == []


def test_local_run_without_an_api_key_is_provider_unavailable(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    client.put("/workspaces/local-workspace-1/import", json=workspace_payload())

    body = client.post(URL.format(garden="garden-1"), json={"crops": ["tomato"]}).json()

    assert body["status"] == "provider_unavailable"
    assert body["trace"] == []


def test_the_request_body_rejects_oversized_payloads(client, model_slot):
    response = client.post(DEMO_URL, json={"crops": ["tomato"] * 11})

    assert response.status_code == 422


# --- Public demo mode ---


def test_public_run_uses_the_fixed_demo_garden_not_stored_data(client, model_slot, public_demo):
    # No workspace is stored at all; the run still works from the fixed copy.
    model = demo_draft_model()
    model_slot["model"] = model

    body = client.post(DEMO_URL, json={"crops": ["tomato", "bean"]}).json()

    assert body["status"] == "draft"
    assert [area["id"] for area in body["scope"]["areas"]] == [
        "demo-raised-bed",
        "demo-in-ground-area",
        "demo-container-group",
    ]
    assert "demo-container-group" in model.requests[0].input[0]["content"]
    assert used_runs() == 1


def test_public_mode_accepts_only_the_demo_garden(client, model_slot, public_demo):
    model_slot["model"] = ScriptedModel()

    response = client.post(URL.format(garden="garden-1"), json={"crops": ["tomato"]})

    assert response.status_code == 404
    assert used_runs() == 0


def test_every_public_run_counts_once_against_one_shared_limit(client, model_slot, public_demo):
    for workspace in ("workspace-a", "workspace-b"):
        model_slot["model"] = demo_draft_model()  # two requests, one run
        body = client.post(
            f"/workspaces/{workspace}/gardens/demo-garden/ai/season-allocation", json={"crops": ["tomato", "bean"]}
        ).json()
        assert body["status"] == "draft"
    assert used_runs() == 2

    model_slot["model"] = ScriptedModel()
    body = client.post(
        "/workspaces/workspace-c/gardens/demo-garden/ai/season-allocation", json={"crops": ["tomato", "bean"]}
    ).json()

    assert body["status"] == "budget_exhausted"
    assert model_slot["model"].requests == []
    assert used_runs() == 2


def test_needs_input_and_a_missing_key_use_no_public_runs(client, model_slot, public_demo):
    model_slot["model"] = ScriptedModel()
    assert client.post(DEMO_URL, json={"crops": ["potato"]}).json()["status"] == "needs_input"

    model_slot["model"] = None
    assert client.post(DEMO_URL, json={"crops": ["tomato"]}).json()["status"] == "provider_unavailable"

    assert used_runs() == 0


def test_a_failed_public_run_is_not_refunded(client, model_slot, public_demo):
    model_slot["model"] = ScriptedModel(ModelProviderError("rate limited"))

    body = client.post(DEMO_URL, json={"crops": ["tomato"]}).json()

    assert body["status"] == "provider_unavailable"
    assert used_runs() == 1


def test_a_missing_budget_row_means_no_public_run(client, model_slot, monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")
    monkeypatch.setenv("AGENT_PUBLIC_RUN_LIMIT", "5")
    model_slot["model"] = ScriptedModel()

    body = client.post(DEMO_URL, json={"crops": ["tomato"]}).json()

    assert body["status"] == "budget_exhausted"
    assert model_slot["model"].requests == []


@pytest.mark.parametrize(("raw", "limit"), [(None, 0), ("", 0), ("abc", 0), ("-5", 0), ("1.5", 0), ("150", 150)])
def test_run_limit_configuration_never_becomes_unlimited(monkeypatch, raw, limit):
    if raw is None:
        monkeypatch.delenv("AGENT_PUBLIC_RUN_LIMIT", raising=False)
    else:
        monkeypatch.setenv("AGENT_PUBLIC_RUN_LIMIT", raw)

    assert public_run_limit() == limit


def test_a_database_error_while_reserving_means_no_run():
    class BrokenSession:
        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def execute(self, *args, **kwargs):
            raise OperationalError("UPDATE agent_run_budgets", {}, Exception("connection lost"))

    assert reserve_public_run(5, session_factory=BrokenSession) is False


def test_a_second_concurrent_public_run_is_refused_without_using_a_run(client, model_slot, public_demo):
    model_slot["model"] = ScriptedModel()
    assert public_run_lock.acquire(blocking=False)
    try:
        response = client.post(DEMO_URL, json={"crops": ["tomato"]})
    finally:
        public_run_lock.release()

    assert response.status_code == 429
    assert model_slot["model"].requests == []
    assert used_runs() == 0


def test_the_public_lock_is_released_after_a_run_raises(public_demo):
    class ExplodingModel:
        name = "exploding"

        def respond(self, request):
            raise RuntimeError("bug")

    with pytest.raises(RuntimeError):
        season_allocation(
            None, "w", "demo-garden", AllocationRequest(crops=["tomato"]), ExplodingModel(), public=True, today=TODAY
        )

    assert not public_run_lock.locked()
    result = season_allocation(
        None,
        "w",
        "demo-garden",
        AllocationRequest(crops=["tomato", "bean"]),
        demo_draft_model(),
        public=True,
        today=TODAY,
    )
    assert result.status == "draft"


def test_the_demo_garden_loads_as_a_package_resource():
    snapshot = load_demo_garden()

    assert snapshot.garden_id == "demo-garden"
    assert [area.kind for area in snapshot.areas] == ["raised-bed", "in-ground", "container"]
    assert {planting.crop_family for planting in snapshot.plantings} == {"nightshade", "legume"}


# --- Usage logs under the real server start-up ---

STARTUP_LOG_SCRIPT = """
from datetime import date
import uvicorn

# The same path as `uvicorn app.main:app`: Config sets up uvicorn's logging,
# then load() imports the app. No test helper enables INFO logs here.
config = uvicorn.Config("app.main:app")
config.load()

from app.agent.allocation import AllocationRequest
from app.agent.loop import ModelTurn, run_allocation_agent
from app.agent.service import load_demo_garden

class Fake:
    name = "fake"
    def respond(self, request):
        return ModelTurn(text="", input_tokens=10, output_tokens=2)

run_allocation_agent(load_demo_garden(), AllocationRequest(crops=["tomato"]), Fake(), today=date(2026, 9, 24))
"""


def test_usage_records_reach_the_server_log_under_uvicorn_startup(tmp_path):
    completed = subprocess.run(
        [sys.executable, "-c", STARTUP_LOG_SCRIPT],
        cwd=Path(__file__).parents[1],
        env={**os.environ, "DATABASE_URL": "sqlite+pysqlite://", "UPLOADS_DIR": str(tmp_path)},
        capture_output=True,
        text=True,
        timeout=60,
    )

    assert completed.returncode == 0, completed.stderr
    assert '"event": "season_allocation_request"' in completed.stderr
    assert '"input_tokens": 10, "output_tokens": 2' in completed.stderr


# --- OpenAI adapter ---


def sample_request():
    return ModelRequest(
        model=DEFAULT_MODEL,
        instructions="Assign crops.",
        tools=[{"type": "function", "name": "t", "description": "d", "parameters": {"type": "object"}, "strict": False}],
        input=[{"role": "user", "content": "{}"}],
        text={"format": {"type": "json_schema", "name": "final_allocation", "schema": {}, "strict": False}},
        max_output_tokens=800,
    )


def response(*output, status="completed", reason=None, usage=(120, 30)):
    return SimpleNamespace(
        status=status,
        incomplete_details=SimpleNamespace(reason=reason) if reason else None,
        output=list(output),
        usage=SimpleNamespace(input_tokens=usage[0], output_tokens=usage[1]) if usage else None,
    )


def function_call(name="get_planting_history", call_id="call_1", arguments="{}"):
    return SimpleNamespace(type="function_call", call_id=call_id, name=name, arguments=arguments)


def message(*content):
    return SimpleNamespace(type="message", content=list(content))


def text(value):
    return SimpleNamespace(type="output_text", text=value)


class FakeResponses:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def create(self, **params):
        self.calls.append(params)
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def adapter(result):
    responses = FakeResponses(result)
    return OpenAIAllocationModel("sk-test", client=SimpleNamespace(responses=responses)), responses


def test_the_adapter_sends_exactly_the_request_parameters():
    model, responses = adapter(response(message(text('{"assignments": []}'))))
    request = sample_request()

    model.respond(request)

    assert responses.calls == [request.to_params()]
    assert responses.calls[0]["parallel_tool_calls"] is False
    assert responses.calls[0]["store"] is False
    assert responses.calls[0]["tools"][0]["strict"] is False
    assert responses.calls[0]["text"]["format"]["strict"] is False


def test_the_default_client_never_retries_on_its_own():
    model = OpenAIAllocationModel("sk-test")

    assert model.name == DEFAULT_MODEL == "gpt-4o-mini-2024-07-18"
    assert model.client.max_retries == 0
    assert model.client.timeout == 30.0


@pytest.mark.parametrize(
    ("result", "expected"),
    [
        (response(function_call(arguments='{"a": 1}')), ModelTurn(tool_call=ToolCall("call_1", "get_planting_history", '{"a": 1}'), input_tokens=120, output_tokens=30)),
        (response(message(text('{"assignments"'), text(': []}'))), ModelTurn(text='{"assignments": []}', input_tokens=120, output_tokens=30)),
        (response(status="incomplete", reason="max_output_tokens"), ModelTurn(truncated=True, input_tokens=120, output_tokens=30)),
        (response(status="incomplete", reason="content_filter"), ModelTurn(unusable="incomplete_output", input_tokens=120, output_tokens=30)),
        (response(message(SimpleNamespace(type="refusal", refusal="I can't help with that."))), ModelTurn(unusable="refusal", input_tokens=120, output_tokens=30)),
        (response(message(text("  "))), ModelTurn(unusable="empty_output", input_tokens=120, output_tokens=30)),
        (response(), ModelTurn(unusable="empty_output", input_tokens=120, output_tokens=30)),
        (response(function_call(call_id="a"), function_call(call_id="b")), ModelTurn(unusable="multiple_tool_calls", input_tokens=120, output_tokens=30)),
        (response(message(text("{}")), usage=None), ModelTurn(text="{}")),
    ],
)
def test_the_adapter_turns_each_response_shape_into_one_model_turn(result, expected):
    model, _ = adapter(result)

    assert model.respond(sample_request()) == expected


@pytest.mark.parametrize("status", ["failed", "cancelled"])
def test_failed_responses_are_provider_errors(status):
    model, _ = adapter(response(status=status))

    with pytest.raises(ModelProviderError):
        model.respond(sample_request())


REQUEST = httpx.Request("POST", "https://api.openai.com/v1/responses")


@pytest.mark.parametrize(
    "error",
    [
        openai.APIConnectionError(request=REQUEST),
        openai.APITimeoutError(request=REQUEST),
        openai.AuthenticationError("bad key", response=httpx.Response(401, request=REQUEST), body=None),
        openai.RateLimitError("insufficient_quota", response=httpx.Response(429, request=REQUEST), body=None),
        openai.InternalServerError("oops", response=httpx.Response(500, request=REQUEST), body=None),
    ],
)
def test_sdk_errors_become_provider_errors(error):
    model, _ = adapter(error)

    with pytest.raises(ModelProviderError):
        model.respond(sample_request())


def test_turn_parsing_is_available_without_a_client():
    assert turn_from_response(response(message(text("{}")))).text == "{}"
