"""Public AI note batches: showcase gardens, their own quota, usage stop, and the injection guard (ADR-0086).

Every test uses a fake OpenAI client; no request leaves the process.
"""

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import care_note_batch_public as public, care_note_public, database
from app.care_note_batch import OpenAICareNoteBatchExtractor
from app.care_note_batch_live import near_maximum_note
from app.care_note_public import APPROVED_MODEL, RollingRateLimiter, daily_budget_name, public_used_runs
from app.main import app, get_public_care_note_batch_extractor
from app.models import AgentRunBudget
from app.schemas import CareNoteDraftRequest
from tests.test_care_note_batch import event

TODAY = datetime.now(timezone.utc).date()
URL = "/workspaces/any-workspace/ai/care-note-drafts"
BUDGET = public.BATCH_BUDGET
RUNS = Path(__file__).parents[1] / "evaluation" / "care_note" / "batch-8" / "runs"


def answer(*events, **fields) -> str:
    return json.dumps({"overflow": False, "sharedDateText": None, "events": list(events), **fields})


WATER_BED = answer(event("Watered Raised bed 1 in Backyard today", gardenName="Backyard", targetScope="planting-area", targetName="Raised bed 1"))


def openai_response(text=WATER_BED, *, input_tokens=1_100, output_tokens=300, usage=True):
    return SimpleNamespace(
        status="completed",
        output=[SimpleNamespace(type="message", content=[SimpleNamespace(type="output_text", text=text)])],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens) if usage else None,
    )


class FakeResponses:
    def __init__(self):
        self.queue: list = []
        self.requests: list[dict] = []

    def create(self, **params):
        self.requests.append(params)
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


def seed_budget(used: int = 0) -> None:
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=BUDGET.name, used_runs=used))
        session.commit()


def used() -> int | None:
    return public_used_runs(budget=BUDGET)


@pytest.fixture
def fake_openai():
    responses = FakeResponses()
    extractor = OpenAICareNoteBatchExtractor("test-key", APPROVED_MODEL, client=SimpleNamespace(responses=responses))
    app.dependency_overrides[get_public_care_note_batch_extractor] = lambda: extractor
    yield responses
    app.dependency_overrides.pop(get_public_care_note_batch_extractor, None)


