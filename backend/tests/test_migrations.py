from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text


def test_migrations_create_garden_operations_schema_and_plant_identity_fields(tmp_path):
    database_path = tmp_path / "garden.db"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{database_path}")

    command.upgrade(config, "head")

    inspector = inspect(create_engine(f"sqlite+pysqlite:///{database_path}"))
    assert {"workspaces", "gardens", "growing_areas", "plantings", "season_plans", "planned_plantings", "care_events", "care_tasks", "health_records", "knowledge_sources", "knowledge_chunks"} <= set(inspector.get_table_names())
    assert {"plant_type", "variety"} <= {column["name"] for column in inspector.get_columns("plantings")}
    assert "revision" in {column["name"] for column in inspector.get_columns("workspaces")}


def test_migrations_seed_the_public_agent_run_budget(tmp_path):
    database_path = tmp_path / "garden.db"
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", f"sqlite+pysqlite:///{database_path}")

    command.upgrade(config, "head")

    with create_engine(f"sqlite+pysqlite:///{database_path}").connect() as connection:
        rows = connection.execute(text("SELECT name, used_runs FROM agent_run_budgets")).all()
    assert rows == [("season-allocation-public", 0)]
