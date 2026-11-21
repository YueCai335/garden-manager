"""Public AI Garden Note: fixed context, quota, usage stop, and IP limit (ADR-0059).

Every test uses a fake OpenAI client; no request leaves the process.
"""

import json
import logging
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import openai
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app import care_note_public, database
from app.ai import OpenAICareNoteExtractor
from app.care_note_public import (
    APPROVED_MODEL,
    CUMULATIVE_BUDGET_NAME,
    DAILY_RUN_LIMIT,
    HARD_RUN_CAP,
    RollingRateLimiter,
    daily_budget_name,
    exhaust_public_allocation,
    public_run_limit,
    public_used_runs,
    reserve_public_request,
)
from app.main import app, get_public_care_note_extractor
from app.models import AgentRunBudget
from app.service import ALL_GARDENS_NOT_PUBLIC
from tests.test_api import care_extraction

TODAY = datetime.now(timezone.utc).date()
DEMO_URL = "/workspaces/any-workspace/gardens/demo-garden/ai/care-note-draft"


def seed_budget(used: int = 0) -> None:
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=CUMULATIVE_BUDGET_NAME, used_runs=used))
        session.commit()


def daily_used(quota_date: date = TODAY) -> int | None:
    with database.SessionLocal() as session:
        return session.scalar(select(AgentRunBudget.used_runs).where(AgentRunBudget.name == daily_budget_name(quota_date)))


def openai_response(extraction=None, *, input_tokens=900, output_tokens=60, status="completed", content=None, usage=True):
    extraction = extraction or care_extraction(type="watering", date=TODAY, targetScope="planting-area", targetName="Sample raised bed")
    content = content or [SimpleNamespace(type="output_text", text=extraction.model_dump_json(by_alias=True))]
    return SimpleNamespace(
        status=status,
        output=[SimpleNamespace(type="message", content=content)],
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens) if usage else None,
    )


class FakeResponses:
    """Returns the queued responses in order, or raises a queued exception."""

    def __init__(self):
        self.queue: list = []
        self.requests: list[dict] = []

    def create(self, **params):
        self.requests.append(params)
        item = self.queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


@pytest.fixture
def fake_openai():
    responses = FakeResponses()
    extractor = OpenAICareNoteExtractor("test-key", APPROVED_MODEL, client=SimpleNamespace(responses=responses))
    app.dependency_overrides[get_public_care_note_extractor] = lambda: extractor
    yield responses
    app.dependency_overrides.pop(get_public_care_note_extractor, None)


