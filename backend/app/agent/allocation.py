"""Deterministic rules for the next-season allocation agent (ADR-0056).

Nothing in this module calls a model or touches the database. The agent's
tools and the final-answer check both go through these functions, so the
rules a model is held to are the same rules the server applies.
"""

from dataclasses import dataclass
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..models import Garden
from ..rotation import ROTATION_GROWING_AREA_KINDS, RotationPlanting, evaluate_rotation


CropKey = Literal["tomato", "bean", "lettuce", "cucumber", "carrot"]

# Crop key -> (label, rotation group). Rotation groups are the project's
# existing cropFamily values; "root" and "leafy" are gardening groups, not
# botanical families.
CROPS: dict[str, tuple[str, str]] = {
    "tomato": ("Tomato", "nightshade"),
    "bean": ("Bean", "legume"),
    "lettuce": ("Lettuce", "leafy"),
    "cucumber": ("Cucumber", "cucurbit"),
    "carrot": ("Carrot", "root"),
}
MAX_AREAS = 3
MAX_PREFERENCE_CHARACTERS = 200
HISTORY_YEARS = 3


# --- Garden snapshot: plain data the agent reads instead of a DB session ---


@dataclass(frozen=True)
class AreaSnapshot:
    id: str
    name: str
    kind: str


@dataclass(frozen=True)
class PlantingSnapshot:
    id: str
    common_name: str
    crop_family: str
    planting_date: date
    growing_area_id: str


@dataclass(frozen=True)
class GardenSnapshot:
    garden_id: str
    areas: tuple[AreaSnapshot, ...]
    plantings: tuple[PlantingSnapshot, ...]


def garden_snapshot(garden: Garden) -> GardenSnapshot:
    area_ids = {area.id: area.external_id for area in garden.growing_areas}
    return GardenSnapshot(
        garden_id=garden.external_id,
        areas=tuple(AreaSnapshot(area.external_id, area.name, area.kind) for area in garden.growing_areas),
        plantings=tuple(
            PlantingSnapshot(
                id=planting.external_id,
                common_name=planting.common_name,
                crop_family=planting.crop_family,
                planting_date=planting.planting_date,
                growing_area_id=area_ids[planting.growing_area_id],
            )
            for planting in garden.plantings
        ),
    )


# --- Request, scope, and result shapes ---


class AgentModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AllocationRequest(AgentModel):
    """What the gardener submits. Kept loose so bad input becomes needs_input, not a 422."""

    crops: list[str] = Field(default_factory=list)
    preference: str = ""
    growing_area_ids: list[str] | None = None


class ScopeArea(AgentModel):
    id: str
    name: str
    kind: str


class AllocationScope(AgentModel):
    """The complete, validated input a run was generated from."""

    season_year: int
    areas: list[ScopeArea]
    crops: list[CropKey]
    preference: str


class Assignment(AgentModel):
    growing_area_id: str
    crop: CropKey


class RotationSummaryRow(AgentModel):
    growing_area_id: str
    year: int
    rotation_group: str


class AssignmentCheck(AgentModel):
    growing_area_id: str
    crop: CropKey
    rotation_group: str
    warning: bool
    # Years (at most three) in which the area already grew this rotation
    # group. Years rather than planting records keep the size bounded.
    repeated_years: list[int]
    rotation_friendly_groups: list[str]


# --- Rules ---


