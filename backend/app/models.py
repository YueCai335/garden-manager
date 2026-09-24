import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON
from pgvector.sqlalchemy import Vector

from .database import Base


JsonValue = JSON().with_variant(JSONB, "postgresql")


def new_id() -> str:
    return str(uuid.uuid4())


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    schema_version: Mapped[int] = mapped_column(Integer)
    selected_garden_external_id: Mapped[str] = mapped_column(String(120))
    import_hash: Mapped[str] = mapped_column(String(64))
    # Bumped on every successful save; clients echo it back so a stale
    # snapshot cannot silently overwrite a newer one.
    revision: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    gardens: Mapped[list["Garden"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", order_by="Garden.position"
    )
    care_events: Mapped[list["WorkspaceCareEvent"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", order_by="WorkspaceCareEvent.position"
    )
    care_tasks: Mapped[list["WorkspaceCareTask"]] = relationship(
        back_populates="workspace", cascade="all, delete-orphan", order_by="WorkspaceCareTask.position"
    )


class Garden(Base):
    __tablename__ = "gardens"
    __table_args__ = (UniqueConstraint("workspace_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(200))
    plan_width_meters: Mapped[float] = mapped_column(Float)
    plan_depth_meters: Mapped[float] = mapped_column(Float)
    workspace: Mapped[Workspace] = relationship(back_populates="gardens")
    growing_areas: Mapped[list["GrowingArea"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="GrowingArea.position"
    )
    plantings: Mapped[list["Planting"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="Planting.position"
    )
    season_plans: Mapped[list["SeasonPlan"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="SeasonPlan.season_year"
    )
    care_events: Mapped[list["CareEvent"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="CareEvent.position"
    )
    care_tasks: Mapped[list["CareTask"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="CareTask.position"
    )
    health_records: Mapped[list["HealthRecord"]] = relationship(
        back_populates="garden", cascade="all, delete-orphan", order_by="HealthRecord.position"
    )


class GrowingArea(Base):
    __tablename__ = "growing_areas"
    __table_args__ = (UniqueConstraint("garden_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(32))
    plan_x: Mapped[float] = mapped_column(Float)
    plan_y: Mapped[float] = mapped_column(Float)
    plan_rotation_degrees: Mapped[float] = mapped_column(Float)
    layout: Mapped[dict | None] = mapped_column(JsonValue, nullable=True)
    garden: Mapped[Garden] = relationship(back_populates="growing_areas")
    plantings: Mapped[list["Planting"]] = relationship(back_populates="growing_area")


class Planting(Base):
    __tablename__ = "plantings"
    __table_args__ = (UniqueConstraint("garden_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    growing_area_id: Mapped[str] = mapped_column(ForeignKey("growing_areas.id", ondelete="RESTRICT"))
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    common_name: Mapped[str] = mapped_column(String(200))
    plant_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    variety: Mapped[str | None] = mapped_column(String(200), nullable=True)
    crop_family: Mapped[str] = mapped_column(String(32))
    quantity: Mapped[int] = mapped_column(Integer)
    planting_date: Mapped[date] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean)
    garden: Mapped[Garden] = relationship(back_populates="plantings")
    growing_area: Mapped[GrowingArea] = relationship(back_populates="plantings")


class SeasonPlan(Base):
    __tablename__ = "season_plans"
    __table_args__ = (
        UniqueConstraint("garden_id", "external_id"),
        UniqueConstraint("garden_id", "season_year"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    season_year: Mapped[int] = mapped_column(Integer)
    garden: Mapped[Garden] = relationship(back_populates="season_plans")
    plantings: Mapped[list["PlannedPlanting"]] = relationship(
        back_populates="season_plan", cascade="all, delete-orphan", order_by="PlannedPlanting.position"
    )


class PlannedPlanting(Base):
    __tablename__ = "planned_plantings"
    __table_args__ = (UniqueConstraint("season_plan_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    season_plan_id: Mapped[str] = mapped_column(ForeignKey("season_plans.id", ondelete="CASCADE"), index=True)
    growing_area_id: Mapped[str] = mapped_column(ForeignKey("growing_areas.id", ondelete="RESTRICT"))
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    common_name: Mapped[str] = mapped_column(String(200))
    plant_type: Mapped[str | None] = mapped_column(String(200), nullable=True)
    variety: Mapped[str | None] = mapped_column(String(200), nullable=True)
    crop_family: Mapped[str] = mapped_column(String(32))
    season_plan: Mapped[SeasonPlan] = relationship(back_populates="plantings")
    growing_area: Mapped[GrowingArea] = relationship()


class CareTargetFields:
    target_scope: Mapped[str] = mapped_column(String(32))
    growing_area_external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    growing_area_name_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_area_deleted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    planting_external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    planting_name_snapshot: Mapped[str | None] = mapped_column(String(240), nullable=True)
    target_planting_deleted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)


class CareEvent(CareTargetFields, Base):
    __tablename__ = "care_events"
    __table_args__ = (UniqueConstraint("garden_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(32))
    occurred_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text)
    fertilizer_product: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fertilizer_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    fertilizer_unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    garden: Mapped[Garden] = relationship(back_populates="care_events")


class CareTask(CareTargetFields, Base):
    __tablename__ = "care_tasks"
    __table_args__ = (UniqueConstraint("garden_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    task_type: Mapped[str] = mapped_column(String(32))
    due_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text)
    repeat_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    garden: Mapped[Garden] = relationship(back_populates="care_tasks")


class HealthRecord(CareTargetFields, Base):
    __tablename__ = "health_records"
    __table_args__ = (UniqueConstraint("garden_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    garden_id: Mapped[str] = mapped_column(ForeignKey("gardens.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    observed_on: Mapped[date] = mapped_column(Date)
    symptoms: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))
    photo_paths: Mapped[list[str]] = mapped_column(JsonValue)
    assessment: Mapped[dict | None] = mapped_column(JsonValue, nullable=True)
    garden: Mapped[Garden] = relationship(back_populates="health_records")


class KnowledgeSource(Base):
    __tablename__ = "knowledge_sources"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_key: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    publisher: Mapped[str] = mapped_column(String(200))
    source_url: Mapped[str] = mapped_column(String(2000))
    reviewed_on: Mapped[date] = mapped_column(Date)
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="KnowledgeChunk.position"
    )


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (UniqueConstraint("source_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(ForeignKey("knowledge_sources.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(JsonValue)
    embedding_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(768), nullable=True)
    source: Mapped[KnowledgeSource] = relationship(back_populates="chunks")


class WorkspaceCareEvent(Base):
    __tablename__ = "workspace_care_events"
    __table_args__ = (UniqueConstraint("workspace_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(32))
    occurred_on: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text)
    fertilizer_product: Mapped[str | None] = mapped_column(String(200), nullable=True)
    fertilizer_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    fertilizer_unit: Mapped[str | None] = mapped_column(String(80), nullable=True)
    workspace: Mapped[Workspace] = relationship(back_populates="care_events")


class WorkspaceCareTask(Base):
    __tablename__ = "workspace_care_tasks"
    __table_args__ = (UniqueConstraint("workspace_id", "external_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    task_type: Mapped[str] = mapped_column(String(32))
    due_date: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(Text)
    repeat_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    workspace: Mapped[Workspace] = relationship(back_populates="care_tasks")


class AgentRunBudget(Base):
    """Cumulative public run counter for one AI agent (ADR-0056). One row per budget."""

    __tablename__ = "agent_run_budgets"

    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    used_runs: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0", default=0)
