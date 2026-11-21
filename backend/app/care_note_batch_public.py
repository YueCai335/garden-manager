"""AI note batches in the public demo: the showcase gardens, their own paid quota, and the usage stop (ADR-0086).

Every public batch passes the single-note path's checks in the same order
(ADR-0059), and only the last step spends money:

1. The feature switch, the run limit, the provider, the approved model, and
   the key are all configured.
2. The browser's date is plausible.
3. The client IP is under its short-term limit.
4. The exact request parameters fit the byte limit.
5. One transaction reserves a cumulative and a daily request and commits.
6. One OpenAI request runs, with no database transaction open.

The model reads a fixed snapshot of the three showcase gardens (ADR-0077),
never the visitor's stored workspace. A reservation is never refunded, and
usage outside the cost assumptions raises the cumulative counter to the hard
cap, which stops every later request in every process.
"""

import json
import logging
import os
import time
from datetime import date
from functools import lru_cache
from importlib import resources

from fastapi import HTTPException

from . import care_note_public
from .ai import CareNoteProviderError, care_note_output_text, care_note_request_bytes
from .care_note_batch import MAX_OUTPUT_TOKENS, OpenAICareNoteBatchExtractor, drafts_from_batch, instruction_pieces, parse_batch
from .care_note_public import (
    MANUAL_ENTRY,
    PublicBudget,
    RollingRateLimiter,
    log_request,
    openai_note_settings_ready,
    reserve_public_request,
    run_limit_from_env,
    usage_problem,
)
from .schemas import CareNoteDraftRequest
from .service import CareNoteArea, CareNoteGarden, CareNotePlanting, check_client_today


logger = logging.getLogger(__name__)

# Fixed in code: no configuration can exceed these, and the counter never resets (ADR-0086).
BATCH_BUDGET = PublicBudget(
    name="care-note-batch-public",
    daily_prefix="care-note-batch-public-day-",
    hard_cap=300,
    daily_limit=20,
)
# The near-maximum note on the showcase gardens measures 8,438 bytes.
MAX_REQUEST_BYTES = 10_000
LOG_EVENT = "care_note_batch_public_request"
UNAVAILABLE = f"AI notes are not available in the demo right now. {MANUAL_ENTRY}"

public_batch_rate_limiter = RollingRateLimiter()


def public_batch_run_limit() -> int | None:
    return run_limit_from_env("CARE_NOTE_BATCH_PUBLIC_RUN_LIMIT", BATCH_BUDGET.hard_cap)


def public_batch_available() -> bool:
    """Whether the configuration allows public batches. Quotas are checked per request."""
    return (
        os.getenv("CARE_NOTE_BATCH_PUBLIC_ENABLED", "").lower() in {"1", "true", "yes"}
        and bool(public_batch_run_limit())
        and openai_note_settings_ready()
    )


@lru_cache(maxsize=1)
def showcase_gardens() -> dict[str, CareNoteGarden]:
    """The three showcase gardens; src/lib/showcaseGardens.test.ts keeps this copy in step with the browser's."""
    data = json.loads(resources.files("app").joinpath("showcase_gardens.json").read_text(encoding="utf-8"))
    return {
        garden["id"]: CareNoteGarden(
            garden["name"],
            tuple(CareNoteArea(area["id"], area["name"]) for area in garden["areas"]),
            tuple(CareNotePlanting(plant["id"], plant["name"], plant["growingAreaId"]) for plant in garden["plants"]),
        )
        for garden in data["gardens"]
    }


def public_care_note_batch(
    payload: CareNoteDraftRequest,
    extractor: OpenAICareNoteBatchExtractor | None,
    *,
    server_today: date,
    client_ip: str,
    request_id: str,
    session_factory=None,
    rate_limiter: RollingRateLimiter | None = None,
) -> dict:
    limit = public_batch_run_limit()
    record: dict = {"request_id": request_id, "run_limit": limit}

    def reject(status_code: int, detail: str, outcome: str) -> HTTPException:
        log_request(LOG_EVENT, **record, outcome=outcome)
        return HTTPException(status_code=status_code, detail=detail)

    if not public_batch_available() or extractor is None or limit is None:
        raise reject(503, UNAVAILABLE, "closed")
    try:
        check_client_today(payload.today, server_today)
    except HTTPException as error:
        raise reject(error.status_code, error.detail, "implausible_date") from error
    if not (rate_limiter or public_batch_rate_limiter).allow(client_ip):
        raise reject(429, "Too many notes from this connection. Wait a minute and try again.", "rate_limited")

    gardens = showcase_gardens()
    params = extractor.request_params(payload.note, [garden.model_context() for garden in gardens.values()], payload.today)
    request_bytes = care_note_request_bytes(params)
    record.update(model=params["model"], bytes=request_bytes)
    if request_bytes > MAX_REQUEST_BYTES:
        raise reject(413, "This note is too long for the demo. Shorten it and try again.", "request_too_large")

    reservation = reserve_public_request(limit, server_today, session_factory, budget=BATCH_BUDGET)
    if reservation == "used_up":
        raise reject(503, f"The demo's AI notes are used up. {MANUAL_ENTRY}", "used_up")
    if reservation == "daily_limit":
        raise reject(429, "Today's AI notes for the demo are used up. Try again tomorrow, or fill in the records manually.", "daily_limit")
    if reservation != "reserved":
        raise reject(503, UNAVAILABLE, "quota_unavailable")

    started = time.monotonic()
    try:
        response = extractor.sender.send(params)
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
    problem = usage_problem(response, request_bytes, MAX_OUTPUT_TOKENS)
    if problem is not None:
        # Looked up on the module, so a test can make the stop write fail.
        if care_note_public.exhaust_public_allocation(session_factory, budget=BATCH_BUDGET):
            log_request(LOG_EVENT, **record, outcome="usage_stop", stop_reason=problem)
        else:
            # No alerting exists; the owner turns CARE_NOTE_BATCH_PUBLIC_ENABLED off in Render.
            logger.error(json.dumps({"event": "care_note_batch_public_stop_unconfirmed", "stop_reason": problem, **record}))
        raise HTTPException(status_code=503, detail=f"AI notes stopped in the demo after an unexpected usage reading. {MANUAL_ENTRY}")

    record["instruction_guard"] = bool(instruction_pieces(payload.note))
    try:
        result = drafts_from_batch(gardens, payload.note, parse_batch(care_note_output_text(response)), payload.today)
    except (CareNoteProviderError, ValueError) as error:
        raise reject(503, "AI Garden Note could not create a usable batch. Try again or enter records manually.", "unusable_output") from error
    except HTTPException as error:
        # More than twelve jobs: the visitor splits the note.
        raise reject(error.status_code, error.detail, "too_many_jobs") from error
    log_request(
        LOG_EVENT,
        **record,
        outcome="draft",
        drafts=len(result["drafts"]),
        notices=len(result["notices"]),
        drafts_needing_review=sum(bool(draft["reviewNotes"]) for draft in result["drafts"]),
    )
    return result
