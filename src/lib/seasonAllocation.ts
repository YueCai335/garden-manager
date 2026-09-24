import { addSeasonPlanPlanting } from "@/lib/gardenOperations";
import {
  knownPlantType,
  type Garden,
  type GrowingAreaKind,
  type PlannedPlanting,
  type PlantingCropFamily,
} from "@/lib/gardenWorkspace";

// Mirrors backend/app/agent/allocation.py (ADR-0056).
export const allocationCrops = [
  { key: "tomato", label: "Tomato", cropFamily: "nightshade" },
  { key: "bean", label: "Bean", cropFamily: "legume" },
  { key: "lettuce", label: "Lettuce", cropFamily: "leafy" },
  { key: "cucumber", label: "Cucumber", cropFamily: "cucurbit" },
  { key: "carrot", label: "Carrot", cropFamily: "root" },
] as const satisfies readonly { key: string; label: string; cropFamily: PlantingCropFamily }[];

export type AllocationCropKey = (typeof allocationCrops)[number]["key"];

export const MAX_ALLOCATION_AREAS = 3;
export const MAX_ALLOCATION_PREFERENCE = 200;
const ROTATION_AREA_KINDS: readonly GrowingAreaKind[] = ["raised-bed", "in-ground", "container"];
const HISTORY_YEARS = 3;

export type RotationSummaryRow = { growingAreaId: string; year: number; rotationGroup: string };
export type AllocationAssignment = { growingAreaId: string; crop: AllocationCropKey };
export type AllocationWarning = AllocationAssignment & {
  rotationGroup: string;
  warning: boolean;
  repeatedYears: number[];
  rotationFriendlyGroups: string[];
};
export type AllocationTraceStep = {
  step: number;
  tool: string;
  args: Record<string, unknown> | string;
  shortResult: string;
};
export type AllocationScope = {
  seasonYear: number;
  areas: { id: string; name: string; kind: string }[];
  crops: AllocationCropKey[];
  preference: string;
};
export type AllocationStatus =
  | "draft"
  | "needs_input"
  | "budget_exhausted"
  | "provider_unavailable"
  | "generation_failed";
export type SeasonAllocationResult = {
  status: AllocationStatus;
  seasonYear: number | null;
  scope: AllocationScope | null;
  allocation: AllocationAssignment[];
  explanation: string | null;
  warnings: AllocationWarning[];
  rotationSummary: RotationSummaryRow[];
  missingInputs: string[];
  failureReason: string | null;
  trace: AllocationTraceStep[];
};

/** A real recorded run on the Demo Garden, replayed when live planning is unavailable. */
export type ExampleAllocationRun = {
  recordedAt: string;
  model: string;
  gardenId: string;
  gardenName: string;
  caseId: string;
  request: { crops: AllocationCropKey[]; preference?: string; growingAreaIds?: string[] };
  result: SeasonAllocationResult;
  toolResults: { tool: string; arguments: string; output: unknown }[];
};

/** What the gardener has entered in the panel right now. */
export type AllocationInput = {
  crops: AllocationCropKey[];
  preference: string;
  chosenAreaIds: string[];
};

export function cropLabel(key: AllocationCropKey) {
  return allocationCrops.find((crop) => crop.key === key)?.label ?? key;
}

/** Areas the backend accepts for rotation planning; greenhouse shelves are excluded. */
export function eligibleAllocationAreas(garden: Garden) {
  return garden.growingAreas.filter((area) => ROTATION_AREA_KINDS.includes(area.kind));
}

/** True when the gardener has to pick areas, because more than three are eligible. */
export function needsAreaChoice(garden: Garden) {
  return eligibleAllocationAreas(garden).length > MAX_ALLOCATION_AREAS;
}

/** The areas a run would plan: every eligible area, or the gardener's choice when there are too many. */
export function selectedAllocationAreaIds(garden: Garden, chosenAreaIds: string[]) {
  const eligible = eligibleAllocationAreas(garden);
  if (eligible.length <= MAX_ALLOCATION_AREAS) return eligible.map((area) => area.id);
  return eligible.filter((area) => chosenAreaIds.includes(area.id)).map((area) => area.id);
}

