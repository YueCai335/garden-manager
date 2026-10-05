"""AI Garden Note in the public demo: fixed context, paid quota, and automatic stop (ADR-0059).

Every public generation passes these checks in order, and only the last step
spends money:

1. The feature switch, the run limit, the provider, the approved model, and
   the key are all configured.
2. The garden is the fixed demo garden and the browser's date is plausible.
3. The client IP is under its short-term limit.
4. The exact request parameters fit the byte limit.
5. One transaction reserves a cumulative and a daily request and commits.
6. One OpenAI request runs, with no database transaction open.

A reservation is never refunded. Each response's usage is checked before its
draft is returned; usage outside the cost assumptions raises the cumulative
counter to the hard cap, which stops every later request in every process.
"""

import json
import logging
import os
import threading
import time
from collections import deque
from datetime import date
from typing import Literal
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import case, select, update
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.exc import SQLAlchemyError

from . import database
from .ai import (
    CARE_NOTE_MAX_OUTPUT_TOKENS,
    DEFAULT_CARE_NOTE_OPENAI_MODEL,
    CareNoteProviderError,
    OpenAICareNoteExtractor,
    care_note_request_bytes,
    parse_care_note_response,
)
from .demo_garden import PUBLIC_DEMO_GARDEN_ID, load_demo_garden_data
from .models import AgentRunBudget
from .schemas import CareNoteDraftRequest
from .service import CareNoteArea, CareNoteGarden, CareNotePlanting, check_client_today, draft_from_extraction


logger = logging.getLogger(__name__)

APPROVED_MODEL = DEFAULT_CARE_NOTE_OPENAI_MODEL
CUMULATIVE_BUDGET_NAME = "care-note-public"
DAILY_BUDGET_PREFIX = "care-note-public-day-"
# The online share of this release's 100 paid requests; no configuration can exceed it.
HARD_RUN_CAP = 78
DAILY_RUN_LIMIT = 30
MAX_REQUEST_BYTES = 8_000
FORMAT_TOKEN_ALLOWANCE = 1_000
RATE_LIMIT_REQUESTS = 5
RATE_LIMIT_WINDOW_SECONDS = 60.0
INPUT_PRICE_PER_TOKEN = 0.15 / 1_000_000
OUTPUT_PRICE_PER_TOKEN = 0.60 / 1_000_000
DEMO_GARDEN_NAME = "Demo Garden"

MANUAL_ENTRY = "You can still fill in the record manually."
UNAVAILABLE = f"AI Garden Note is not available in the demo right now. {MANUAL_ENTRY}"
# Response header carrying the request ID; the browser shows it so a check can be matched to its log line.
REQUEST_ID_HEADER = "X-Care-Note-Request"

Reservation = Literal["reserved", "used_up", "daily_limit", "unavailable"]


# --- Configuration ---


def public_run_limit() -> int | None:
    """CARE_NOTE_PUBLIC_RUN_LIMIT as an integer from 0 to 78; anything else is None (closed)."""
    raw = os.getenv("CARE_NOTE_PUBLIC_RUN_LIMIT")
    try:
        limit = int(raw) if raw is not None else None
    except ValueError:
        limit = None
    if limit is None or not 0 <= limit <= HARD_RUN_CAP:
        if raw is not None:
            logger.error("CARE_NOTE_PUBLIC_RUN_LIMIT=%r is not an integer from 0 to %d; public generation is closed.", raw, HARD_RUN_CAP)
        return None
    return limit


def public_generation_available() -> bool:
    """Whether the configuration allows public generation. Quotas are checked per request."""
    return (
        os.getenv("CARE_NOTE_PUBLIC_ENABLED", "").lower() in {"1", "true", "yes"}
        and bool(public_run_limit())
        and os.getenv("CARE_NOTE_AI_PROVIDER", "").lower() == "openai"
        and os.getenv("CARE_NOTE_OPENAI_MODEL", APPROVED_MODEL) == APPROVED_MODEL
        and bool(os.getenv("OPENAI_API_KEY"))
    )


def demo_care_note_garden() -> CareNoteGarden:
    data = load_demo_garden_data()
    return CareNoteGarden(
        name=DEMO_GARDEN_NAME,
        areas=tuple(CareNoteArea(area["id"], area["name"]) for area in data["growingAreas"]),
        plantings=tuple(
            CareNotePlanting(planting["id"], planting["commonName"], planting["growingAreaId"])
            for planting in data["plantings"]
        ),
    )


# --- Persistent quota ---


