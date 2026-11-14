import { describe, expect, it } from "vitest";
import { createRectangularLayout, type GrowingAreaLayout, type PlantAllocation } from "./gardenWorkspace";
import { arePlantsCrowded, fillPositions, FILL_LIMIT, plantCenterInArea, plantGroups, plantReachesPastEdge, plantWarnings } from "./plantLayout";
import { suggestedPlantSpacing } from "./plantSpacing";

const plant = (id: string, x: number, y: number, diameterMeters = 0.4, extra: Partial<PlantAllocation> = {}): PlantAllocation => ({ id, label: "Basil", x, y, diameterMeters, ...extra });
const layout = (allocations: PlantAllocation[] = [], width = 2, length = 1): GrowingAreaLayout => ({ ...createRectangularLayout(width, length), allocations });

describe("crowding and edge warnings", () => {
  it("marks plants closer than 85 % of their average spacing", () => {
    expect(arePlantsCrowded(plant("a", 0, 0), plant("b", 0.33, 0))).toBe(true);
    expect(arePlantsCrowded(plant("a", 0, 0), plant("b", 0.34, 0))).toBe(false);
    expect(arePlantsCrowded(plant("a", 0, 0, 0.2), plant("b", 0.3, 0, 0.6))).toBe(true);
    expect(arePlantsCrowded(plant("a", 0, 0, 0.2), plant("b", 0.4, 0, 0.6))).toBe(false);
  });
  it("lists each crowded pair once and every plant reaching past the edge", () => {
    const warnings = plantWarnings(layout([plant("a", 0.3, 0.5), plant("b", 0.5, 0.5), plant("c", 1.6, 0.5), plant("d", 1.8, 0.7, 0.6)]));
    expect(warnings.crowdedPairs).toEqual([["a", "b"], ["c", "d"]]);
    expect([...warnings.crowdedIds]).toEqual(["a", "b", "c", "d"]);
    expect([...warnings.pastEdgeIds]).toEqual(["d"]);
  });
  it("allows a circle to touch the edge and tolerates grid rounding", () => {
    expect(plantReachesPastEdge(plant("a", 0.2, 0.2), { widthMeters: 2, depthMeters: 1 })).toBe(false);
    expect(plantReachesPastEdge(plant("a", 0.2, 0.2, 0.5), { widthMeters: 2, depthMeters: 1 })).toBe(false);
    expect(plantReachesPastEdge(plant("a", 0.1, 0.5, 0.5), { widthMeters: 2, depthMeters: 1 })).toBe(true);
  });
});

describe("placing a plant", () => {
  it("snaps to the grid and keeps the spacing circle inside the area", () => {
    expect(plantCenterInArea({ x: 1.23, y: 0.47 }, 0.4, { widthMeters: 2, depthMeters: 1 })).toEqual({ x: 1.2, y: 0.5 });
    expect(plantCenterInArea({ x: 0.02, y: 0.98 }, 0.4, { widthMeters: 2, depthMeters: 1 })).toEqual({ x: 0.2, y: 0.8 });
    expect(plantCenterInArea({ x: 0, y: 0 }, 0.5, { widthMeters: 2, depthMeters: 1 })).toEqual({ x: 0.3, y: 0.3 });
  });
  it("centres a plant wider than the area", () => {
    expect(plantCenterInArea({ x: 0.1, y: 0.1 }, 1.2, { widthMeters: 3, depthMeters: 1 })).toEqual({ x: 0.6, y: 0.5 });
  });
});

describe("filling an area", () => {
  it("centres a grid at the plant's spacing", () => {
    const { positions, truncated } = fillPositions(layout([], 2, 1), 0.5);
    expect(truncated).toBe(false);
    expect(positions).toEqual([
      { x: 0.3, y: 0.3 }, { x: 0.8, y: 0.3 }, { x: 1.3, y: 0.3 }, { x: 1.8, y: 0.3 },
      { x: 0.3, y: 0.8 }, { x: 0.8, y: 0.8 }, { x: 1.3, y: 0.8 }, { x: 1.8, y: 0.8 },
    ]);
    const filled = layout(positions.map((point, index) => plant(String(index), point.x, point.y, 0.5)), 2, 1);
    expect(plantWarnings(filled)).toEqual({ crowdedPairs: [], crowdedIds: new Set(), pastEdgeIds: new Set() });
  });
  it("skips spots next to existing plants", () => {
    const existing = plant("tomato", 0.3, 0.3, 0.6);
    const { positions } = fillPositions(layout([existing], 2, 1), 0.4);
    expect(positions.length).toBeGreaterThan(0);
    for (const point of positions) expect(arePlantsCrowded({ ...point, diameterMeters: 0.4 }, existing)).toBe(false);
  });
  it(`stops at ${FILL_LIMIT} plants and reports that it stopped`, () => {
    const result = fillPositions(layout([], 10, 10), 0.1);
    expect(result.positions).toHaveLength(FILL_LIMIT);
    expect(result.truncated).toBe(true);
  });
  it("places nothing in a full area", () => {
    expect(fillPositions(layout([plant("a", 0.5, 0.5, 1)], 1, 1), 0.5)).toEqual({ positions: [], truncated: false });
  });
});

describe("plant groups and suggested spacing", () => {
  it("groups plants by type and variety", () => {
    expect(plantGroups(layout([
      plant("a", 0, 0, 0.4, { label: "Tomato · Sun Gold", plantType: "Tomato", variety: "Sun Gold" }),
      plant("b", 1, 0, 0.4, { label: "Tomato · Sun Gold", plantType: "tomato", variety: "sun gold" }),
      plant("c", 0, 1, 0.4, { label: "Basil", plantType: "Basil" }),
    ]))).toEqual([{ label: "Tomato · Sun Gold", count: 2 }, { label: "Basil", count: 1 }]);
  });
  it("suggests sourced spacing for known plants by alias and nothing for unknown ones", () => {
    expect(suggestedPlantSpacing("番茄")).toMatchObject({ plantType: "Tomato", metres: 0.5, inches: 18 });
    expect(suggestedPlantSpacing("Cucumber")?.metres).toBe(1.2);
    expect(suggestedPlantSpacing("carrots")?.metres).toBe(0.1);
    expect(suggestedPlantSpacing("Basil")).toBeUndefined();
    expect(suggestedPlantSpacing("Moonflower")).toBeUndefined();
  });
});
