import pytest
from sqlalchemy import event, update
from sqlalchemy.orm import Session

from app import database
from app.database import Base, database_url, make_engine, normalize_database_url
from app.models import Workspace
from app.schemas import WorkspaceImport, WorkspaceSave
from app.service import import_workspace, load_workspace, update_workspace, workspace_response
from tests.conftest import is_postgres
from tests.test_api import workspace_payload


def test_database_url_accepts_standard_postgres_connection_strings(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:password@host:5432/database?sslmode=require")
    assert database_url() == "postgresql+psycopg://user:password@host:5432/database?sslmode=require"

    monkeypatch.setenv("DATABASE_URL", "postgres://user:password@host:5432/database")
    assert database_url() == "postgresql+psycopg://user:password@host:5432/database"


def test_normalize_database_url_supports_alembic_connection_urls():
    assert normalize_database_url("postgresql://user:password@host:5432/database") == (
        "postgresql+psycopg://user:password@host:5432/database"
    )


@pytest.fixture
def workspace_engine(tmp_path):
    if is_postgres():
        yield database.engine
        return
    engine = make_engine(f"sqlite+pysqlite:///{tmp_path / 'workspace.db'}")
    try:
        Base.metadata.create_all(engine)
        yield engine
    finally:
        engine.dispose()


def seed_workspace(engine):
    payload = workspace_payload()
    with Session(engine, expire_on_commit=False) as session:
        import_workspace(session, WorkspaceImport.model_validate(payload))
    return payload


def test_workspace_reader_cannot_see_a_partial_uncommitted_save(workspace_engine):
    payload = seed_workspace(workspace_engine)
    workspace_id = payload["workspaceId"]
    with Session(workspace_engine) as writer, Session(workspace_engine) as reader:
        writer.execute(update(Workspace).where(Workspace.id == workspace_id).values(revision=1))
        workspace = load_workspace(writer, workspace_id)
        # Mimic the interval between deleting the old rows and inserting replacements.
        workspace.gardens[0].plantings.clear()
        workspace.gardens[0].growing_areas.clear()
        writer.flush()
        assert workspace_response(load_workspace(reader, workspace_id)) == {**payload, "revision": 0}


def test_workspace_reader_reloads_when_a_save_commits_between_queries(workspace_engine):
    payload = seed_workspace(workspace_engine)
    workspace_id = payload["workspaceId"]
    payload["gardens"][0]["name"] = "Updated garden"
    saved_during_read = False
    with Session(workspace_engine) as reader:
        @event.listens_for(reader, "do_orm_execute")
        def save_between_queries(query):
            nonlocal saved_during_read
            if query.is_relationship_load and not saved_during_read:
                saved_during_read = True
                with Session(workspace_engine, expire_on_commit=False) as writer:
                    update_workspace(writer, WorkspaceSave.model_validate({**payload, "revision": 0}))

        assert workspace_response(load_workspace(reader, workspace_id)) == {**payload, "revision": 1}
        assert saved_during_read


def test_save_acknowledges_its_own_revision_when_another_save_follows(workspace_engine):
    payload = seed_workspace(workspace_engine)
    workspace_id = payload["workspaceId"]
    payload["gardens"][0]["name"] = "First save"
    first = WorkspaceSave.model_validate({**payload, "revision": 0})
    with Session(workspace_engine) as writer:
        @event.listens_for(writer, "after_commit", once=True)
        def save_again(_session):
            payload["gardens"][0]["name"] = "Second save"
            with Session(workspace_engine) as other_writer:
                update_workspace(other_writer, WorkspaceSave.model_validate({**payload, "revision": 1}))

        result = update_workspace(writer, first)
    assert result["revision"] == 1
    assert result["gardens"][0]["name"] == "First save"
    with Session(workspace_engine) as reader:
        assert workspace_response(load_workspace(reader, workspace_id)) == {**payload, "revision": 2}
