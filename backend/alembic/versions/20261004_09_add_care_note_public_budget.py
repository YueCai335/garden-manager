"""Add the cumulative public request counter for AI Garden Note (ADR-0059).

Revision ID: 20261004_09
Revises: 20260924_08
Create Date: 2026-10-04
"""

from alembic import op


revision = "20261004_09"
down_revision = "20260924_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert only when absent, so running this again never resets used requests.
    op.execute(
        "INSERT INTO agent_run_budgets (name, used_runs) "
        "SELECT 'care-note-public', 0 "
        "WHERE NOT EXISTS (SELECT 1 FROM agent_run_budgets WHERE name = 'care-note-public')"
    )


def downgrade() -> None:
    # Keep the row: deleting it would let a later upgrade restore spent requests.
    pass
