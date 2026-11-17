import type { Garden } from "./gardenWorkspace";
import { gardenPlantColors, plantingFamilies, plantsInView, plantSwatches, type PlantColors } from "./planAppearance";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The plant types growing in a garden now, in legend order, with the colours its
 * thumbnail draws them in (ADR-0076, ADR-0081). It reads the same data as the
 * thumbnail: the plants placed in measured planting areas. Past seasons and
 * Next Season plans are not on the plan, so they do not count.
 */
export function gardenPlants(garden: Pick<Garden, "growingAreas" | "plantings">): { key: string; name: string; colors: PlantColors }[] {
  const allocations = garden.growingAreas.flatMap((area) => area.layout?.allocations ?? []);
  const families = plantingFamilies(garden.plantings);
  const colors = gardenPlantColors(allocations, families);
  return plantsInView(allocations, families).map((plant) => ({ ...plant, colors: colors.get(plant.key) ?? plantSwatches.coral }));
}

/** A garden card's line under its name: areas, plant types, and areas still without a size. */
export function gardenCardSummary(garden: Pick<Garden, "growingAreas" | "plantings">) {
  const areas = garden.growingAreas.length;
  if (!areas) return "Nothing planted yet";
  const kinds = gardenPlants(garden).length;
  const unmeasured = garden.growingAreas.filter((area) => !area.layout).length;
  return [
    plural(areas, "planting area", "planting areas"),
    kinds ? plural(kinds, "plant", "plants") : "no plants yet",
    ...(unmeasured ? [`${unmeasured} ${unmeasured === 1 ? "needs" : "need"} a size`] : []),
  ].join(" · ");
}

/** The band's totals line on the Gardens home (ADR-0081). Zero counts are left out. */
export function gardensSummary(gardens: Pick<Garden, "growingAreas" | "plantings">[]) {
  if (!gardens.length) return "Start with one garden. You can add more later.";
  const areas = gardens.reduce((sum, garden) => sum + garden.growingAreas.length, 0);
  const plants = gardens.reduce((sum, garden) => sum + gardenPlants(garden).length, 0);
  return [
    plural(gardens.length, "garden", "gardens"),
    ...(areas ? [plural(areas, "planting area", "planting areas")] : []),
    ...(plants ? [plural(plants, "plant growing", "plants growing")] : []),
  ].join(" · ");
}
