import { areaPlanCorners, snapToGrid, type Garden, type GardenPlan, type GrowingArea, type LayoutPoint } from "@/lib/gardenWorkspace";

/**
 * Guided first-run setup for a new garden (ADR-0072, phase G6): four steps on
 * top of the normal Garden Plan canvas. The state lives in the browser tab
 * (session storage), never in the workspace, so it adds no stored field.
 */
export const setupSteps = ["size", "areas", "plants", "ready"] as const;
export type SetupStep = (typeof setupSteps)[number];

export const setupStepLabels: Record<SetupStep, string> = {
  size: "Garden size",
  areas: "Planting areas",
  plants: "Plants",
  ready: "Ready",
};

/** Which garden is being set up, the step on screen, and the furthest step reached. */
export type GuidedSetup = { gardenId: string; step: SetupStep; reached: SetupStep };

export const GUIDED_SETUP_STORAGE_KEY = "garden-manager:guided-setup";

/** Common garden sizes offered in the Garden size step, width × length in metres. */
export const gardenSizePresets: GardenPlan[] = [
  { widthMeters: 3, depthMeters: 2 },
  { widthMeters: 6, depthMeters: 4 },
  { widthMeters: 12, depthMeters: 8 },
];

export const stepIndex = (step: SetupStep) => setupSteps.indexOf(step);

export function startSetup(gardenId: string): GuidedSetup {
  return { gardenId, step: "size", reached: "size" };
}

/** Returns to a step already reached; a step not reached yet cannot be skipped to. */
export function goToStep(setup: GuidedSetup, step: SetupStep): GuidedSetup {
  return stepIndex(step) <= stepIndex(setup.reached) ? { ...setup, step } : setup;
}

/** Continues to the step after the one on screen; Ready has no next step. */
export function advanceSetup(setup: GuidedSetup): GuidedSetup {
  const next = setupSteps[stepIndex(setup.step) + 1];
  if (!next) return setup;
  return { ...setup, step: next, reached: stepIndex(next) > stepIndex(setup.reached) ? next : setup.reached };
}

export type TrackStep = {
  step: SetupStep;
  label: string;
  number: number;
  /** complete: passed and checked; current: on screen; available: reached but not passed; locked: not reached. */
  status: "complete" | "current" | "available" | "locked";
  /** Only steps already reached can be revisited; later steps cannot be skipped to. */
  clickable: boolean;
};

export function setupTrack(setup: Pick<GuidedSetup, "step" | "reached">): TrackStep[] {
  const current = stepIndex(setup.step);
  const reached = stepIndex(setup.reached);
  return setupSteps.map((step, index) => {
    const status = index === current ? "current" : index < reached ? "complete" : index === reached ? "available" : "locked";
    return { step, label: setupStepLabels[step], number: index + 1, status, clickable: status === "complete" || status === "available" };
  });
}

/** Reads the stored guide; anything malformed counts as no guide. */
export function parseGuidedSetup(value: string | null): GuidedSetup | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<GuidedSetup>;
    const known = (step: unknown): step is SetupStep => setupSteps.includes(step as SetupStep);
    if (typeof parsed.gardenId !== "string" || !known(parsed.step) || !known(parsed.reached)) return undefined;
    if (stepIndex(parsed.step) > stepIndex(parsed.reached)) return undefined;
    return { gardenId: parsed.gardenId, step: parsed.step, reached: parsed.reached };
  } catch {
    return undefined;
  }
}

/**
 * The smallest garden that still holds every sized area, rounded up to the
 * 0.1 m grid and never below 0.1 m. Shrinking the garden past its areas
 * would push them off the plan.
 */
export function minimumGardenSize(areas: GrowingArea[]): GardenPlan {
  const corners = areas.filter((area) => area.layout).flatMap(areaPlanCorners);
  const roundUp = (value: number) => Math.max(0.1, Math.ceil(value * 10 - 1e-6) / 10);
  return {
    widthMeters: roundUp(Math.max(0, ...corners.map((point) => point.x))),
    depthMeters: roundUp(Math.max(0, ...corners.map((point) => point.y))),
  };
}

/** Counts shown on the Ready step. Plant groups are the active planting records the layout created. */
export function setupSummary(garden: Pick<Garden, "growingAreas" | "plantings">) {
  return {
    areas: garden.growingAreas.length,
    plants: garden.growingAreas.reduce((count, area) => count + (area.layout?.allocations.length ?? 0), 0),
    plantGroups: garden.plantings.filter((planting) => planting.isActive).length,
  };
}

/** The garden details form's typed values (ADR-0072, G6): name, width (x), and length (y, stored as depthMeters). */
export type GardenDetailsValues = { name: string; width: string; depth: string };

/**
 * Field errors for the garden details. Each size is at least 0.1 m and at
 * least the extent of the existing planting areas.
 */
export function gardenDetailsErrors(values: GardenDetailsValues, minimum: GardenPlan, checkName = true) {
  const errors: Partial<Record<keyof GardenDetailsValues, string>> = {};
  if (checkName && !values.name.trim()) errors.name = "Enter garden name.";
  const size = (value: string, least: number, direction: "wide" | "long") => {
    const metres = Number(value);
    if (!value.trim() || !Number.isFinite(metres) || metres < 0.1) return "Enter a value of at least 0.1.";
    if (metres < least - 1e-9) return `Make the garden at least ${least} m ${direction} to hold its planting areas.`;
  };
  const width = size(values.width, minimum.widthMeters, "wide");
  const depth = size(values.depth, minimum.depthMeters, "long");
  if (width) errors.width = width;
  if (depth) errors.depth = depth;
  return errors;
}

/** The garden size a boundary-corner drag asks for: snapped to 0.1 m and never smaller than the areas need. */
export function resizedGardenSize(corner: LayoutPoint, minimum: GardenPlan): GardenPlan {
  return {
    widthMeters: Math.max(minimum.widthMeters, 0.1, snapToGrid(corner.x)),
    depthMeters: Math.max(minimum.depthMeters, 0.1, snapToGrid(corner.y)),
  };
}