@pytest.fixture
def public_demo(monkeypatch):
    monkeypatch.setenv("PORTFOLIO_DEMO_MODE", "true")
    monkeypatch.setenv("CARE_NOTE_PUBLIC_ENABLED", "true")
    monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", str(HARD_RUN_CAP))
    monkeypatch.setenv("CARE_NOTE_AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("CARE_NOTE_OPENAI_MODEL", raising=False)
    # A fresh IP limiter for every test; the module keeps one for the process.
    monkeypatch.setattr(care_note_public, "public_rate_limiter", RollingRateLimiter())
    seed_budget()


def post(client, note="今天给 Sample raised bed 浇了水", url=DEMO_URL, today=TODAY):
    return client.post(url, json={"note": note, "today": today.isoformat()})


# --- Configuration ---


@pytest.mark.parametrize(
    ("raw", "limit"),
    [(None, None), ("", None), ("ten", None), ("-1", None), ("59", None), ("78", None), ("0", 0), ("3", 3), ("58", 58)],
)
def test_run_limit_must_be_an_integer_from_0_to_58(monkeypatch, raw, limit):
    if raw is None:
        monkeypatch.delenv("CARE_NOTE_PUBLIC_RUN_LIMIT", raising=False)
    else:
        monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", raw)
    assert public_run_limit() == limit


@pytest.mark.parametrize(
    ("variable", "value"),
    [
        ("CARE_NOTE_PUBLIC_ENABLED", "false"),
        ("CARE_NOTE_PUBLIC_RUN_LIMIT", "0"),
        ("CARE_NOTE_PUBLIC_RUN_LIMIT", "59"),
        ("CARE_NOTE_AI_PROVIDER", "ollama"),
        ("CARE_NOTE_OPENAI_MODEL", "gpt-other"),
        ("OPENAI_API_KEY", ""),
    ],
)
def test_any_missing_setting_closes_public_generation_before_any_reservation(client, public_demo, fake_openai, monkeypatch, variable, value):
    monkeypatch.setenv(variable, value)

    response = post(client)

    assert response.status_code == 503
    assert response.json()["detail"].startswith("AI Garden Note is not available in the demo right now.")
    assert client.get("/runtime-config").json()["careNotePublicAvailable"] is False
    assert fake_openai.requests == []
    assert public_used_runs() == 0


def test_runtime_config_reports_availability_only_when_fully_configured(client, public_demo):
    assert client.get("/runtime-config").json() == {"portfolioDemo": True, "careNotePublicAvailable": True, "careNoteBatchAvailable": False, "careNoteBatchPublicAvailable": False}


def test_turning_the_switch_off_blocks_the_next_request(client, public_demo, fake_openai, monkeypatch):
    fake_openai.queue.append(openai_response())
    assert post(client).status_code == 200

    monkeypatch.setenv("CARE_NOTE_PUBLIC_ENABLED", "false")

    assert post(client).status_code == 503
    assert len(fake_openai.requests) == 1
    assert public_used_runs() == 1


# --- Fixed context and targets ---


def test_public_drafts_use_the_fixed_demo_garden_whatever_workspace_is_named(client, public_demo, fake_openai):
    fake_openai.queue.append(openai_response())

    response = post(client, url="/workspaces/someone-elses-workspace/gardens/demo-garden/ai/care-note-draft")

    assert response.status_code == 200
    assert response.json()["targetScope"] == "planting-area"
    assert response.json()["growingAreaId"] == "demo-raised-bed"
    sent = json.loads(fake_openai.requests[0]["input"])
    assert sent["garden"] == {
        "name": "Demo Garden",
        "plantingAreas": ["Sample raised bed", "Sample in-ground area", "Sample container group"],
        "plantGroups": ["Tomatoes", "Bush beans"],
    }
    assert public_used_runs() == 1
    assert daily_used() == 1


def test_another_garden_is_rejected_before_any_reservation(client, public_demo, fake_openai):
    response = post(client, url="/workspaces/any-workspace/gardens/garden-1/ai/care-note-draft")

    assert response.status_code == 404
    assert fake_openai.requests == []
    assert public_used_runs() == 0


@pytest.mark.parametrize(
    ("note", "model_scope"),
    [("今天给所有花园浇了水", "all-gardens"), ("Watered every garden today.", None)],
    ids=["model-all-gardens", "fallback-all-gardens"],
)
def test_public_drafts_never_target_all_gardens(client, public_demo, fake_openai, note, model_scope):
    fake_openai.queue.append(openai_response(care_extraction(type="watering", date=TODAY, targetScope=model_scope)))

    response = post(client, note=note)

    assert response.status_code == 200
    assert response.json()["targetScope"] is None
    assert response.json()["reviewNotes"] == [ALL_GARDENS_NOT_PUBLIC]


def test_a_note_that_is_not_a_completed_event_still_uses_a_reservation_and_returns_no_draft(client, public_demo, fake_openai):
    fake_openai.queue.append(openai_response(care_extraction(kind="negated")))

    response = post(client, note="今天没给番茄浇水")

    assert response.status_code == 200
    assert response.json()["kind"] == "negated"
    assert response.json()["type"] is None
    assert public_used_runs() == 1


# --- Input text ---


@pytest.mark.parametrize("escape", ["\\ud800", "\\udfff", "x\\ud83d"], ids=["high-surrogate", "low-surrogate", "split-pair"])
def test_a_note_that_is_not_valid_text_is_refused_before_any_reservation(client, public_demo, fake_openai, escape):
    body = '{"note": "' + escape + ' watered", "today": "' + TODAY.isoformat() + '"}'

    response = client.post(DEMO_URL, content=body, headers={"Content-Type": "application/json"})

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "note"]
    assert fake_openai.requests == []
    assert public_used_runs() == 0
    assert daily_used() is None