/** The request body sent to the API; growingAreaIds only when the gardener had to choose. */
export function allocationRequestBody(garden: Garden, input: AllocationInput) {
  return {
    crops: allocationCrops.map((crop) => crop.key).filter((key) => input.crops.includes(key)),
    preference: input.preference,
    ...(needsAreaChoice(garden) ? { growingAreaIds: selectedAllocationAreaIds(garden, input.chosenAreaIds) } : {}),
  };
}

// Plain code-point order, matching Python's sorted(); localeCompare would not.
function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** One row per area, year, and rotation group from the three seasons before seasonYear. */
export function allocationRotationSummary(garden: Garden, areaIds: string[], seasonYear: number) {
  const rows = new Map<string, RotationSummaryRow>();
  for (const planting of garden.plantings) {
    const year = Number(planting.plantingDate.slice(0, 4));
    if (!areaIds.includes(planting.growingAreaId)) continue;
    if (year < seasonYear - HISTORY_YEARS || year >= seasonYear) continue;
    const row = { growingAreaId: planting.growingAreaId, year, rotationGroup: planting.cropFamily };
    rows.set(`${row.growingAreaId}\u0000${row.year}\u0000${row.rotationGroup}`, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      compareText(left.growingAreaId, right.growingAreaId) ||
      right.year - left.year ||
      compareText(left.rotationGroup, right.rotationGroup),
  );
}

export function nextSeasonYear(now = new Date()) {
  return now.getFullYear() + 1;
}

/**
 * A draft is stale when anything it was generated from differs from now: the
 * season year, the selected areas or their kinds, the crops, the preference,
 * or the garden's rotation history for those areas.
 */
export function isAllocationDraftStale(
  draft: SeasonAllocationResult,
  garden: Garden | undefined,
  input: AllocationInput,
  seasonYear: number,
) {
  const scope = draft.scope;
  if (draft.status !== "draft" || !scope || !garden) return true;
  if (scope.seasonYear !== seasonYear) return true;

  const areaIds = selectedAllocationAreaIds(garden, input.chosenAreaIds);
  const draftAreaIds = scope.areas.map((area) => area.id);
  if (areaIds.join("\u0000") !== draftAreaIds.join("\u0000")) return true;
  const kinds = new Map(garden.growingAreas.map((area) => [area.id, area.kind as string]));
  if (scope.areas.some((area) => kinds.get(area.id) !== area.kind)) return true;

  if (allocationRequestBody(garden, input).crops.join() !== scope.crops.join()) return true;
  if (input.preference.trim() !== scope.preference) return true;

  const summary = allocationRotationSummary(garden, draftAreaIds, scope.seasonYear);
  return JSON.stringify(summary) !== JSON.stringify(draft.rotationSummary);
}

/** The allocation crop a planned planting stands for, recognised by exact plant-type alias only. */
export function plannedCropKey(planting: Pick<PlannedPlanting, "plantType" | "commonName">) {
  const plantType = knownPlantType(planting.plantType) ?? knownPlantType(planting.commonName);
  return allocationCrops.find((crop) => crop.label === plantType)?.key;
}

/**
 * Append every allocated crop to the draft's season plan in one change. A crop
 * already planned in the same area that season is skipped; plan entries the
 * alias table does not recognise are left as they are.
 */
export function appendAllocationToGarden(
  garden: Garden,
  draft: SeasonAllocationResult,
  createId: (prefix: string) => string,
) {
  const seasonYear = draft.scope?.seasonYear;
  if (seasonYear === undefined) return { garden, added: 0, skipped: 0 };
  let next = garden;
  let added = 0;
  let skipped = 0;
  for (const assignment of draft.allocation) {
    const planned =
      next.seasonPlans?.find((plan) => plan.seasonYear === seasonYear)?.plantings ?? [];
    const alreadyPlanned = planned.some(
      (planting) =>
        planting.growingAreaId === assignment.growingAreaId && plannedCropKey(planting) === assignment.crop,
    );
    if (alreadyPlanned) {
      skipped += 1;
      continue;
    }
    const crop = allocationCrops.find((candidate) => candidate.key === assignment.crop)!;
    next = addSeasonPlanPlanting(
      next,
      seasonYear,
      {
        id: createId("planned-planting"),
        commonName: crop.label,
        plantType: crop.label,
        cropFamily: crop.cropFamily,
        growingAreaId: assignment.growingAreaId,
      },
      () => createId("season-plan"),
    );
    added += 1;
  }
  return { garden: next, added, skipped };
}
