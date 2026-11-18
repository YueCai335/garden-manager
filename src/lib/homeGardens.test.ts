import { describe, expect, it } from "vitest";
import { createDemoGardenWorkspace, createGarden, type Garden, type PlantAllocation } from "./gardenWorkspace";
import { gardenCardSummary, gardenPlants, gardensSummary } from "./homeGardens";
import { gardenPlantColors, plantingFamilies } from "./planAppearance";

const plant = (label: string): PlantAllocation => ({ id: label, label, plantType: label, x: 0.5, y: 0.5, diameterMeters: 0.3 });

function gardenWith(labels: string[], extraAreas = 0): Garden {
  const garden = createDemoGardenWorkspace().gardens[0];
  const [bed] = garden.growingAreas;
  return {
    ...garden,
    growingAreas: [
      { ...bed, layout: { ...bed.layout!, allocations: labels.map(plant) } },
      ...Array.from({ length: extraAreas }, (_, index) => ({ ...bed, id: `unmeasured-${index}`, layout: undefined })),
    ],
  };
}

describe("Gardens home summaries (ADR-0081)", () => {
  it("counts each plant type on the plan once, in the thumbnail's colours", () => {
    const garden = gardenWith(["Kale", "Kale", "Tomato"]);
    const colors = gardenPlantColors(garden.growingAreas[0].layout!.allocations, plantingFamilies(garden.plantings));
    const plants = gardenPlants(garden);
    expect(plants.map(({ name }) => name).sort()).toEqual(["Kale", "Tomato"]);
    for (const { key, colors: shown } of plants) expect(shown).toEqual(colors.get(key));
  });

  it("ignores plants in planting areas without a size, which the thumbnail cannot draw", () => {
    const garden = gardenWith(["Kale"]);
    garden.growingAreas = [{ ...garden.growingAreas[0], layout: undefined }];
    expect(gardenPlants(garden)).toEqual([]);
  });

  it("writes the card line with singulars, missing plants, and areas that need a size", () => {
    expect(gardenCardSummary(createGarden("Empty"))).toBe("Nothing planted yet");
    expect(gardenCardSummary(gardenWith(["Kale"]))).toBe("1 planting area · 1 plant");
    expect(gardenCardSummary(gardenWith([], 1))).toBe("2 planting areas · no plants yet · 1 needs a size");
    expect(gardenCardSummary(gardenWith(["Kale", "Tomato"], 2))).toBe("3 planting areas · 2 plants · 2 need a size");
  });

  it("writes the band totals, leaving out zero counts", () => {
    expect(gardensSummary([])).toBe("Start with one garden. You can add more later.");
    expect(gardensSummary([createGarden("Empty")])).toBe("1 garden");
    expect(gardensSummary([gardenWith([])])).toBe("1 garden · 1 planting area");
    expect(gardensSummary([gardenWith(["Kale"])])).toBe("1 garden · 1 planting area · 1 plant growing");
    expect(gardensSummary([gardenWith(["Kale", "Tomato"]), gardenWith(["Kale"], 1)])).toBe("2 gardens · 3 planting areas · 3 plants growing");
  });
});