def test_the_local_app_refuses_a_note_that_is_not_valid_text(client, monkeypatch):
    monkeypatch.delenv("PORTFOLIO_DEMO_MODE", raising=False)
    body = '{"note": "\\ud800", "today": "' + TODAY.isoformat() + '"}'

    response = client.post("/workspaces/w/gardens/g/ai/care-note-draft", content=body, headers={"Content-Type": "application/json"})

    assert response.status_code == 422


@pytest.mark.parametrize(
    "note",
    ["今天给 Sample raised bed 浇了水", "Watered Sample raised bed today 🌱🍅", "今天浇了水 \\ud83c\\udf31"],
    ids=["chinese", "emoji", "escaped-surrogate-pair"],
)
def test_ordinary_chinese_and_emoji_notes_are_still_accepted(client, public_demo, fake_openai, note):
    fake_openai.queue.append(openai_response())
    body = '{"note": "' + note + '", "today": "' + TODAY.isoformat() + '"}'

    response = client.post(DEMO_URL, content=body.encode("utf-8"), headers={"Content-Type": "application/json"})

    assert response.status_code == 200
    assert len(fake_openai.requests) == 1


# --- Quota ---


def test_reservations_stop_at_the_cumulative_limit(public_demo):
    assert [reserve_public_request(3, TODAY) for _ in range(4)] == ["reserved", "reserved", "reserved", "used_up"]
    assert public_used_runs() == 3


def test_a_daily_limit_failure_rolls_back_the_cumulative_increment(public_demo):
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=daily_budget_name(TODAY), used_runs=DAILY_RUN_LIMIT))
        session.commit()

    assert reserve_public_request(HARD_RUN_CAP, TODAY) == "daily_limit"
    assert public_used_runs() == 0
    assert daily_used() == DAILY_RUN_LIMIT


def test_a_new_utc_day_starts_a_new_daily_count_and_keeps_the_cumulative_count(public_demo):
    tomorrow = TODAY + timedelta(days=1)
    assert reserve_public_request(HARD_RUN_CAP, TODAY) == "reserved"
    assert reserve_public_request(HARD_RUN_CAP, tomorrow) == "reserved"

    assert daily_used(TODAY) == 1
    assert daily_used(tomorrow) == 1
    assert public_used_runs() == 2


def test_raising_the_limit_from_3_to_78_keeps_the_used_count(public_demo):
    for _ in range(3):
        assert reserve_public_request(3, TODAY) == "reserved"
    assert reserve_public_request(3, TODAY) == "used_up"

    assert reserve_public_request(HARD_RUN_CAP, TODAY) == "reserved"
    assert public_used_runs() == 4


def test_a_counter_already_above_the_cap_keeps_its_value_and_refuses_reservations():
    seed_budget(used=70)

    assert reserve_public_request(HARD_RUN_CAP, TODAY) == "used_up"
    assert exhaust_public_allocation() is True
    assert public_used_runs() == 70


def test_a_missing_budget_row_or_an_out_of_range_limit_means_no_reservation():
    assert reserve_public_request(HARD_RUN_CAP, TODAY) == "unavailable"
    seed_budget()
    assert reserve_public_request(0, TODAY) == "unavailable"
    assert reserve_public_request(HARD_RUN_CAP + 1, TODAY) == "unavailable"
    assert public_used_runs() == 0


