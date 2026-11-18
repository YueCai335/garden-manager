import {
  plantingCropFamilies,
  plantingCropFamilyLabels,
  type Garden,
  type PlannedPlanting,
  type PlantingCropFamily,
} from "@/lib/gardenWorkspace";
import {
  gardenPlantColors,
  plantColor,
  plantColorKey,
  plantingFamilies,
  type PlantColors,
} from "@/lib/planAppearance";

type PairingPlant = {
  id: string;
  commonName: string;
  plantType?: string;
  cropFamily: PlantingCropFamily;
};

export type PairingNote = {
  kind: "helpful" | "space" | "caution";
  message: string;
  sourceLabel: string;
  sourceUrl: string;
};

const companionSource = {
  sourceLabel: "University of Minnesota Extension",
  sourceUrl: "https://extension.umn.edu/garden-and-home/yard-and-garden/gardening-in-minnesota/companion-planting-in-home-gardens",
};

const familySource = {
  sourceLabel: "Penn State Extension",
  sourceUrl: "https://extension.psu.edu/plant-rotation-in-the-garden-based-on-plant-families",
};

export function companionNotes<T extends PairingPlant>(plantings: T[]): PairingNote[] {
  const names = plantings.map((planting) => normalizePlantName(planting));
  const notes: PairingNote[] = [];

  if (hasPlant(names, ["tomato", "番茄"]) && hasPlant(names, ["basil", "罗勒"])) {
    notes.push({
      kind: "helpful",
      message: "Basil may reduce some tomato pests.",
      ...companionSource,
    });
  }
  if (hasPlant(names, ["tomato", "番茄"]) && hasPlant(names, ["lettuce", "莴笋", "生菜"])) {
    notes.push({
      kind: "space",
      message: "Lettuce can use the space before the tomato fills in.",
      ...companionSource,
    });
  }

  const families = new Map<PlantingCropFamily, Set<string>>();
  for (const planting of plantings) {
    if (planting.cropFamily === "other") continue;
    const namesInFamily = families.get(planting.cropFamily) ?? new Set<string>();
    namesInFamily.add(planting.commonName);
    families.set(planting.cropFamily, namesInFamily);
  }
  for (const [family, namesInFamily] of families) {
    if (namesInFamily.size < 2) continue;
    notes.push({
      kind: "caution",
      message: `${plantingCropFamilyLabels[family]} crops share pests and diseases. Keep an eye on spacing.`,
      ...familySource,
    });
  }

  return notes;
}

function normalizePlantName(planting: PairingPlant) {
  return `${planting.plantType ?? ""} ${planting.commonName}`.toLocaleLowerCase();
}

function hasPlant(names: string[], terms: string[]) {
  return names.some((name) => terms.some((term) => name.includes(term)));
}

/* ---------- Rotation rules for the Next Season sheet (ADR-0082) ---------- */

export type PlantingRecordLike = Pick<
  Garden["plantings"][number],
  "id" | "commonName" | "plantType" | "variety" | "plantingDate" | "cropFamily"
>;

/** Planting records in an area from the three seasons before the planning year. */
export function recentHistory(garden: Pick<Garden, "plantings">, growingAreaId: string, planningYear: number) {
  return garden.plantings.filter((planting) => {
    const season = Number(planting.plantingDate.slice(0, 4));
    return planting.growingAreaId === growingAreaId && season >= planningYear - 3 && season < planningYear;
  });
}

/** An area's plan for one season. */
export function plannedForArea(garden: Pick<Garden, "seasonPlans">, growingAreaId: string, seasonYear: number): PlannedPlanting[] {
  return garden.seasonPlans
    ?.find((plan) => plan.seasonYear === seasonYear)
    ?.plantings.filter((planting) => planting.growingAreaId === growingAreaId) ?? [];
}

/** The crop families an area should rest from: every known family in its recent history. */
export function recentFamilies(plantings: Pick<PlantingRecordLike, "cropFamily">[]) {
  return [...new Set(plantings.map((planting) => planting.cropFamily).filter((family) => family !== "other"))];
}

/** Known families the area has not grown recently, in the standard family order. */
export function rotationFit(recentCropFamilies: PlantingCropFamily[]) {
  return plantingCropFamilies.filter((family) => family !== "other" && !recentCropFamilies.includes(family));
}

/** The family a planned plant repeats from the area's recent history, if any. "Other" never counts. */
export function repeatedFamily(planting: Pick<PlannedPlanting, "cropFamily">, recentCropFamilies: PlantingCropFamily[]) {
  return planting.cropFamily !== "other" && recentCropFamilies.includes(planting.cropFamily) ? planting.cropFamily : undefined;
}

/** The latest season in which an area grew a family. */
export function latestFamilyYear(history: PlantingRecordLike[], family: PlantingCropFamily) {
  const years = history.filter((planting) => planting.cropFamily === family).map((planting) => Number(planting.plantingDate.slice(0, 4)));
  return years.length ? Math.max(...years) : undefined;
}

