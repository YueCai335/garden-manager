import { describe, expect, it } from "vitest";
import { createRectangularLayout, type GrowingArea } from "@/lib/gardenWorkspace";
import {
  allocationCropFamily,
  areaAppearance,
  areaAppearances,
  areaLabelPosition,
  areaSizeText,
  flowerSwatches,
  gardenPlantColors,
  isRectangularLayout,
  planColors,
  plantColor,
  plantColorKey,
  plantingFamilies,
  plantsInView,
  plantSwatches,
  ridgeLine,
} from "@/lib/planAppearance";

const luminance = (hex: string) => {
  const [red, green, blue] = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};
const contrast = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
const viewport = { x: 0, y: 0, widthMeters: 10, depthMeters: 8 };
const area = (overrides: Partial<GrowingArea> = {}): GrowingArea => ({
  id: "bed", name: "Tomato bed", kind: "raised-bed",
  planPlacement: { x: 2, y: 2, rotationDegrees: 0 },
  layout: { ...createRectangularLayout(1.2, 2.4), allocations: [] },
  ...overrides,
});

describe("planting-area appearance", () => {
  it("draws each area type with its own outline", () => {
    const looks = Object.values(areaAppearances);
    expect(new Set(looks.map((look) => look.stroke)).size).toBe(looks.length);
  });

  it("draws the pale planting-chart looks of ADR-0073", () => {
    const raised = areaAppearance("raised-bed");
    const inGround = areaAppearance("in-ground");
    const container = areaAppearance("container");
    const greenhouse = areaAppearance("greenhouse");
    // Raised bed: pale soil inside a thin wood frame, without a dash.
    expect(raised).toMatchObject({ fill: "#f1ece4", stroke: "#8c6a48", shadow: true });
    expect(raised.dash).toBeUndefined();
    expect(raised.strokeWidth).toBeGreaterThan(inGround.strokeWidth);
    // In-ground: a dashed edge and no frame.
    expect(inGround.dash).toEqual([7, 5]);
    // Container: round with a terracotta rim.
    expect(container).toMatchObject({ rounded: true, stroke: "#b5704e" });
    // Greenhouse: pale-blue glass with a ridge line.
    expect(greenhouse.ridge).toBe(true);
    expect(luminance(greenhouse.fill)).toBeGreaterThan(0.8);
    // Every fill stays pale so plant colours read on top of it, and every outline shows against the ground.
    for (const look of Object.values(areaAppearances)) {
      expect(luminance(look.fill)).toBeGreaterThan(0.75);
      expect(contrast(look.stroke, planColors.ground)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses content green for the boundary and the selection", () => {
    expect(planColors.boundary).toBe("#1f4230");
    expect(planColors.selection).toBe("#1f4230");
  });

  it("thins outlines and dashes for thumbnails", () => {
    expect(areaAppearance("raised-bed", true).strokeWidth).toBe(2);
    expect(areaAppearance("in-ground", true)).toMatchObject({ strokeWidth: 1, dash: [3.5, 2.5] });
  });

  it("recognizes generated rectangles and places the greenhouse ridge along the longer side", () => {
    const wide = { ...createRectangularLayout(3, 2), allocations: [] };
    expect(isRectangularLayout(wide)).toBe(true);
    expect(isRectangularLayout({ ...wide, boundary: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 2 }] })).toBe(false);
    expect(ridgeLine(wide)).toEqual([0, 1, 3, 1]);
    expect(ridgeLine({ ...createRectangularLayout(2, 3), allocations: [] })).toEqual([1, 0, 1, 3]);
  });
});

describe("planting-area labels", () => {
  it("places the name above the outline so it never covers plants", () => {
    const label = areaLabelPosition(area(), 40, 30, viewport);
    expect(label.y + 16).toBeLessThanOrEqual(label.top);
    expect(label.sizeY).toBeGreaterThanOrEqual(label.bottom);
  });

  it("keeps the name centred and about as wide as the area, truncating long names", () => {
    const label = areaLabelPosition(area(), 40, 30, viewport);
    expect(label.width).toBe(1.2 * 40 + 16);
    expect(label.x + label.width / 2).toBeCloseTo((label.left + label.right) / 2);
    expect(areaLabelPosition(area({ layout: { ...createRectangularLayout(0.4, 0.4), allocations: [] } }), 40, 30, viewport).width).toBe(48);
    expect(areaLabelPosition(area({ layout: { ...createRectangularLayout(9, 1), allocations: [] } }), 40, 30, viewport).width).toBe(180);
  });

  it("moves the name below the outline when the area touches the top of the view", () => {
    const label = areaLabelPosition(area({ planPlacement: { x: 2, y: 0, rotationDegrees: 0 } }), 40, 8, viewport);
    expect(label.y).toBeGreaterThanOrEqual(label.bottom);
    expect(label.sizeY).toBeGreaterThanOrEqual(label.y + 16);
  });

  it("uses the rotated outline's bounds", () => {
    const label = areaLabelPosition(area({ planPlacement: { x: 4, y: 4, rotationDegrees: 90 } }), 40, 30, viewport);
    expect(label.right - label.left).toBeCloseTo(2.4 * 40);
    expect(label.bottom - label.top).toBeCloseTo(1.2 * 40);
  });

  it("states sizes as width by length", () => {
    expect(areaSizeText({ ...createRectangularLayout(1.2, 2.4), allocations: [] })).toBe("1.2 × 2.4 m");
  });
});