def build_scope(
    snapshot: GardenSnapshot, request: AllocationRequest, today: date
) -> tuple[AllocationScope | None, list[str]]:
    """Return a scope, or the list of inputs the gardener must fix. Never calls a model."""
    missing: list[str] = []

    if not request.crops:
        missing.append("Select at least one crop.")
    unknown = [crop for crop in request.crops if crop not in CROPS]
    if unknown:
        missing.append(f"Unsupported crops: {', '.join(unknown)}. Choose from {', '.join(CROPS)}.")
    if len(set(request.crops)) != len(request.crops):
        missing.append("Select each crop only once.")
    if len(request.preference) > MAX_PREFERENCE_CHARACTERS:
        missing.append(f"Keep the preference to {MAX_PREFERENCE_CHARACTERS} characters or fewer.")

    areas_by_id = {area.id: area for area in snapshot.areas}
    eligible = [area for area in snapshot.areas if area.kind in ROTATION_GROWING_AREA_KINDS]
    selected: list[AreaSnapshot] = []
    if request.growing_area_ids is None:
        if not eligible:
            missing.append("This garden has no raised bed, in-ground area, or container group to plan.")
        elif len(eligible) > MAX_AREAS:
            missing.append(f"Choose up to {MAX_AREAS} growing areas for this plan.")
        else:
            selected = eligible
    else:
        ids = request.growing_area_ids
        if not ids:
            missing.append("Choose at least one growing area.")
        if len(ids) > MAX_AREAS:
            missing.append(f"Choose up to {MAX_AREAS} growing areas for this plan.")
        if len(set(ids)) != len(ids):
            missing.append("Choose each growing area only once.")
        for area_id in dict.fromkeys(ids):
            area = areas_by_id.get(area_id)
            if area is None:
                missing.append(f"Growing area {area_id} is not in this garden.")
            elif area.kind not in ROTATION_GROWING_AREA_KINDS:
                missing.append(f"{area.name} is a {area.kind}; rotation planning covers beds, in-ground areas, and containers.")
            else:
                selected.append(area)

    if missing:
        return None, missing
    return (
        AllocationScope(
            season_year=today.year + 1,
            areas=[ScopeArea(id=area.id, name=area.name, kind=area.kind) for area in selected],
            crops=list(request.crops),
            preference=request.preference,
        ),
        [],
    )


def rotation_summary(snapshot: GardenSnapshot, scope: AllocationScope) -> list[RotationSummaryRow]:
    """One row per selected area, year, and rotation group from the previous three years."""
    area_ids = {area.id for area in scope.areas}
    first_year = scope.season_year - HISTORY_YEARS
    rows = {
        (planting.growing_area_id, planting.planting_date.year, planting.crop_family)
        for planting in snapshot.plantings
        if planting.growing_area_id in area_ids and first_year <= planting.planting_date.year < scope.season_year
    }
    return [
        RotationSummaryRow(growing_area_id=area_id, year=year, rotation_group=group)
        for area_id, year, group in sorted(rows, key=lambda row: (row[0], -row[1], row[2]))
    ]


def allocation_errors(scope: AllocationScope, assignments: list[Assignment], *, complete: bool) -> list[str]:
    """The one rule set for tool arguments (complete=False) and final answers (complete=True)."""
    errors: list[str] = []
    area_ids = {area.id for area in scope.areas}
    for assignment in assignments:
        if assignment.growing_area_id not in area_ids:
            errors.append(f"Growing area {assignment.growing_area_id} is not one of the selected areas: {', '.join(sorted(area_ids))}.")
        if assignment.crop not in scope.crops:
            errors.append(f"Crop {assignment.crop} was not selected. Selected crops: {', '.join(scope.crops)}.")
    assigned = [assignment.crop for assignment in assignments]
    for crop in dict.fromkeys(assigned):
        if assigned.count(crop) > 1:
            errors.append(
                f"Crop {crop} appears more than once. Remove its duplicate assignments and keep exactly one "
                "area for this crop. Areas may remain empty."
            )
    if complete:
        for crop in scope.crops:
            if crop not in assigned:
                errors.append(f"Crop {crop} is not assigned; assign every selected crop.")
    return errors


def check_assignments(
    snapshot: GardenSnapshot, scope: AllocationScope, assignments: list[Assignment]
) -> list[AssignmentCheck]:
    """Run the existing rotation rule for each area-crop pair. Call only after allocation_errors passes."""
    kinds = {area.id: area.kind for area in scope.areas}
    checks = []
    for assignment in assignments:
        group = CROPS[assignment.crop][1]
        evaluation = evaluate_rotation(
            growing_area_kind=kinds[assignment.growing_area_id],
            crop_family=group,
            planting_date=date(scope.season_year, 1, 1),
            plantings=[
                RotationPlanting(
                    id=planting.id,
                    common_name=planting.common_name,
                    crop_family=planting.crop_family,
                    planting_date=planting.planting_date,
                )
                for planting in snapshot.plantings
                if planting.growing_area_id == assignment.growing_area_id
            ],
        )
        checks.append(
            AssignmentCheck(
                growing_area_id=assignment.growing_area_id,
                crop=assignment.crop,
                rotation_group=group,
                warning=evaluation["warning"],
                repeated_years=sorted(
                    {planting.planting_date.year for planting in evaluation["warning_plantings"]}, reverse=True
                ),
                rotation_friendly_groups=evaluation["rotation_friendly_crop_families"],
            )
        )
    return checks
