"""Runs in a separate process for the PostgreSQL quota tests; imports only what a worker needs."""

from datetime import date


def reserve_in_process(database_url: str, limit: int, quota_date: str, start, results) -> None:
    from app import database
    from app.care_note_public import reserve_public_request

    database.configure_database(database_url)
    start.wait(timeout=30)
    results.put(reserve_public_request(limit, date.fromisoformat(quota_date)))


def exhaust_in_process(database_url: str, results) -> None:
    from app import database
    from app.care_note_public import exhaust_public_allocation

    database.configure_database(database_url)
    results.put(exhaust_public_allocation())
