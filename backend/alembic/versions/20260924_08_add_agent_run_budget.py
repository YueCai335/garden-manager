"""Add the cumulative public run counter for the season-allocation agent.

Revision ID: 20260924_08
Revises: 20260911_07
Create Date: 2026-09-24
"""

from alembic import op
import sqlalchemy as sa


revision = "20260924_08"
down_revision = "20260911_07"
branch_labels = None
depends_on = None


def upgrade() -> None:
    budgets = op.create_table(
        "agent_run_budgets",
        sa.Column("name", sa.String(length=64), primary_key=True),
        sa.Column("used_runs", sa.Integer(), nullable=False, server_default="0"),
    )
    op.bulk_insert(budgets, [{"name": "season-allocation-public", "used_runs": 0}])


def downgrade() -> None:
    op.drop_table("agent_run_budgets")