def test_a_database_error_means_no_reservation(public_demo):
    def broken_session():
        raise care_note_public.SQLAlchemyError("database down")

    assert reserve_public_request(HARD_RUN_CAP, TODAY, session_factory=broken_session) == "unavailable"


def test_used_up_and_daily_limits_return_messages_and_send_nothing(client, public_demo, fake_openai, monkeypatch):
    monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", "1")
    fake_openai.queue.append(openai_response())
    assert post(client).status_code == 200

    used_up = post(client)
    assert used_up.status_code == 503
    assert used_up.json()["detail"].startswith("The demo's AI drafts are used up.")

    monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", str(HARD_RUN_CAP))
    with database.SessionLocal() as session:
        session.get(AgentRunBudget, daily_budget_name(TODAY)).used_runs = DAILY_RUN_LIMIT
        session.commit()
    daily = post(client)
    assert daily.status_code == 429
    assert daily.json()["detail"].startswith("Today's AI drafts for the demo are used up.")
    assert len(fake_openai.requests) == 1
    assert public_used_runs() == 1


def test_an_oversized_request_is_rejected_before_any_reservation(client, public_demo, fake_openai, monkeypatch):
    monkeypatch.setattr(care_note_public, "MAX_REQUEST_BYTES", 100)

    response = post(client)

    assert response.status_code == 413
    assert fake_openai.requests == []
    assert public_used_runs() == 0


def test_the_byte_check_measures_the_exact_parameters_sent(client, public_demo, fake_openai, monkeypatch):
    measured: list[dict] = []
    original = care_note_public.care_note_request_bytes
    monkeypatch.setattr(care_note_public, "care_note_request_bytes", lambda params: measured.append(params) or original(params))
    fake_openai.queue.append(openai_response())

    post(client)

    assert measured == fake_openai.requests


# --- Failures keep the reservation ---


@pytest.mark.parametrize(
    "outcome",
    [
        openai.APITimeoutError(request=None),
        openai_response(status="incomplete"),
        openai_response(content=[SimpleNamespace(type="refusal", refusal="no")]),
        openai_response(content=[SimpleNamespace(type="output_text", text='{"kind": "completed"}')]),
    ],
    ids=["timeout", "truncated", "refusal", "malformed"],
)
def test_a_failed_generation_keeps_its_reservation_and_is_not_retried(client, public_demo, fake_openai, outcome):
    fake_openai.queue.append(outcome)

    response = post(client)

    assert response.status_code == 503
    assert len(fake_openai.requests) == 1
    assert public_used_runs() == 1
    assert daily_used() == 1


# --- Usage stop ---


@pytest.mark.parametrize(
    "response_kwargs",
    [{"input_tokens": 50_000}, {"output_tokens": 801}, {"usage": False}, {"input_tokens": None}],
    ids=["input-above-allowance", "output-above-cap", "missing-usage", "invalid-usage"],
)
def test_usage_outside_the_cost_assumptions_stops_every_later_request(client, public_demo, fake_openai, monkeypatch, response_kwargs):
    fake_openai.queue.append(openai_response(**response_kwargs))

    stopped = post(client)

    assert stopped.status_code == 503
    assert stopped.json()["detail"].startswith("AI Garden Note stopped in the demo")
    assert public_used_runs() == HARD_RUN_CAP

    # Neither the next request nor a raised limit reopens it.
    assert post(client).status_code == 503
    monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", str(HARD_RUN_CAP))
    assert post(client).status_code == 503
    assert len(fake_openai.requests) == 1


def test_usage_on_a_refused_response_is_still_checked(client, public_demo, fake_openai):
    fake_openai.queue.append(openai_response(content=[SimpleNamespace(type="refusal", refusal="no")], input_tokens=50_000))

    post(client)

    assert public_used_runs() == HARD_RUN_CAP


def test_the_stop_never_lowers_the_counter():
    seed_budget(used=HARD_RUN_CAP)
    assert exhaust_public_allocation() is True
    assert public_used_runs() == HARD_RUN_CAP


