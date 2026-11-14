import { knownPlantType, snapToGrid } from "@/lib/gardenWorkspace";

/**
 * Suggested in-row spacing for common plants, used to pre-fill the spacing
 * field. The user can always change it (ADR-0072, phase G3).
 *
 * Source for every value: University of Missouri Extension, "Vegetable
 * Planting Calendar", publication G6201 (revised October 2017), Table 1,
 * column "Distance between plants in row (inches)":
 * https://extension.missouri.edu/publications/g6201
 * Cross-checked against University of Maine Cooperative Extension, "Planting
 * Chart for the Home Vegetable Garden" (Lois Stack):
 * https://extension.umaine.edu/gardening/?p=8170
 *
 * The canvas draws each plant as a circle whose diameter is its spacing, so
 * the in-row distance becomes the circle diameter. Metres are rounded to the
 * 0.1 m layout grid, and the grid's 0.1 m minimum applies to crops sown a few
 * inches apart. Plants missing from both tables (basil and the ornamentals)
 * have no suggestion.
 */
export const plantSpacingSuggestions: Record<string, { inches: number; note: string }> = {
  Tomato: { inches: 18, note: "staked; 36 in when left on the ground" },
  Pepper: { inches: 18, note: "" },
  Eggplant: { inches: 24, note: "" },
  Squash: { inches: 48, note: "summer squash hills; winter squash 60 in" },
  Bean: { inches: 3, note: "bush snap bean" },
  Pea: { inches: 2, note: "" },
  Lettuce: { inches: 6, note: "head lettuce; leaf lettuce 3 in" },
  Kale: { inches: 8, note: "" },
  Cucumber: { inches: 48, note: "hills" },
  Carrot: { inches: 3, note: "" },
};

export const plantSpacingSource = "University of Missouri Extension G6201";

/** Suggested spacing in metres for a known plant type, or undefined. */
export function suggestedPlantSpacing(plantType: string | undefined) {
  const known = knownPlantType(plantType);
  const entry = known ? plantSpacingSuggestions[known] : undefined;
  if (!entry) return undefined;
  return { metres: Math.max(0.1, snapToGrid(entry.inches * 0.0254)), plantType: known!, inches: entry.inches, note: entry.note };
}
