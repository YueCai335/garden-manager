import type { SetupStep } from "@/lib/guidedSetup";

/**
 * The three levels of an existing garden's plan (ADR-0075): the garden's own
 * size, its planting areas, and the plants inside an area. Each level shows
 * only its own controls on the one Garden Plan canvas.
 */
export const planLevels = ["garden", "areas", "plants"] as const;
export type PlanLevel = (typeof planLevels)[number];

export const planLevelLabels: Record<PlanLevel, string> = {
  garden: "Garden",
  areas: "Planting areas",
  plants: "Plants",
};

/** Shorter labels for narrow screens; the full label stays the accessible name. */
export const planLevelShortLabels: Record<PlanLevel, string> = {
  garden: "Garden",
  areas: "Areas",
  plants: "Plants",
};

/** One line under each level's label: what that level edits (ADR-0078). */
export const planLevelHints: Record<PlanLevel, string> = {
  garden: "Name and size",
  areas: "Add and place beds",
  plants: "What grows where",
};

export const isPlanLevel = (value: unknown): value is PlanLevel => planLevels.includes(value as PlanLevel);

/** The guided setup's steps use the same canvas rules as the matching level; Ready only views. */
export function setupLevel(step: SetupStep): PlanLevel | undefined {
  return step === "size" ? "garden" : step === "areas" ? "areas" : step === "plants" ? "plants" : undefined;
}

/**
 * The level shown when the address names none (ADR-0078): an address with an
 * area opens that area on Plants; a garden opened from its card starts on
 * Garden, the top level, and the bar shows where to go next.
 */
export function defaultPlanLevel(hasArea: boolean): PlanLevel {
  return hasArea ? "plants" : "garden";
}

/** Reads `?level=`; an unknown or missing value falls back to the default. */
export function planLevelFromSearch(value: string | null, hasArea: boolean): PlanLevel {
  return isPlanLevel(value) ? value : defaultPlanLevel(hasArea);
}