def daily_budget_name(quota_date: date) -> str:
    return f"{DAILY_BUDGET_PREFIX}{quota_date.isoformat()}"


def reserve_public_request(limit: int, quota_date: date, session_factory=None) -> Reservation:
    """Count one request against the cumulative and daily limits in one transaction.

    The cumulative row is always updated first, so concurrent reservations
    take the two row locks in the same order. If the daily limit is reached,
    the cumulative increment rolls back with it.
    """
    if not 0 < limit <= HARD_RUN_CAP:
        return "unavailable"
    daily_name = daily_budget_name(quota_date)
    try:
        with (session_factory or database.SessionLocal)() as session:
            cumulative = session.execute(
                update(AgentRunBudget)
                .where(AgentRunBudget.name == CUMULATIVE_BUDGET_NAME, AgentRunBudget.used_runs < limit)
                .values(used_runs=AgentRunBudget.used_runs + 1)
            ).rowcount
            if cumulative != 1:
                session.rollback()
                if session.get(AgentRunBudget, CUMULATIVE_BUDGET_NAME) is None:
                    logger.error("The %s budget row is missing; public generation is closed.", CUMULATIVE_BUDGET_NAME)
                    return "unavailable"
                return "used_up"
            # The first request of a UTC day creates its row; the primary key
            # makes a concurrent first request skip the insert instead of failing.
            dialect = postgresql if session.get_bind().dialect.name == "postgresql" else sqlite
            session.execute(
                dialect.insert(AgentRunBudget).values(name=daily_name, used_runs=0).on_conflict_do_nothing()
            )
            daily = session.execute(
                update(AgentRunBudget)
                .where(AgentRunBudget.name == daily_name, AgentRunBudget.used_runs < DAILY_RUN_LIMIT)
                .values(used_runs=AgentRunBudget.used_runs + 1)
            ).rowcount
            if daily != 1:
                session.rollback()
                return "daily_limit"
            session.commit()
            return "reserved"
    except SQLAlchemyError:
        logger.exception("Could not reserve a public care-note request; treating the quota as unavailable.")
        return "unavailable"


def exhaust_public_allocation(session_factory=None) -> bool:
    """Raise the cumulative counter to the hard cap; True only when that is committed.

    The counter never goes down, so a concurrent reservation cannot be undone.
    """
    try:
        with (session_factory or database.SessionLocal)() as session:
            changed = session.execute(
                update(AgentRunBudget)
                .where(AgentRunBudget.name == CUMULATIVE_BUDGET_NAME)
                .values(
                    used_runs=case(
                        (AgentRunBudget.used_runs < HARD_RUN_CAP, HARD_RUN_CAP), else_=AgentRunBudget.used_runs
                    )
                )
            ).rowcount
            if changed != 1:
                session.rollback()
                return False
            session.commit()
            return True
    except SQLAlchemyError:
        logger.exception("Could not write the care-note usage stop.")
        return False


def public_used_runs(session_factory=None) -> int | None:
    with (session_factory or database.SessionLocal)() as session:
        return session.scalar(select(AgentRunBudget.used_runs).where(AgentRunBudget.name == CUMULATIVE_BUDGET_NAME))


# --- Short-term IP limit ---


class RollingRateLimiter:
    """At most `limit` requests per key in any rolling window, held in this process only.

    The counters reset when the process restarts, and each worker would keep
    its own; the PostgreSQL quotas, not this limiter, bound spending.
    """

    def __init__(self, limit: int = RATE_LIMIT_REQUESTS, window_seconds: float = RATE_LIMIT_WINDOW_SECONDS, clock=time.monotonic):
        self.limit = limit
        self.window_seconds = window_seconds
        self.clock = clock
        self.lock = threading.Lock()
        self.hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = self.clock()
        with self.lock:
            # Drop expired hits for every key, so idle clients leave no entry behind.
            for client, hits in list(self.hits.items()):
                while hits and now - hits[0] >= self.window_seconds:
                    hits.popleft()
                if not hits:
                    del self.hits[client]
            hits = self.hits.setdefault(key, deque())
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True


public_rate_limiter = RollingRateLimiter()


# --- Usage check ---


def usage_problem(response, request_bytes: int) -> str | None:
    """Why a response's usage breaks the cost assumptions, or None when it fits."""
    usage = getattr(response, "usage", None)
    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    if not isinstance(input_tokens, int) or not isinstance(output_tokens, int) or input_tokens < 0 or output_tokens < 0:
        return "missing_or_invalid_usage"
    if input_tokens > request_bytes + FORMAT_TOKEN_ALLOWANCE:
        return "input_above_allowance"
    if output_tokens > CARE_NOTE_MAX_OUTPUT_TOKENS:
        return "output_above_cap"
    return None


