"""Optimistic-locking behaviour that only a real multi-connection database can show.

SQLite serialises writers with a whole-database lock, so it cannot demonstrate
two transactions racing on one row. These tests run only when
TEST_DATABASE_URL points at PostgreSQL.
"""

import multiprocessing
import threading
from datetime import date, timedelta

from sqlalchemy import select, update

from app import database
from app.agent.budget import PUBLIC_BUDGET_NAME, reserve_public_run
from app.models import AgentRunBudget, Workspace
from app.service import import_workspace
from app.schemas import WorkspaceImport
from app.care_note_public import CUMULATIVE_BUDGET_NAME, DAILY_RUN_LIMIT, HARD_RUN_CAP, daily_budget_name
from tests.care_note_quota_worker import exhaust_in_process, reserve_in_process
from tests.conftest import TEST_DATABASE_URL, requires_postgres
from tests.test_api import workspace_payload


def seed_workspace() -> str:
    with database.SessionLocal() as session:
        import_workspace(session, WorkspaceImport.model_validate(workspace_payload()))
    return "local-workspace-1"


def claim_revision(session, workspace_id: str, expected: int) -> int:
    """The same conditional UPDATE the save endpoint uses; returns rows matched."""
    return session.execute(
        update(Workspace)
        .where(Workspace.id == workspace_id, Workspace.revision == expected)
        .values(revision=Workspace.revision + 1)
    ).rowcount


@requires_postgres
def test_two_connections_racing_on_the_same_revision_only_one_wins():
    workspace_id = seed_workspace()
    second_result: dict[str, int] = {}
    first_has_claimed = threading.Event()

    def second_client():
        with database.SessionLocal() as session:
            # Blocks on the row lock until the first transaction commits, then
            # re-evaluates WHERE revision = 0 against the committed value (1).
            second_result["rows"] = claim_revision(session, workspace_id, expected=0)
            session.commit()

    with database.SessionLocal() as first:
        assert claim_revision(first, workspace_id, expected=0) == 1
        first_has_claimed.set()
        worker = threading.Thread(target=second_client)
        worker.start()
        worker.join(timeout=1.0)
        assert worker.is_alive(), "second client should be blocked behind the first transaction"
        first.commit()
        worker.join(timeout=5.0)

    assert not worker.is_alive()
    assert second_result["rows"] == 0

    with database.SessionLocal() as session:
        assert session.scalar(select(Workspace.revision).where(Workspace.id == workspace_id)) == 1


@requires_postgres
def test_save_endpoint_conflict_round_trips_on_postgres(client):
    payload = workspace_payload()
    imported = client.put("/workspaces/local-workspace-1/import", json=payload).json()
    assert imported["revision"] == 0

    first = {**imported, "revision": 0}
    first["gardens"][0]["name"] = "Saved first"
    assert client.put("/workspaces/local-workspace-1", json=first).status_code == 200

    stale = {**imported, "revision": 0}
    response = client.put("/workspaces/local-workspace-1", json=stale)
    assert response.status_code == 409
    assert response.json()["detail"]["currentRevision"] == 1
    assert client.get("/workspaces/local-workspace-1").json()["gardens"][0]["name"] == "Saved first"


@requires_postgres
def test_two_public_runs_racing_for_the_last_run_only_one_wins():
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=PUBLIC_BUDGET_NAME, used_runs=4))
        session.commit()
    start = threading.Barrier(2)
    results: list[bool] = []

    def reserve():
        start.wait()
        results.append(reserve_public_run(limit=5))

    workers = [threading.Thread(target=reserve) for _ in range(2)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=5.0)

    assert sorted(results) == [False, True]
    with database.SessionLocal() as session:
        assert session.scalar(select(AgentRunBudget.used_runs).where(AgentRunBudget.name == PUBLIC_BUDGET_NAME)) == 5


# --- Public AI Garden Note quota (ADR-0059): separate processes, separate connections ---


def run_reservations(processes: int, limit: int, quota_date: date) -> list[str]:
    context = multiprocessing.get_context("spawn")
    start = context.Barrier(processes)
    results = context.Queue()
    workers = [
        context.Process(target=reserve_in_process, args=(TEST_DATABASE_URL, limit, quota_date.isoformat(), start, results))
        for _ in range(processes)
    ]
    for worker in workers:
        worker.start()
    outcomes = [results.get(timeout=60) for _ in workers]
    for worker in workers:
        worker.join(timeout=30)
        assert worker.exitcode == 0
    return sorted(outcomes)


def budget_rows() -> dict[str, int]:
    with database.SessionLocal() as session:
        return {row.name: row.used_runs for row in session.scalars(select(AgentRunBudget))}


CARE_NOTE_DAY = date(2026, 10, 4)


@requires_postgres
def test_processes_racing_for_the_last_cumulative_request_only_one_wins():
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=CUMULATIVE_BUDGET_NAME, used_runs=HARD_RUN_CAP - 1))
        session.commit()

    outcomes = run_reservations(4, HARD_RUN_CAP, CARE_NOTE_DAY)

    assert outcomes == ["reserved", "used_up", "used_up", "used_up"]
    assert budget_rows()[CUMULATIVE_BUDGET_NAME] == HARD_RUN_CAP


@requires_postgres
def test_processes_racing_for_the_last_daily_request_only_one_wins_and_the_rest_roll_back():
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=CUMULATIVE_BUDGET_NAME, used_runs=0))
        session.add(AgentRunBudget(name=daily_budget_name(CARE_NOTE_DAY), used_runs=DAILY_RUN_LIMIT - 1))
        session.commit()

    outcomes = run_reservations(4, HARD_RUN_CAP, CARE_NOTE_DAY)

    assert outcomes == ["daily_limit", "daily_limit", "daily_limit", "reserved"]
    rows = budget_rows()
    # The three losers' cumulative increments rolled back with their daily failure.
    assert rows[CUMULATIVE_BUDGET_NAME] == 1
    assert rows[daily_budget_name(CARE_NOTE_DAY)] == DAILY_RUN_LIMIT


@requires_postgres
def test_processes_making_the_first_request_of_a_day_share_one_daily_row():
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=CUMULATIVE_BUDGET_NAME, used_runs=0))
        session.commit()

    outcomes = run_reservations(3, HARD_RUN_CAP, CARE_NOTE_DAY)

    assert outcomes == ["reserved"] * 3
    assert budget_rows() == {CUMULATIVE_BUDGET_NAME: 3, daily_budget_name(CARE_NOTE_DAY): 3}


@requires_postgres
def test_a_stop_written_by_one_process_blocks_reservations_in_a_new_process():
    with database.SessionLocal() as session:
        session.add(AgentRunBudget(name=CUMULATIVE_BUDGET_NAME, used_runs=5))
        session.commit()
    context = multiprocessing.get_context("spawn")
    results = context.Queue()
    stopper = context.Process(target=exhaust_in_process, args=(TEST_DATABASE_URL, results))
    stopper.start()
    assert results.get(timeout=60) is True
    stopper.join(timeout=30)

    # A fresh process, as after a restart, on a later day, with the limit at its maximum.
    assert run_reservations(1, HARD_RUN_CAP, CARE_NOTE_DAY + timedelta(days=1)) == ["used_up"]
    assert budget_rows()[CUMULATIVE_BUDGET_NAME] == HARD_RUN_CAP
