"""Add the optional details for five care types (ADR-0085).

Records and tasks gain the planting, pruning, and pest-treatment details; tasks also
gain the fertilizer details records already had. The care type column is a plain
string, so the three new types need no schema change.

Downgrading drops the new columns and their values. Records of the new types stay,
but the previous app version does not accept them.

Revision ID: 20261119_10
Revises: 20261004_09
Create Date: 2026-11-19
"""

from alembic import op
import sqlalchemy as sa


revision = "20261119_10"
down_revision = "20261004_09"
branch_labels = None
depends_on = None

EVENT_TABLES = ("care_events", "workspace_care_events")
TASK_TABLES = ("care_tasks", "workspace_care_tasks")


def fertilizer_columns() -> list[sa.Column]:
    return [
        sa.Column("fertilizer_product", sa.String(length=200), nullable=True),
        sa.Column("fertilizer_amount", sa.Float(), nullable=True),
        sa.Column("fertilizer_unit", sa.String(length=80), nullable=True),
    ]


def new_detail_columns() -> list[sa.Column]:
    return [
        sa.Column("plant_name", sa.String(length=200), nullable=True),
        sa.Column("plant_count", sa.Integer(), nullable=True),
        sa.Column("prune_detail", sa.String(length=200), nullable=True),
        sa.Column("pest_problem", sa.String(length=200), nullable=True),
        sa.Column("pest_treatment", sa.String(length=200), nullable=True),
    ]


def upgrade() -> None:
    for table in EVENT_TABLES:
        for column in new_detail_columns():
            op.add_column(table, column)
    for table in TASK_TABLES:
        for column in [*fertilizer_columns(), *new_detail_columns()]:
            op.add_column(table, column)


def downgrade() -> None:
    for table in TASK_TABLES:
        for column in reversed([*fertilizer_columns(), *new_detail_columns()]):
            op.drop_column(table, column.name)
    for table in EVENT_TABLES:
        for column in reversed(new_detail_columns()):
            op.drop_column(table, column.name)