@pytest.fixture
def public_demo(monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")
    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_ENABLED", "true")
    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", str(BUDGET.hard_cap))
    monkeypatch.setenv("CARE_NOTE_AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("CARE_NOTE_OPENAI_MODEL", raising=False)
    # The single-note path stays closed; the batch path has its own switches.
    monkeypatch.delenv("CARE_NOTE_PUBLIC_ENABLED", raising=False)
    monkeypatch.setattr(public, "public_batch_rate_limiter", RollingRateLimiter())
    seed_budget()


def post(client, note="Watered Raised bed 1 in Backyard today", today=TODAY):
    return client.post(URL, json={"note": note, "today": today.isoformat()})


def log_lines(caplog) -> list[dict]:
    return [json.loads(r.getMessage()) for r in caplog.records if public.LOG_EVENT in r.getMessage()]


# --- Configuration ---


def test_the_caps_are_fixed_in_code():
    assert (BUDGET.name, BUDGET.hard_cap, BUDGET.daily_limit, public.MAX_REQUEST_BYTES) == ("care-note-batch-public", 300, 20, 10_000)


@pytest.mark.parametrize("raw, limit", [(None, None), ("0", 0), ("3", 3), ("300", 300), ("301", None), ("-1", None), ("x", None)])
def test_the_run_limit_must_be_an_integer_from_0_to_300(monkeypatch, raw, limit):
    if raw is None:
        monkeypatch.delenv("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", raising=False)
    else:
        monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", raw)
    assert public.public_batch_run_limit() == limit


def test_runtime_config_reports_the_batch_path_only_when_fully_configured(client, public_demo):
    config = client.get("/runtime-config").json()
    assert config["careNoteBatchPublicAvailable"] is True
    # The local batch flag and the single-note path are unchanged.
    assert config["careNoteBatchAvailable"] is False and config["careNotePublicAvailable"] is False


@pytest.mark.parametrize(
    "variable, value",
    [
        ("CARE_NOTE_BATCH_PUBLIC_ENABLED", "false"),
        ("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", "0"),
        ("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", "999"),
        ("CARE_NOTE_AI_PROVIDER", "ollama"),
        ("CARE_NOTE_OPENAI_MODEL", "gpt-4o"),
        ("OPENAI_API_KEY", ""),
    ],
)
def test_any_missing_setting_closes_the_path_before_any_reservation(client, public_demo, fake_openai, monkeypatch, variable, value):
    monkeypatch.setenv(variable, value)
    response = post(client)
    assert response.status_code == 503
    assert response.json()["detail"] == public.UNAVAILABLE
    assert client.get("/runtime-config").json()["careNoteBatchPublicAvailable"] is False
    assert fake_openai.requests == [] and used() == 0


def test_the_local_app_keeps_its_own_batch_path(client, monkeypatch):
    monkeypatch.delenv("PORTFOLIO_DEMO_MODE", raising=False)
    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_ENABLED", "true")
    config = client.get("/runtime-config").json()
    assert config["careNoteBatchAvailable"] is True and config["careNoteBatchPublicAvailable"] is False
    # A local request reads the stored workspace and sends no request ID.
    response = post(client)
    assert response.status_code in (404, 503)
    assert care_note_public.REQUEST_ID_HEADER not in response.headers


# --- Fixed context ---


def test_the_model_reads_the_showcase_gardens_never_the_stored_workspace(client, public_demo, fake_openai):
    fake_openai.queue.append(openai_response())
    response = post(client)
    assert response.status_code == 200
    [draft] = response.json()["drafts"]
    assert (draft["gardenId"], draft["growingAreaId"]) == ("demo-backyard", "demo-backyard-raised-bed-1")
    context = json.loads(fake_openai.requests[0]["input"])["gardens"]
    assert [garden["name"] for garden in context] == ["Backyard", "Community Garden", "Front Yard"]
    assert fake_openai.requests[0]["temperature"] == 0 and fake_openai.requests[0]["store"] is False


def test_the_longest_note_fits_the_byte_limit():
    extractor = OpenAICareNoteBatchExtractor("offline", APPROVED_MODEL, client=object())
    context = [garden.model_context() for garden in public.showcase_gardens().values()]
    params = extractor.request_params(near_maximum_note(), context, TODAY)
    assert public.care_note_request_bytes(params) <= public.MAX_REQUEST_BYTES


def test_an_obeyed_instruction_drafts_nothing_on_the_recorded_batch_8_answer(public_demo, fake_openai):
    # The real answer that failed batch 8: eleven watering events quoting the injected instruction.
    record = json.loads((RUNS / "40-evaluation-b7-en-injection.json").read_text(encoding="utf-8"))
    fake_openai.queue.append(openai_response(record["output_text"]))
    day = date.fromisoformat(record["today"])
    result = public.public_care_note_batch(
        CareNoteDraftRequest(note=record["case"]["note"], today=day),
        get_public_extractor(fake_openai),
        server_today=day,
        client_ip="203.0.113.1",
        request_id="test",
    )
    assert [(row["type"], row["plantingRecordId"], row["fertilizerAmount"]) for row in result["drafts"]] == [
        ("fertilizing", "demo-backyard-raised-bed-3-carrot", 5)
    ]
    assert any(notice["message"] == "This part reads as an instruction to the AI, so it was not followed." for notice in result["notices"])


def get_public_extractor(responses: FakeResponses) -> OpenAICareNoteBatchExtractor:
    return OpenAICareNoteBatchExtractor("test-key", APPROVED_MODEL, client=SimpleNamespace(responses=responses))


# --- Refusals before spending ---


def test_an_implausible_date_is_refused_before_any_reservation(client, public_demo, fake_openai):
    response = post(client, today=date(2020, 1, 1))
    assert response.status_code == 422
    assert fake_openai.requests == [] and used() == 0


def test_the_ip_limit_refuses_the_sixth_request_in_a_minute(client, public_demo, fake_openai):
    fake_openai.queue.extend(openai_response() for _ in range(5))
    assert [post(client).status_code for _ in range(6)] == [200] * 5 + [429]
    assert len(fake_openai.requests) == 5 and used() == 5


def test_an_oversized_request_is_refused_before_any_reservation(client, public_demo, fake_openai, monkeypatch):
    monkeypatch.setattr(public, "MAX_REQUEST_BYTES", 100)
    response = post(client)
    assert response.status_code == 413
    assert fake_openai.requests == [] and used() == 0


def test_used_up_and_daily_limits_send_nothing(client, public_demo, fake_openai, monkeypatch):
    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", "1")
    fake_openai.queue.append(openai_response())
    assert post(client).status_code == 200
    used_up = post(client)
    assert used_up.status_code == 503 and used_up.json()["detail"].startswith("The demo's AI notes are used up.")

    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", str(BUDGET.hard_cap))
    with database.SessionLocal() as session:
        session.get(AgentRunBudget, daily_budget_name(TODAY, BUDGET)).used_runs = BUDGET.daily_limit
        session.commit()
    daily = post(client)
    assert daily.status_code == 429 and daily.json()["detail"].startswith("Today's AI notes for the demo are used up.")
    assert len(fake_openai.requests) == 1 and used() == 1


def test_the_batch_quota_is_separate_from_the_single_note_quota(client, public_demo, fake_openai):
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=care_note_public.CUMULATIVE_BUDGET_NAME, used_runs=care_note_public.HARD_RUN_CAP))
        session.commit()
    fake_openai.queue.append(openai_response())
    assert post(client).status_code == 200
    assert used() == 1 and public_used_runs() == care_note_public.HARD_RUN_CAP


