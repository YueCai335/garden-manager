import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import database
from app.database import Base
from app.main import app

# Default: in-memory SQLite for fast unit runs. Set TEST_DATABASE_URL to a
# PostgreSQL URL to run the same suite against the database used in
# production (CI does this in the backend-postgres job).
TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL", "sqlite+pysqlite://")


def is_postgres() -> bool:
    return TEST_DATABASE_URL.startswith("postgresql")


@pytest.fixture(autouse=True)
def test_database():
    database.configure_database(TEST_DATABASE_URL)
    if is_postgres():
        with database.engine.begin() as connection:
            connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(database.engine)
    yield
    Base.metadata.drop_all(database.engine)


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


requires_postgres = pytest.mark.skipif(
    not is_postgres(), reason="needs TEST_DATABASE_URL pointing at PostgreSQL"
)