export type HistoryPlant = { identity: string; label: string; planting: PlantingRecordLike };

/** Recent history grouped by season, newest first, with each season's plants named once. */
export function historyBySeason(history: PlantingRecordLike[]) {
  const seasons = [...new Set(history.map((planting) => Number(planting.plantingDate.slice(0, 4))))].sort((first, second) => second - first);
  return seasons.map((year) => ({
    year,
    plants: uniqueHistoryPlants(history.filter((planting) => planting.plantingDate.startsWith(`${year}-`))),
  }));
}

/** One entry per plant identity, so three tomato records read as one "Tomato". */
export function uniqueHistoryPlants(plantings: PlantingRecordLike[]): HistoryPlant[] {
  const plantsByIdentity = new Map<string, HistoryPlant>();
  for (const planting of plantings) {
    const { identity, label } = normalizedHistoryLabel(planting);
    plantsByIdentity.set(identity, { identity, label, planting });
  }
  return [...plantsByIdentity.values()];
}

function normalizedHistoryLabel(planting: PlantingRecordLike) {
  const source = [planting.plantType, planting.variety, planting.commonName]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  if (source.includes("sungold") || source.includes("sun gold")) {
    return { identity: "tomato:sun-gold", label: "Tomato · Sun Gold" };
  }
  if (source.includes("tomato") || source.includes("番茄") || source.includes("西红柿")) {
    return { identity: "tomato", label: "Tomato" };
  }
  if (source.includes("basil") || source.includes("九层塔")) {
    return { identity: "basil", label: "Basil" };
  }

  const label = planting.variety?.trim()
    ? `${planting.plantType?.trim() || planting.commonName.trim()} · ${planting.variety.trim()}`
    : planting.plantType?.trim() || planting.commonName.trim();
  return { identity: `${planting.cropFamily}:${label.toLocaleLowerCase()}`, label };
}

/** A family's label with examples, used as the Rest from tag's title. */
export function cropFamilySummaryLabel(family: PlantingCropFamily) {
  const examples: Partial<Record<PlantingCropFamily, string>> = {
    nightshade: "tomato, pepper, eggplant",
    brassica: "cabbage, broccoli, kale",
    cucurbit: "cucumber, squash, melon",
    legume: "bean, pea",
    allium: "onion, garlic, leek",
    root: "carrot, beet, radish",
    leafy: "lettuce, spinach",
  };
  return examples[family] ? `${plantingCropFamilyLabels[family]} (${examples[family]})` : plantingCropFamilyLabels[family];
}

/** Areas with at least one planned plant for the season. */
export function plannedAreaCount(garden: Pick<Garden, "growingAreas" | "seasonPlans">, seasonYear: number) {
  return garden.growingAreas.filter((area) => plannedForArea(garden, area.id, seasonYear).length).length;
}

/** Planned plants that repeat a family their area grew in the last three seasons: the sheet's "to check" count. */
export function plantsToCheck(garden: Pick<Garden, "growingAreas" | "seasonPlans" | "plantings">, seasonYear: number) {
  return garden.growingAreas.reduce((count, area) => {
    const families = recentFamilies(recentHistory(garden, area.id, seasonYear));
    return count + plannedForArea(garden, area.id, seasonYear).filter((planting) => repeatedFamily(planting, families)).length;
  }, 0);
}

/** One entry per plant type, for the map's circles and its legend. */
export function uniquePlanPlants(plantings: PlannedPlanting[]) {
  const plantsByIdentity = new Map<string, PlannedPlanting>();
  for (const planting of plantings) {
    const identity = `${planting.plantType ?? planting.commonName}:${planting.variety ?? ""}`.trim().toLocaleLowerCase();
    plantsByIdentity.set(identity, planting);
  }
  return [...plantsByIdentity.values()];
}

type ColorPlant = { id?: string; commonName: string; plantType?: string; variety?: string };

/**
 * Plant colours for the season page (ADR-0076). A plant already drawn on the Garden Plan
 * keeps exactly the colour the plan gives it; history and planned plants that are not on
 * the plan take a steady colour from the same palette.
 */
export function seasonPlantColors(garden: Pick<Garden, "growingAreas" | "plantings" | "seasonPlans">) {
  const allocations = garden.growingAreas.flatMap((area) => area.layout?.allocations ?? []);
  const records = [...garden.plantings, ...(garden.seasonPlans ?? []).flatMap((plan) => plan.plantings)];
  const families = plantingFamilies(records);
  const onPlan = gardenPlantColors(allocations, plantingFamilies(garden.plantings));
  const asAllocation = (plant: ColorPlant) => ({ label: plant.commonName, plantType: plant.plantType, variety: plant.variety, plantingRecordId: plant.id });
  const everything = gardenPlantColors([...allocations, ...records.map(asAllocation)], families);
  return (plant: ColorPlant): PlantColors => {
    const allocation = asAllocation(plant);
    return onPlan.get(plantColorKey(allocation)) ?? plantColor(allocation, everything, families);
  };
}
