from datetime import date as Date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


GardenAreaKind = Literal["raised-bed", "in-ground", "container", "greenhouse"]
CropFamily = Literal["nightshade", "brassica", "cucurbit", "legume", "allium", "root", "leafy", "other"]
CareType = Literal["watering", "fertilizing"]
TargetScope = Literal["all-gardens", "garden", "planting-area", "plant-group"]
HealthSeverity = Literal["low", "medium", "high"]


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class LayoutPoint(ApiModel):
    x: float
    y: float


class PlanPlacement(ApiModel):
    x: float
    y: float
    rotation_degrees: float = Field(serialization_alias="rotationDegrees", validation_alias="rotationDegrees")


class PlantAllocation(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    label: str = Field(min_length=1, max_length=200)
    plant_type: str | None = Field(default=None, min_length=1, max_length=200, serialization_alias="plantType", validation_alias="plantType")
    variety: str | None = Field(default=None, max_length=200)
    planting_record_id: str | None = Field(default=None, min_length=1, max_length=120, serialization_alias="plantingRecordId", validation_alias="plantingRecordId")
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    x: float
    y: float
    diameter_meters: float = Field(gt=0, serialization_alias="diameterMeters", validation_alias="diameterMeters")


class GrowingAreaLayout(ApiModel):
    width_meters: float = Field(gt=0, serialization_alias="widthMeters", validation_alias="widthMeters")
    depth_meters: float = Field(gt=0, serialization_alias="depthMeters", validation_alias="depthMeters")
    boundary: list[LayoutPoint] = Field(min_length=3)
    allocations: list[PlantAllocation]

    @model_validator(mode="after")
    def allocation_ids_are_unique(self):
        if len({allocation.id for allocation in self.allocations}) != len(self.allocations):
            raise ValueError("layout allocation ids must be unique")
        return self


class GardenPlan(ApiModel):
    width_meters: float = Field(gt=0, serialization_alias="widthMeters", validation_alias="widthMeters")
    depth_meters: float = Field(gt=0, serialization_alias="depthMeters", validation_alias="depthMeters")


class GrowingAreaInput(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    kind: GardenAreaKind
    plan_placement: PlanPlacement = Field(serialization_alias="planPlacement", validation_alias="planPlacement")
    layout: GrowingAreaLayout | None = None


class PlantingInput(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    common_name: str = Field(min_length=1, max_length=200, serialization_alias="commonName", validation_alias="commonName")
    plant_type: str | None = Field(default=None, min_length=1, max_length=200, serialization_alias="plantType", validation_alias="plantType")
    variety: str | None = Field(default=None, max_length=200)
    crop_family: CropFamily = Field(serialization_alias="cropFamily", validation_alias="cropFamily")
    quantity: int = Field(gt=0)
    planting_date: Date = Field(serialization_alias="plantingDate", validation_alias="plantingDate")
    growing_area_id: str = Field(min_length=1, max_length=120, serialization_alias="growingAreaId", validation_alias="growingAreaId")
    is_active: bool = Field(serialization_alias="isActive", validation_alias="isActive")


class PlannedPlantingInput(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    common_name: str = Field(min_length=1, max_length=200, serialization_alias="commonName", validation_alias="commonName")
    plant_type: str | None = Field(default=None, min_length=1, max_length=200, serialization_alias="plantType", validation_alias="plantType")
    variety: str | None = Field(default=None, max_length=200)
    crop_family: CropFamily = Field(serialization_alias="cropFamily", validation_alias="cropFamily")
    growing_area_id: str = Field(min_length=1, max_length=120, serialization_alias="growingAreaId", validation_alias="growingAreaId")


class SeasonPlanInput(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    season_year: int = Field(ge=2000, le=2200, serialization_alias="seasonYear", validation_alias="seasonYear")
    plantings: list[PlannedPlantingInput] = Field(default_factory=list)


class CareTargetInput(ApiModel):
    target_scope: TargetScope = Field(serialization_alias="targetScope", validation_alias="targetScope")
    growing_area_id: str | None = Field(default=None, serialization_alias="growingAreaId", validation_alias="growingAreaId")
    growing_area_name: str | None = Field(default=None, serialization_alias="growingAreaName", validation_alias="growingAreaName")
    target_area_deleted: bool | None = Field(default=None, serialization_alias="targetAreaDeleted", validation_alias="targetAreaDeleted")
    planting_record_id: str | None = Field(default=None, serialization_alias="plantingRecordId", validation_alias="plantingRecordId")
    planting_record_name: str | None = Field(default=None, serialization_alias="plantingRecordName", validation_alias="plantingRecordName")
    target_planting_record_deleted: bool | None = Field(default=None, serialization_alias="targetPlantingRecordDeleted", validation_alias="targetPlantingRecordDeleted")

    @model_validator(mode="after")
    def target_fields_match_scope(self):
        area_fields = (self.growing_area_id, self.growing_area_name, self.target_area_deleted)
        planting_fields = (self.planting_record_id, self.planting_record_name, self.target_planting_record_deleted)
        if self.target_scope in ("all-gardens", "garden") and any(value is not None for value in (*area_fields, *planting_fields)):
            raise ValueError("garden-level targets cannot include an area or planting target")
        if self.target_scope == "planting-area":
            if not self.growing_area_id or not self.growing_area_name or any(value is not None for value in planting_fields):
                raise ValueError("planting-area targets require an area id and name snapshot")
        if self.target_scope == "plant-group":
            if not self.planting_record_id or not self.planting_record_name or any(value is not None for value in area_fields):
                raise ValueError("plant-group targets require a planting id and name snapshot")
        return self


class CareEventInput(CareTargetInput):
    id: str = Field(min_length=1, max_length=120)
    type: CareType
    date: Date
    note: str = Field(max_length=5000)
    fertilizer_product: str | None = Field(default=None, serialization_alias="fertilizerProduct", validation_alias="fertilizerProduct")
    fertilizer_amount: float | None = Field(default=None, gt=0, serialization_alias="fertilizerAmount", validation_alias="fertilizerAmount")
    fertilizer_unit: str | None = Field(default=None, serialization_alias="fertilizerUnit", validation_alias="fertilizerUnit")

    @model_validator(mode="after")
    def fertilizer_details_match_type(self):
        details = (self.fertilizer_product, self.fertilizer_amount, self.fertilizer_unit)
        if self.type == "watering" and any(value is not None for value in details):
            raise ValueError("watering events cannot include fertilizer details")
        return self


class CareTaskInput(CareTargetInput):
    id: str = Field(min_length=1, max_length=120)
    type: CareType
    due_date: Date = Field(serialization_alias="dueDate", validation_alias="dueDate")
    note: str = Field(max_length=5000)
    repeat_interval_days: int | None = Field(default=None, gt=0, serialization_alias="repeatIntervalDays", validation_alias="repeatIntervalDays")


class WorkspaceCareEventInput(CareEventInput):
    @model_validator(mode="after")
    def targets_all_gardens(self):
        if self.target_scope != "all-gardens":
            raise ValueError("workspace care events must target all gardens")
        return self


class WorkspaceCareTaskInput(CareTaskInput):
    @model_validator(mode="after")
    def targets_all_gardens(self):
        if self.target_scope != "all-gardens":
            raise ValueError("workspace care tasks must target all gardens")
        return self


class HealthAssessment(ApiModel):
    summary: str = Field(min_length=1, max_length=1000)
    possible_issues: list[str] = Field(max_length=3, serialization_alias="possibleIssues", validation_alias="possibleIssues")
    next_steps: list[str] = Field(max_length=4, serialization_alias="nextSteps", validation_alias="nextSteps")
    follow_up_questions: list[str] = Field(max_length=4, serialization_alias="followUpQuestions", validation_alias="followUpQuestions")
    confidence: HealthSeverity


class HealthRecordInput(CareTargetInput):
    id: str = Field(min_length=1, max_length=120)
    observed_on: Date = Field(serialization_alias="observedOn", validation_alias="observedOn")
    symptoms: str = Field(min_length=1, max_length=5000)
    severity: HealthSeverity
    photo_paths: list[str] = Field(max_length=3, serialization_alias="photoPaths", validation_alias="photoPaths")
    assessment: HealthAssessment | None = None

    @model_validator(mode="after")
    def belongs_to_one_garden(self):
        if self.target_scope == "all-gardens":
            raise ValueError("health records must target one garden or one of its contents")
        if any(not path.startswith("/uploads/") for path in self.photo_paths):
            raise ValueError("health record photos must use local upload paths")
        return self


class GardenInput(ApiModel):
    id: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=200)
    plan: GardenPlan
    growing_areas: list[GrowingAreaInput] = Field(serialization_alias="growingAreas", validation_alias="growingAreas")
    plantings: list[PlantingInput]
    season_plans: list[SeasonPlanInput] = Field(default_factory=list, serialization_alias="seasonPlans", validation_alias="seasonPlans")
    care_events: list[CareEventInput] = Field(serialization_alias="careEvents", validation_alias="careEvents")
    care_tasks: list[CareTaskInput] = Field(serialization_alias="careTasks", validation_alias="careTasks")
    health_records: list[HealthRecordInput] = Field(serialization_alias="healthRecords", validation_alias="healthRecords")

    @model_validator(mode="after")
    def references_stay_in_the_garden(self):
        area_ids = {area.id for area in self.growing_areas}
        planting_ids = {planting.id for planting in self.plantings}
        plan_ids = {plan.id for plan in self.season_plans}
        if len(area_ids) != len(self.growing_areas) or len(planting_ids) != len(self.plantings) or len(plan_ids) != len(self.season_plans):
            raise ValueError("growing area, planting, and season plan ids must be unique within a garden")
        if any(planting.growing_area_id not in area_ids for planting in self.plantings):
            raise ValueError("each planting must reference a growing area in the same garden")
        if len({plan.season_year for plan in self.season_plans}) != len(self.season_plans):
            raise ValueError("one season plan is allowed for each garden and year")
        if any(
            planting.growing_area_id not in area_ids
            for plan in self.season_plans
            for planting in plan.plantings
        ):
            raise ValueError("each planned planting must reference a growing area in the same garden")
        for record in [*self.care_events, *self.care_tasks, *self.health_records]:
            if record.target_scope == "all-gardens":
                raise ValueError("garden care records must target this garden or one of its contents")
            if record.growing_area_id and record.growing_area_id not in area_ids and not record.target_area_deleted:
                raise ValueError("care target area must belong to the same garden")
            if record.planting_record_id and record.planting_record_id not in planting_ids and not record.target_planting_record_deleted:
                raise ValueError("care target planting must belong to the same garden")
        return self


class WorkspaceImport(ApiModel):
    workspace_id: str = Field(min_length=1, max_length=120, serialization_alias="workspaceId", validation_alias="workspaceId")
    version: Literal[10]
    selected_garden_id: str = Field(min_length=1, max_length=120, serialization_alias="selectedGardenId", validation_alias="selectedGardenId")
    gardens: list[GardenInput] = Field(min_length=1)
    care_events: list[WorkspaceCareEventInput] = Field(serialization_alias="careEvents", validation_alias="careEvents")
    care_tasks: list[WorkspaceCareTaskInput] = Field(serialization_alias="careTasks", validation_alias="careTasks")

    @model_validator(mode="after")
    def garden_ids_and_selection_are_valid(self):
        garden_ids = {garden.id for garden in self.gardens}
        if len(garden_ids) != len(self.gardens):
            raise ValueError("garden ids must be unique within a workspace")
        if self.selected_garden_id not in garden_ids:
            raise ValueError("selectedGardenId must reference a garden in this workspace")
        return self


class WorkspaceSave(WorkspaceImport):
    """A later save of an imported workspace. Must carry the revision the client last read."""

    revision: int = Field(ge=0)


class RotationGuidanceRequest(ApiModel):
    growing_area_id: str = Field(min_length=1, max_length=120, serialization_alias="growingAreaId", validation_alias="growingAreaId")
    crop_family: CropFamily = Field(serialization_alias="cropFamily", validation_alias="cropFamily")
    planting_date: Date = Field(serialization_alias="plantingDate", validation_alias="plantingDate")
    exclude_planting_id: str | None = Field(default=None, min_length=1, max_length=120, serialization_alias="excludePlantingId", validation_alias="excludePlantingId")


class RotationHistoryPlanting(ApiModel):
    planting_id: str = Field(serialization_alias="plantingId", validation_alias="plantingId")
    common_name: str = Field(serialization_alias="commonName", validation_alias="commonName")
    crop_family: CropFamily = Field(serialization_alias="cropFamily", validation_alias="cropFamily")
    planting_date: Date = Field(serialization_alias="plantingDate", validation_alias="plantingDate")
    season: int


class RotationWarning(ApiModel):
    crop_family: CropFamily = Field(serialization_alias="cropFamily", validation_alias="cropFamily")
    plantings: list[RotationHistoryPlanting]


class RotationGuidanceResponse(ApiModel):
    growing_area_id: str = Field(serialization_alias="growingAreaId", validation_alias="growingAreaId")
    growing_area_kind: GardenAreaKind = Field(serialization_alias="growingAreaKind", validation_alias="growingAreaKind")
    season: int
    history: list[RotationHistoryPlanting]
    warning: RotationWarning | None
    automated_warning_supported: bool = Field(serialization_alias="automatedWarningSupported", validation_alias="automatedWarningSupported")
    has_automatic_compatibility_conclusion: bool = Field(serialization_alias="hasAutomaticCompatibilityConclusion", validation_alias="hasAutomaticCompatibilityConclusion")
    rotation_friendly_crop_families: list[CropFamily] = Field(serialization_alias="rotationFriendlyCropFamilies", validation_alias="rotationFriendlyCropFamilies")


class CareNoteDraftRequest(ApiModel):
    note: str = Field(min_length=1, max_length=2000)


class CareNoteExtraction(ApiModel):
    type: CareType | None = None
    date: Date | None = None
    target_scope: TargetScope | None = Field(default=None, serialization_alias="targetScope", validation_alias="targetScope")
    target_name: str | None = Field(default=None, max_length=200, serialization_alias="targetName", validation_alias="targetName")
    fertilizer_product: str | None = Field(default=None, max_length=200, serialization_alias="fertilizerProduct", validation_alias="fertilizerProduct")
    fertilizer_amount: float | None = Field(default=None, gt=0, serialization_alias="fertilizerAmount", validation_alias="fertilizerAmount")
    fertilizer_unit: str | None = Field(default=None, max_length=40, serialization_alias="fertilizerUnit", validation_alias="fertilizerUnit")


class CareNoteDraftResponse(ApiModel):
    type: CareType | None = None
    date: Date | None = None
    note: str
    target_scope: TargetScope = Field(serialization_alias="targetScope", validation_alias="targetScope")
    growing_area_id: str | None = Field(default=None, serialization_alias="growingAreaId", validation_alias="growingAreaId")
    growing_area_name: str | None = Field(default=None, serialization_alias="growingAreaName", validation_alias="growingAreaName")
    planting_record_id: str | None = Field(default=None, serialization_alias="plantingRecordId", validation_alias="plantingRecordId")
    planting_record_name: str | None = Field(default=None, serialization_alias="plantingRecordName", validation_alias="plantingRecordName")
    fertilizer_product: str | None = Field(default=None, serialization_alias="fertilizerProduct", validation_alias="fertilizerProduct")
    fertilizer_amount: float | None = Field(default=None, serialization_alias="fertilizerAmount", validation_alias="fertilizerAmount")
    fertilizer_unit: str | None = Field(default=None, serialization_alias="fertilizerUnit", validation_alias="fertilizerUnit")
    review_notes: list[str] = Field(default_factory=list, serialization_alias="reviewNotes", validation_alias="reviewNotes")


class PlantHealthAssessmentRequest(ApiModel):
    symptoms: str = Field(min_length=1, max_length=5000)
    severity: HealthSeverity
    photo_count: int = Field(ge=0, le=3, serialization_alias="photoCount", validation_alias="photoCount")


class PlantHealthAssessmentResponse(HealthAssessment):
    pass


class PlantKnowledgeQuestion(ApiModel):
    question: str = Field(min_length=3, max_length=2000)
    garden_id: str | None = Field(default=None, serialization_alias="gardenId", validation_alias="gardenId")


class KnowledgeCitation(ApiModel):
    source_key: str = Field(serialization_alias="sourceKey", validation_alias="sourceKey")
    title: str
    publisher: str
    source_url: str = Field(serialization_alias="sourceUrl", validation_alias="sourceUrl")
    reviewed_on: Date = Field(serialization_alias="reviewedOn", validation_alias="reviewedOn")
    excerpt: str


class PlantKnowledgeDraft(ApiModel):
    answer: str = Field(min_length=1, max_length=3000)
    confidence: HealthSeverity
    follow_up_questions: list[str] = Field(max_length=3, serialization_alias="followUpQuestions", validation_alias="followUpQuestions")


class PlantKnowledgeAnswer(PlantKnowledgeDraft):
    citations: list[KnowledgeCitation] = Field(max_length=4)


class HealthResponse(BaseModel):
    status: Literal["ok"]


class RuntimeConfigResponse(BaseModel):
    portfolio_demo: bool = Field(serialization_alias="portfolioDemo")
