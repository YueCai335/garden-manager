"""Cumulative public run limit for the allocation agent (ADR-0056).

All public runs share one row. A run is reserved with one conditional UPDATE
committed in its own transaction before the first model request, so a later
failure cannot roll the reservation back. Anything uncertain (missing row,
database error, bad configuration) means no run.
"""

import logging
import os

from sqlalchemy import update
from sqlalchemy.exc import SQLAlchemyError

from .. import database
from ..models import AgentRunBudget


PUBLIC_BUDGET_NAME = "season-allocation-public"

logger = logging.getLogger(__name__)


def public_run_limit() -> int:
    """AGENT_PUBLIC_RUN_LIMIT; missing, non-numeric, or negative values mean 0."""
    raw = os.getenv("AGENT_PUBLIC_RUN_LIMIT", "0")
    try:
        limit = int(raw)
    except ValueError:
        logger.error("AGENT_PUBLIC_RUN_LIMIT=%r is not an integer; public runs are closed.", raw)
        return 0
    if limit < 0:
        logger.error("AGENT_PUBLIC_RUN_LIMIT=%r is negative; public runs are closed.", raw)
        return 0
    return limit


def reserve_public_run(limit: int, session_factory=None) -> bool:
    """Count one public run if the shared counter is below limit. Never refunds."""
    if limit <= 0:
        return False
    try:
        with (session_factory or database.SessionLocal)() as session:
            reserved = session.execute(
                update(AgentRunBudget)
                .where(AgentRunBudget.name == PUBLIC_BUDGET_NAME, AgentRunBudget.used_runs < limit)
                .values(used_runs=AgentRunBudget.used_runs + 1)
            ).rowcount
            session.commit()
    except SQLAlchemyError:
        logger.exception("Could not reserve a public season-allocation run; treating the budget as used up.")
        return False
    if reserved != 1:
        logger.info("Public season-allocation limit reached, or the budget row is missing.")
    return reserved == 1
