"""Add a workspace revision counter for optimistic locking.

Revision ID: 20260911_07
Revises: 20260902_06
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa


revision = "20260911_07"
down_revision = "20260902_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workspaces",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("workspaces", "revision")