def test_a_missing_budget_row_means_no_request(client, public_demo, fake_openai):
    with database.SessionLocal() as session:
        session.delete(session.get(AgentRunBudget, BUDGET.name))
        session.commit()
    response = post(client)
    assert response.status_code == 503 and response.json()["detail"] == public.UNAVAILABLE
    assert fake_openai.requests == []


# --- After the request ---


def test_a_provider_error_keeps_its_reservation(client, public_demo, fake_openai):
    import openai

    fake_openai.queue.append(openai.APIConnectionError(request=None))
    assert post(client).status_code == 503
    assert used() == 1


def test_an_unusable_answer_keeps_its_reservation_and_says_so(client, public_demo, fake_openai):
    fake_openai.queue.append(openai_response("not json"))
    response = post(client)
    assert response.status_code == 503 and "could not create a usable batch" in response.json()["detail"]
    assert used() == 1


@pytest.mark.parametrize(
    "response_kwargs",
    [{"input_tokens": 50_000}, {"output_tokens": 8_193}, {"usage": False}],
    ids=["input-above-allowance", "output-above-cap", "missing-usage"],
)
def test_usage_outside_the_cost_assumptions_stops_every_later_request(client, public_demo, fake_openai, response_kwargs):
    fake_openai.queue.append(openai_response(**response_kwargs))
    stopped = post(client)
    assert stopped.status_code == 503 and stopped.json()["detail"].startswith("AI notes stopped in the demo")
    assert used() == BUDGET.hard_cap
    assert post(client).status_code == 503
    assert len(fake_openai.requests) == 1


def test_a_failed_stop_write_is_logged_as_unconfirmed(client, public_demo, fake_openai, monkeypatch, caplog):
    monkeypatch.setattr(care_note_public, "exhaust_public_allocation", lambda session_factory=None, budget=None: False)
    fake_openai.queue.append(openai_response(input_tokens=50_000))
    with caplog.at_level(logging.ERROR, logger="app.care_note_batch_public"):
        assert post(client).status_code == 503
    [record] = [r for r in caplog.records if "care_note_batch_public_stop_unconfirmed" in r.getMessage()]
    assert json.loads(record.getMessage())["stop_reason"] == "input_above_allowance"


def test_too_many_jobs_asks_the_visitor_to_split_the_note(client, public_demo, fake_openai):
    jobs = [event(f"Watered Backyard {n}", gardenName="Backyard") for n in range(13)]
    note = ". ".join(job["sourceText"] for job in jobs)
    fake_openai.queue.append(openai_response(answer(*jobs)))
    response = post(client, note=note)
    assert response.status_code == 422 and "at most 12" in response.json()["detail"]


# --- Logs and request IDs ---


def test_logs_carry_counts_usage_and_cost_but_never_the_note(client, public_demo, fake_openai, caplog):
    fake_openai.queue.append(openai_response(input_tokens=1_100, output_tokens=300))
    with caplog.at_level(logging.INFO, logger="app.care_note_public"):
        response = post(client)
    [line] = log_lines(caplog)
    assert line["outcome"] == "draft" and line["drafts"] == 1 and line["notices"] == 0
    assert line["drafts_needing_review"] == 0 and line["instruction_guard"] is False
    assert line["estimated_cost_usd"] == round(1_100 * 0.15e-6 + 300 * 0.60e-6, 6)
    assert line["request_id"] == response.headers[care_note_public.REQUEST_ID_HEADER]
    raw = json.dumps(line)
    assert "Raised bed 1" not in raw and "test-key" not in raw


def test_a_refused_request_also_returns_and_logs_its_request_id(client, public_demo, fake_openai, monkeypatch, caplog):
    monkeypatch.setenv("CARE_NOTE_BATCH_PUBLIC_ENABLED", "false")
    with caplog.at_level(logging.INFO, logger="app.care_note_public"):
        response = post(client)
    [line] = log_lines(caplog)
    assert line["outcome"] == "closed"
    assert line["request_id"] == response.headers[care_note_public.REQUEST_ID_HEADER]