describe("plant colours", () => {
  const swatches = [...Object.values(plantSwatches), ...Object.values(flowerSwatches)];
  const colorsOf = (...labels: string[]) => gardenPlantColors(labels.map((label) => ({ label })));

  it("gives every swatch a light fill and a dark stroke that stays visible", () => {
    expect(new Set(swatches.map(({ fill }) => fill)).size).toBe(swatches.length);
    expect(new Set(swatches.map(({ stroke }) => stroke)).size).toBe(swatches.length);
    for (const { fill, stroke } of swatches) {
      expect(luminance(fill)).toBeGreaterThan(luminance(stroke));
      // A stroke stays visible against its fill, the soil, and the ground (3:1 for graphics).
      for (const background of [fill, areaAppearances["raised-bed"].fill, areaAppearances["in-ground"].fill, planColors.ground])
        expect(contrast(stroke, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the ADR-0073 crop-family colours in the plant ring", () => {
    expect(plantSwatches.coral).toEqual({ fill: "#ebc3b4", stroke: "#a85a42" });
    expect(plantSwatches.blue).toEqual({ fill: "#c9daea", stroke: "#466f9a" });
    expect(plantSwatches.amber).toEqual({ fill: "#f0dcae", stroke: "#8f6d1f" });
    expect(plantSwatches.sea).toEqual({ fill: "#c4ddd4", stroke: "#3f7a68" });
    expect(plantSwatches.lavender).toEqual({ fill: "#dad3ee", stroke: "#6656a0" });
    expect(plantSwatches.pink).toEqual({ fill: "#edcbd9", stroke: "#a04a73" });
    expect(plantSwatches.leaf).toEqual({ fill: "#d3e4bc", stroke: "#5a8236" });
  });

  it("gives plants of the same crop family their own colours", () => {
    const colors = colorsOf("Tomato", "Pepper", "Eggplant");
    expect(colors.get("tomato")).toEqual(plantSwatches.red);
    // Pepper prefers coral, which sits next to Tomato's red, so beside a tomato it turns orange.
    expect(colors.get("pepper")).toEqual(plantSwatches.orange);
    expect(colors.get("eggplant")).toEqual(plantSwatches.plum);
    expect(colorsOf("Pepper", "Eggplant").get("pepper")).toEqual(plantSwatches.coral);
  });

  it("draws flowers in flower colours instead of a shared grey", () => {
    const colors = colorsOf("Panicle hydrangea", "Sunflower", "Marigold", "Meadow sage");
    expect(colors.get("panicle hydrangea")).toEqual(flowerSwatches.pink);
    expect(colors.get("sunflower")).toEqual(flowerSwatches.yellow);
    expect(colors.get("marigold")).toEqual(flowerSwatches.orange);
    expect(colors.get("meadow sage")).toEqual(flowerSwatches.violet);
  });

  it("gives every plant type in a mixed vegetable and flower garden a different colour", () => {
    const gardens = [
      ["Meadow sage", "Pepper", "Lettuce", "Carrot", "Eggplant", "Marigold", "Squash", "Sunflower"],
      ["Eggplant", "Kale", "Cucumber", "Basil", "Bean", "Tomato"],
      ["Panicle hydrangea", "Sunflower", "Marigold"],
    ];
    for (const plants of gardens) {
      const fills = [...colorsOf(...plants).values()].map(({ fill }) => fill);
      expect(new Set(fills).size).toBe(plants.length);
    }
  });

  it("moves the later of two look-alike plants to a clear swatch", () => {
    // Bean and Basil both prefer green; Bean comes first in the list, so Basil moves.
    const colors = colorsOf("Basil", "Bean");
    expect(colors.get("bean")).toEqual(plantSwatches.green);
    expect(colors.get("basil")).not.toEqual(plantSwatches.green);
    // Basil also avoids green's neighbours, which look too close at plant size.
    expect([plantSwatches.leaf, plantSwatches.sea]).not.toContainEqual(colors.get("basil"));
    // Alone, Basil keeps its own swatch.
    expect(colorsOf("Basil").get("basil")).toEqual(plantSwatches.green);
  });

  it("keeps a vegetable off the hue of a flower in the same garden", () => {
    // Sunflower yellow shares its hue with Squash amber, so Squash moves.
    const colors = colorsOf("Squash", "Sunflower");
    expect(colors.get("sunflower")).toEqual(flowerSwatches.yellow);
    expect(colors.get("squash")).not.toEqual(plantSwatches.amber);
    expect(colorsOf("Squash").get("squash")).toEqual(plantSwatches.amber);
  });

  it("does not depend on the order plants were added", () => {
    expect(colorsOf("Basil", "Bean", "Tomato")).toEqual(colorsOf("Tomato", "Bean", "Basil"));
  });

  it("shares one colour across varieties and name spellings of a plant type", () => {
    const colors = gardenPlantColors([
      { label: "Tomato", variety: "Sun Gold" },
      { label: "tomato " },
      { label: "Bed 1", plantType: "Tomato" },
    ]);
    expect(colors.size).toBe(1);
    expect(plantColorKey({ label: "Bed 1", plantType: " Tomato " })).toBe("tomato");
  });

  it("uses the crop family colour for a plant the list does not name", () => {
    expect(colorsOf("Onion").get("onion")).toEqual(plantSwatches.lavender);
    expect(colorsOf("Broccoli").get("broccoli")).toEqual(plantSwatches.blue);
    const families = plantingFamilies([{ id: "record", cropFamily: "root" }]);
    expect(gardenPlantColors([{ label: "Parsnip", plantingRecordId: "record" }], families).get("parsnip")).toEqual(plantSwatches.pink);
  });

  it("gives an unknown plant a steady colour from the plant ring", () => {
    const color = colorsOf("Mystery seedling").get("mystery seedling");
    expect(Object.values(plantSwatches)).toContainEqual(color);
    expect(colorsOf("Mystery seedling").get("mystery seedling")).toEqual(color);
  });

  it("shares a swatch only when a ring is full", () => {
    const flowers = gardenPlantColors(["Marigold", "Sunflower", "Meadow sage", "Panicle hydrangea"].map((label) => ({ label })));
    expect(new Set([...flowers.values()]).size).toBe(4);
    const plants = gardenPlantColors(Array.from({ length: 16 }, (_, index) => ({ label: `Seedling ${index}` })));
    expect(new Set([...plants.values()].map(({ fill }) => fill)).size).toBe(Object.keys(plantSwatches).length);
  });

  it("falls back to a plant's own swatch when the garden map lacks it", () => {
    expect(plantColor({ label: "Tomato" }, new Map())).toEqual(plantSwatches.red);
    expect(plantColor({ label: "Tomato" }, new Map([["tomato", flowerSwatches.blue]]))).toEqual(flowerSwatches.blue);
  });

  it("finds a plant's family from its linked planting record, then from its type name", () => {
    const families = plantingFamilies([{ id: "record", cropFamily: "brassica" }]);
    // A linked record decides, even when the name suggests another family.
    expect(allocationCropFamily({ label: "Tomato", plantingRecordId: "record" }, families)).toBe("brassica");
    expect(allocationCropFamily({ label: "Tomato", plantingRecordId: "missing" }, families)).toBe("nightshade");
    expect(allocationCropFamily({ label: "Bed 1", plantType: "Bush bean" })).toBe("legume");
    expect(allocationCropFamily({ label: "番茄" })).toBe("nightshade");
    expect(allocationCropFamily({ label: "Cherry", plantType: " ", variety: "Sun Gold" })).toBe("nightshade");
    expect(allocationCropFamily({ label: "Basil" })).toBe("other");
  });

  it("lists the plants in view once each, grouped by crop family and then by name", () => {
    expect(plantsInView([
      { label: "Marigold" }, { label: "Tomato" }, { label: "Lettuce" }, { label: "tomato" }, { label: "Bed", plantType: "Eggplant" },
    ])).toEqual([
      { key: "eggplant", name: "Eggplant" },
      { key: "tomato", name: "Tomato" },
      { key: "lettuce", name: "Lettuce" },
      { key: "marigold", name: "Marigold" },
    ]);
    expect(plantsInView([])).toEqual([]);
  });
});
