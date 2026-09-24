"""Optimistic-locking behaviour that only a real multi-connection database can show.

SQLite serialises writers with a whole-database lock, so it cannot demonstrate
two transactions racing on one row. These tests run only when
TEST_DATABASE_URL points at PostgreSQL.
"""

import threading

from sqlalchemy import select, update

from app import database
from app.agent.budget import PUBLIC_BUDGET_NAME, reserve_public_run
from app.models import AgentRunBudget, Workspace
from app.service import import_workspace
from app.schemas import WorkspaceImport
from tests.conftest import requires_postgres
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
