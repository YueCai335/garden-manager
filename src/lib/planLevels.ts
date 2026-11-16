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

export const isPlanLevel = (value: unknown): value is PlanLevel => planLevels.includes(value as PlanLevel);

/** The guided setup's steps use the same canvas rules as the matching level; Ready only views. */
export function setupLevel(step: SetupStep): PlanLevel | undefined {
  return step === "size" ? "garden" : step === "areas" ? "areas" : step === "plants" ? "plants" : undefined;
}

/**
 * The level shown when the address names none: Plants, the most frequent
 * daily task, or Planting areas while the garden has no area to plant in.
 */
export function defaultPlanLevel(areaCount: number): PlanLevel {
  return areaCount > 0 ? "plants" : "areas";
}

/** Reads `?level=`; an unknown or missing value falls back to the default. */
export function planLevelFromSearch(value: string | null, areaCount: number): PlanLevel {
  return isPlanLevel(value) ? value : defaultPlanLevel(areaCount);
}