def test_a_failed_stop_write_returns_an_error_and_logs_the_stop_as_unconfirmed(client, public_demo, fake_openai, monkeypatch, caplog):
    monkeypatch.setattr(care_note_public, "exhaust_public_allocation", lambda session_factory=None: False)
    fake_openai.queue.append(openai_response(input_tokens=50_000))

    with caplog.at_level(logging.ERROR, logger="app.care_note_public"):
        response = post(client)

    assert response.status_code == 503
    [record] = [r for r in caplog.records if "care_note_public_stop_unconfirmed" in r.getMessage()]
    assert json.loads(record.getMessage())["stop_reason"] == "input_above_allowance"


def test_a_missing_budget_row_makes_the_stop_fail():
    assert exhaust_public_allocation() is False


def test_request_logs_carry_usage_and_cost_but_never_the_note(client, public_demo, fake_openai, caplog):
    fake_openai.queue.append(openai_response(input_tokens=1_000, output_tokens=100))

    with caplog.at_level(logging.INFO, logger="app.care_note_public"):
        post(client, note="今天给 Sample raised bed 浇了水")

    [line] = [r.getMessage() for r in caplog.records if "care_note_public_request" in r.getMessage()]
    record = json.loads(line)
    assert record["outcome"] == "draft"
    assert record["input_tokens"] == 1_000
    assert record["estimated_cost_usd"] == round(1_000 * 0.15e-6 + 100 * 0.60e-6, 6)
    assert "Sample raised bed" not in line and "test-key" not in line


# --- Request IDs ---


def care_note_log_lines(caplog) -> list[dict]:
    return [json.loads(r.getMessage()) for r in caplog.records if "care_note_public_request" in r.getMessage()]


def test_each_response_and_its_log_line_share_a_request_id_and_the_limit_in_force(client, public_demo, fake_openai, monkeypatch, caplog):
    monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", "3")
    fake_openai.queue.append(openai_response())

    with caplog.at_level(logging.INFO, logger="app.care_note_public"):
        response = post(client)

    request_id = response.headers[care_note_public.REQUEST_ID_HEADER]
    [line] = care_note_log_lines(caplog)
    assert line["request_id"] == request_id
    assert line["run_limit"] == 3
    assert line["outcome"] == "draft"


@pytest.mark.parametrize(
    ("setup", "outcome", "status"),
    [("closed", "closed", 503), ("rate_limited", "rate_limited", 429), ("used_up", "used_up", 503), ("wrong_garden", "wrong_garden", 404)],
)
def test_rejected_requests_also_return_and_log_their_request_id(client, public_demo, fake_openai, monkeypatch, caplog, setup, outcome, status):
    url = DEMO_URL
    if setup == "closed":
        monkeypatch.setenv("CARE_NOTE_PUBLIC_ENABLED", "false")
    elif setup == "rate_limited":
        monkeypatch.setattr(care_note_public, "public_rate_limiter", RollingRateLimiter(limit=0))
    elif setup == "used_up":
        monkeypatch.setenv("CARE_NOTE_PUBLIC_RUN_LIMIT", "1")
        with database.SessionLocal() as session:
            session.get(AgentRunBudget, CUMULATIVE_BUDGET_NAME).used_runs = 1
            session.commit()
    else:
        url = "/workspaces/any-workspace/gardens/garden-1/ai/care-note-draft"

    with caplog.at_level(logging.INFO, logger="app.care_note_public"):
        response = post(client, url=url)

    assert response.status_code == status
    [line] = care_note_log_lines(caplog)
    assert line["outcome"] == outcome
    assert line["request_id"] == response.headers[care_note_public.REQUEST_ID_HEADER]
    assert fake_openai.requests == []


