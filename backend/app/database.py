import os

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool


class Base(DeclarativeBase):
    pass


def normalize_database_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    return url


def database_url() -> str:
    return normalize_database_url(
        os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg://garden@localhost:5433/garden_planner",
        )
    )


def make_engine(url: str):
    options: dict = {"pool_pre_ping": True}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        sqlite_url = make_url(url)
        if sqlite_url.database in {None, "", ":memory:"} or sqlite_url.query.get("mode") == "memory":
            options["poolclass"] = StaticPool
    return create_engine(url, **options)


engine = make_engine(database_url())
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def configure_database(url: str) -> None:
    global engine, SessionLocal
    engine.dispose()
    engine = make_engine(url)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_session():
    with SessionLocal() as session:
        yield session
