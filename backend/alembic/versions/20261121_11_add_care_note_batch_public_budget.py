"""Add the cumulative public request counter for AI note batches (ADR-0086).

Revision ID: 20261121_11
Revises: 20261119_10
Create Date: 2026-11-21
"""

from alembic import op


revision = "20261121_11"
down_revision = "20261119_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert only when absent, so running this again never resets used requests.
    op.execute(
        "INSERT INTO agent_run_budgets (name, used_runs) "
        "SELECT 'care-note-batch-public', 0 "
        "WHERE NOT EXISTS (SELECT 1 FROM agent_run_budgets WHERE name = 'care-note-batch-public')"
    )


def downgrade() -> None:
    # Keep the row: deleting it would let a later upgrade restore spent requests.
    pass