def test_the_local_app_sends_no_request_id(client, monkeypatch):
    monkeypatch.delenv("PORTFOLIO_DEMO_MODE", raising=False)
    response = post(client, url="/workspaces/missing/gardens/garden-1/ai/care-note-draft")
    assert care_note_public.REQUEST_ID_HEADER not in response.headers


def test_browsers_may_read_the_request_id_header(client):
    response = client.options(
        DEMO_URL, headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST"}
    )
    preflight_ok = response.status_code == 200
    actual = client.post(DEMO_URL, json={}, headers={"Origin": "http://localhost:3000"})
    assert preflight_ok
    assert care_note_public.REQUEST_ID_HEADER.lower() in actual.headers["access-control-expose-headers"].lower()


# --- IP limit ---


def test_the_rate_limiter_allows_five_per_rolling_minute_per_key_and_forgets_idle_keys():
    now = [0.0]
    limiter = RollingRateLimiter(clock=lambda: now[0])

    assert [limiter.allow("a") for _ in range(6)] == [True] * 5 + [False]
    assert limiter.allow("b") is True
    now[0] = 60.0
    assert limiter.allow("a") is True
    now[0] = 200.0
    limiter.allow("c")
    assert set(limiter.hits) == {"c"}


def test_a_sixth_request_in_a_minute_is_refused_before_any_reservation(client, public_demo, fake_openai):
    fake_openai.queue.extend(openai_response() for _ in range(5))
    assert [post(client).status_code for _ in range(5)] == [200] * 5

    response = post(client)

    assert response.status_code == 429
    assert public_used_runs() == 5


def test_a_restart_clears_only_the_ip_counters(client, public_demo, fake_openai, monkeypatch):
    fake_openai.queue.extend(openai_response() for _ in range(6))
    for _ in range(5):
        post(client)
    assert post(client).status_code == 429

    monkeypatch.setattr(care_note_public, "public_rate_limiter", RollingRateLimiter())  # a new process

    assert post(client).status_code == 200
    assert public_used_runs() == 6


def test_behind_a_trusted_proxy_each_client_ip_has_its_own_limit_and_forged_headers_do_not_help(public_demo, fake_openai):
    fake_openai.queue.extend(openai_response() for _ in range(11))
    proxied = ProxyHeadersMiddleware(app, trusted_hosts="10.0.0.1")
    body = {"note": "今天给 Sample raised bed 浇了水", "today": TODAY.isoformat()}

    with TestClient(proxied, client=("10.0.0.1", 1234)) as via_proxy:
        statuses = [via_proxy.post(DEMO_URL, json=body, headers={"X-Forwarded-For": "203.0.113.5"}).status_code for _ in range(6)]
        other_client = via_proxy.post(DEMO_URL, json=body, headers={"X-Forwarded-For": "203.0.113.6"}).status_code
    # An untrusted peer claiming a fresh address each time is still limited by its own address.
    with TestClient(proxied, client=("198.51.100.7", 1234)) as untrusted:
        forged = [untrusted.post(DEMO_URL, json=body, headers={"X-Forwarded-For": f"192.0.2.{n}"}).status_code for n in range(6)]

    assert statuses == [200] * 5 + [429]
    assert other_client == 200
    assert forged == [200] * 5 + [429]


# --- The allocation agent stays closed ---


def test_a_present_key_does_not_open_the_allocation_agent(client, public_demo, monkeypatch):
    created: list = []

    class RecordingOpenAI:
        def __init__(self, **kwargs):
            created.append(kwargs)
            self.responses = SimpleNamespace(create=lambda **params: pytest.fail("the agent sent a model request"))

        def close(self):
            pass

    monkeypatch.setenv("AGENT_PUBLIC_RUN_LIMIT", "0")
    monkeypatch.setattr("app.agent.openai_model.OpenAI", RecordingOpenAI)

    body = client.post(
        "/workspaces/any-workspace/gardens/demo-garden/ai/season-allocation", json={"crops": ["tomato"]}
    ).json()

    assert body["status"] == "budget_exhausted"
