import {
  clampAllocationCenter, clampPlanPosition, createRectangularLayout, normalizePlanRotation, snapToGrid,
  validateLayoutDimensions, type GardenPlan, type GrowingArea, type GrowingAreaKind, type GrowingAreaLayout, type PlantAllocation,
} from "@/lib/gardenWorkspace";

export type AreaProperties = { name: string; kind: GrowingAreaKind; length: string; width: string; rotation: string; x: string; y: string };
export type AreaPropertiesDraft = { baseline: AreaProperties; values: AreaProperties };
export function areaProperties(area: GrowingArea): AreaProperties {
  return { x: String(area.planPlacement.x), y: String(area.planPlacement.y), name: area.name, kind: area.kind, length: String(area.layout?.widthMeters ?? ""), width: String(area.layout?.depthMeters ?? ""), rotation: String(area.planPlacement.rotationDegrees) };
}
export function sameAreaProperties(a: AreaProperties, b: AreaProperties) {
  const number = (value: string) => value.trim() === "" ? "" : Number(value);
  const rotation = (value: string) => value.trim() === "" ? "" : normalizePlanRotation(Number(value));
  return a.name.trim() === b.name.trim() && a.kind === b.kind && number(a.length) === number(b.length) && number(a.width) === number(b.width) && rotation(a.rotation) === rotation(b.rotation) && number(a.x) === number(b.x) && number(a.y) === number(b.y);
}
export function areaPropertyErrors(values: AreaProperties, plan?: GardenPlan): Partial<Record<keyof AreaProperties, string>> {
  const errors: Partial<Record<keyof AreaProperties, string>> = {};
  if (!values.name.trim()) errors.name = "Enter a planting-area name.";
  if (!values.length.trim() || !validateLayoutDimensions(Number(values.length), 1)) errors.length = "Enter a length of at least 0.1 metres.";
  if (!values.width.trim() || !validateLayoutDimensions(1, Number(values.width))) errors.width = "Enter a width of at least 0.1 metres.";
  if (!values.rotation.trim() || !Number.isFinite(Number(values.rotation))) errors.rotation = "Enter a valid rotation angle.";
  for (const axis of ["x", "y"] as const) {
    const limit = plan ? (axis === "x" ? plan.widthMeters : plan.depthMeters) : Infinity;
    if (!values[axis].trim() || !Number.isFinite(Number(values[axis])) || Number(values[axis]) < 0 || Number(values[axis]) > limit) errors[axis] = `Enter a ${axis.toUpperCase()} position inside the current garden boundary.`;
  }
  return errors;
}
/** Only properties change here; allocations always come from the latest area. */
export function applyAreaProperties(area: GrowingArea, values: AreaProperties, plan: GardenPlan): GrowingArea {
  if (Object.keys(areaPropertyErrors(values, plan)).length) throw new Error("Invalid planting-area properties");
  const layout = createRectangularLayout(snapToGrid(Number(values.length)), snapToGrid(Number(values.width)));
  return {
    ...area, name: values.name.trim(), kind: values.kind,
    planPlacement: { ...clampPlanPosition({ x: Number(values.x), y: Number(values.y) }, plan), rotationDegrees: normalizePlanRotation(Number(values.rotation)) },
    layout: { ...layout, allocations: (area.layout?.allocations ?? []).map((allocation) => ({ ...allocation, ...clampAllocationCenter(allocation, layout) })) },
  };
}

export type PlantEditorDraft = {
  allocationPlantType: string; allocationVariety: string; allocationColor: string; allocationDiameter: string;
  selectedId?: string; editingAllocation?: PlantAllocation; baselineAllocation?: PlantAllocation;
  coordinates: { x: string; y: string; diameterMeters: string };
  isAddFormOpen: boolean; isEditOpen: boolean;
};
export const emptyPlantEditorDraft = (): PlantEditorDraft => ({
  allocationPlantType: "", allocationVariety: "", allocationColor: "", allocationDiameter: "0.3",
  coordinates: { x: "", y: "", diameterMeters: "" }, isAddFormOpen: false, isEditOpen: false,
});
export function plantDraftIsDirty(draft?: PlantEditorDraft) {
  if (!draft) return false;
  if (draft.allocationPlantType || draft.allocationVariety || draft.allocationColor || draft.allocationDiameter !== "0.3") return true;
  const original = draft.baselineAllocation;
  return Boolean(draft.editingAllocation && original && (
    JSON.stringify(draft.editingAllocation) !== JSON.stringify(original) ||
    (["x", "y", "diameterMeters"] as const).some((key) => !draft.coordinates[key].trim() || Number(draft.coordinates[key]) !== original[key])
  ));
}
export function plantPositionError(draft: PlantEditorDraft, layout: GrowingAreaLayout) {
  const { x, y, diameterMeters } = draft.coordinates;
  if ([x, y, diameterMeters].some((value) => !value.trim() || !Number.isFinite(Number(value)))) return "Enter a valid position and spacing.";
  if (Number(diameterMeters) < 0.1) return "Plant spacing must be at least 0.1 metres.";
  if (Number(x) < 0 || Number(x) > layout.widthMeters || Number(y) < 0 || Number(y) > layout.depthMeters) return "The plant position is outside this area's current dimensions. Update X and Y before saving.";
  return "";
}
export function areaDraftKey(gardenId: string, areaId: string) { return JSON.stringify([gardenId, areaId]); }