def log_request(**record) -> None:
    input_tokens, output_tokens = record.get("input_tokens"), record.get("output_tokens")
    if isinstance(input_tokens, int) and isinstance(output_tokens, int):
        record["estimated_cost_usd"] = round(input_tokens * INPUT_PRICE_PER_TOKEN + output_tokens * OUTPUT_PRICE_PER_TOKEN, 6)
    # Never the note text or the key.
    logger.info(json.dumps({"event": "care_note_public_request", **record}))


# --- Request flow ---


def new_request_id() -> str:
    """A short random ID that ties one browser request to its log lines."""
    return uuid4().hex[:12]


def public_care_note_draft(
    garden_id: str,
    payload: CareNoteDraftRequest,
    extractor: OpenAICareNoteExtractor | None,
    *,
    server_today: date,
    client_ip: str,
    request_id: str,
    session_factory=None,
    rate_limiter: RollingRateLimiter | None = None,
) -> dict:
    limit = public_run_limit()
    # Every attempt logs one line with its request ID and the limit in force,
    # so a C3 check can be told apart from other traffic (ADR-0059).
    record: dict = {"request_id": request_id, "run_limit": limit}

    def reject(status_code: int, detail: str, outcome: str) -> HTTPException:
        log_request(**record, outcome=outcome)
        return HTTPException(status_code=status_code, detail=detail)

    if not public_generation_available() or extractor is None or limit is None:
        raise reject(503, UNAVAILABLE, "closed")
    if garden_id != PUBLIC_DEMO_GARDEN_ID:
        raise reject(404, "The demo creates drafts for the example garden only.", "wrong_garden")
    try:
        check_client_today(payload.today, server_today)
    except HTTPException as error:
        raise reject(error.status_code, error.detail, "implausible_date") from error
    if not (rate_limiter or public_rate_limiter).allow(client_ip):
        raise reject(429, "Too many drafts from this connection. Wait a minute and try again.", "rate_limited")

    garden = demo_care_note_garden()
    params = extractor.request_params(payload.note, garden.model_context(), payload.today)
    request_bytes = care_note_request_bytes(params)
    record.update(model=params["model"], bytes=request_bytes)
    if request_bytes > MAX_REQUEST_BYTES:
        raise reject(413, "This note is too long for the demo. Shorten it and try again.", "request_too_large")

    reservation = reserve_public_request(limit, server_today, session_factory)
    if reservation == "used_up":
        raise reject(503, f"The demo's AI drafts are used up. {MANUAL_ENTRY}", "used_up")
    if reservation == "daily_limit":
        raise reject(429, "Today's AI drafts for the demo are used up. Try again tomorrow, or fill in the record manually.", "daily_limit")
    if reservation != "reserved":
        raise reject(503, UNAVAILABLE, "quota_unavailable")

    started = time.monotonic()
    try:
        response = extractor.send(params)
    except CareNoteProviderError as error:
        record.update(duration_ms=round((time.monotonic() - started) * 1000))
        raise reject(503, str(error), "provider_error") from error

    usage = getattr(response, "usage", None)
    record.update(
        duration_ms=round((time.monotonic() - started) * 1000),
        status=getattr(response, "status", None),
        input_tokens=getattr(usage, "input_tokens", None),
        output_tokens=getattr(usage, "output_tokens", None),
    )
    problem = usage_problem(response, request_bytes)
    if problem is not None:
        stopped = exhaust_public_allocation(session_factory)
        if stopped:
            log_request(**record, outcome="usage_stop", stop_reason=problem)
        else:
            # No alerting exists; the owner turns CARE_NOTE_PUBLIC_ENABLED off in Render (ADR-0059).
            logger.error(json.dumps({"event": "care_note_public_stop_unconfirmed", "stop_reason": problem, **record}))
        raise HTTPException(status_code=503, detail=f"AI Garden Note stopped in the demo after an unexpected usage reading. {MANUAL_ENTRY}")

    try:
        extraction = parse_care_note_response(response)
    except CareNoteProviderError as error:
        raise reject(503, str(error), "unusable_output") from error
    log_request(**record, outcome="draft", kind=extraction.kind)
    return draft_from_extraction(garden, payload.note, extraction, payload.today, allow_all_gardens=False)
