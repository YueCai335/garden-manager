import { describe, expect, it } from "vitest";
import { areaKindDefaults, areasOverlap, defaultAreaName, findFreeAreaSpot, overlappingAreas, resizeLayout, resizedAreaSize } from "./areaPlacement";
import { createRectangularLayout, type GrowingArea } from "./gardenWorkspace";

const area = (id: string, x: number, y: number, width: number, length: number, rotationDegrees = 0): GrowingArea => ({
  id, name: id, kind: "raised-bed", planPlacement: { x, y, rotationDegrees }, layout: createRectangularLayout(width, length),
});
const raised = areaKindDefaults["raised-bed"];

describe("finding a free spot for a new planting area", () => {
  it("starts half a metre in from the top-left corner of an empty garden", () => {
    expect(findFreeAreaSpot({ widthMeters: 10, depthMeters: 6 }, [], raised)).toEqual({ x: 0.5, y: 0.5, widthMeters: 1.2, depthMeters: 2.4, resized: false, overlaps: false });
  });

  it("takes the next free spot in reading order and keeps a walking gap", () => {
    const first = area("first", 0.5, 0.5, 1.2, 2.4);
    const spot = findFreeAreaSpot({ widthMeters: 10, depthMeters: 6 }, [first], raised);
    // 0.5 + 1.2 + 0.3 clearance = 2.0, the next half-metre position.
    expect(spot).toMatchObject({ x: 2, y: 0.5, overlaps: false });
  });

  it("ignores areas without a size and accounts for rotated ones", () => {
    const unsized: GrowingArea = { id: "unsized", name: "Old bed", kind: "raised-bed", planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 } };
    expect(findFreeAreaSpot({ widthMeters: 10, depthMeters: 6 }, [unsized], raised)).toMatchObject({ x: 0.5, y: 0.5 });
    // A 3 × 1 m bed at x = 4 would cover x 4..7; rotated 90° it covers x 3..4 and y 0..3.
    const rotated = area("rotated", 4, 0, 3, 1, 90);
    expect(findFreeAreaSpot({ widthMeters: 6, depthMeters: 6 }, [{ ...rotated, planPlacement: { x: 4, y: 0, rotationDegrees: 0 } }], { widthMeters: 2.5, depthMeters: 1 }))
      .toMatchObject({ x: 0.5, y: 0.5 });
    expect(findFreeAreaSpot({ widthMeters: 6, depthMeters: 6 }, [rotated], { widthMeters: 2.5, depthMeters: 1 })).toMatchObject({ x: 0.5, y: 3.5 });
  });

  it("uses the far edge and then touching positions before giving up", () => {
    // A 2 m garden fits one 1.2 m bed only flush with an edge.
    expect(findFreeAreaSpot({ widthMeters: 2, depthMeters: 3 }, [], raised)).toMatchObject({ x: 0.5, y: 0.5 });
    const left = area("left", 0, 0, 1, 3);
    expect(findFreeAreaSpot({ widthMeters: 2.2, depthMeters: 3 }, [left], { widthMeters: 1.2, depthMeters: 3 })).toMatchObject({ x: 1, y: 0, overlaps: false });
  });

  it("centres the area and reports an overlap when the garden is full", () => {
    const full = area("full", 0, 0, 4, 4);
    expect(findFreeAreaSpot({ widthMeters: 4, depthMeters: 4 }, [full], { widthMeters: 2, depthMeters: 2 }))
      .toEqual({ x: 1, y: 1, widthMeters: 2, depthMeters: 2, resized: false, overlaps: true });
  });

  it("shrinks the area to a garden smaller than the standard size", () => {
    expect(findFreeAreaSpot({ widthMeters: 1, depthMeters: 1.55 }, [], areaKindDefaults.greenhouse))
      .toEqual({ x: 0, y: 0, widthMeters: 1, depthMeters: 1.5, resized: true, overlaps: false });
  });
});

describe("default area names", () => {
  it("numbers names after existing ones without reusing a taken name", () => {
    expect(defaultAreaName("Raised bed", [])).toBe("Raised bed 1");
    expect(defaultAreaName("Raised bed", [{ name: "Raised bed 1" }, { name: "raised bed 2" }, { name: "Raised bed 4" }])).toBe("Raised bed 3");
  });
});

describe("resizing from the corner handle", () => {
  const plan = { widthMeters: 10, depthMeters: 6 };
  it("snaps the size to 0.1 m with a 0.1 m minimum", () => {
    expect(resizedAreaSize({ x: 2.04, y: 1.26 }, area("bed", 1, 1, 1, 1), plan)).toEqual({ widthMeters: 2, depthMeters: 1.3 });
    expect(resizedAreaSize({ x: -1, y: 0.01 }, area("bed", 1, 1, 1, 1), plan)).toEqual({ widthMeters: 0.1, depthMeters: 0.1 });
  });
  it("stops an unrotated area at the garden edge but not a rotated one", () => {
    expect(resizedAreaSize({ x: 20, y: 20 }, area("bed", 8.5, 5, 1, 1), plan)).toEqual({ widthMeters: 1.5, depthMeters: 1 });
    expect(resizedAreaSize({ x: 20, y: 20 }, area("bed", 8.5, 5, 1, 1, 30), plan)).toEqual({ widthMeters: 20, depthMeters: 20 });
  });
  it("keeps plant centres inside a smaller layout", () => {
    const layout = { ...createRectangularLayout(3, 2), allocations: [{ id: "a", label: "Kale", x: 2.6, y: 1.8, diameterMeters: 0.4 }] };
    const next = resizeLayout(layout, { widthMeters: 2, depthMeters: 1 });
    expect(next.boundary).toEqual(createRectangularLayout(2, 1).boundary);
    expect(next.allocations[0]).toMatchObject({ id: "a", x: 2, y: 1 });
  });
});

describe("overlapping areas", () => {
  it("detects overlap but not areas that only touch", () => {
    expect(areasOverlap(area("a", 0, 0, 2, 2), area("b", 1.5, 1, 2, 2))).toBe(true);
    expect(areasOverlap(area("a", 0, 0, 2, 2), area("b", 2, 0, 2, 2))).toBe(false);
    expect(areasOverlap(area("a", 0, 0, 2, 2), area("b", 5, 5, 1, 1))).toBe(false);
  });
  it("uses rotated outlines rather than bounding boxes", () => {
    // A 45° square's bounding box would reach the other area; its outline does not.
    const diamond = area("diamond", 1, 0, 1, 1, 45);
    expect(areasOverlap(diamond, area("corner", 1.4, 0, 0.3, 0.3))).toBe(false);
    expect(areasOverlap(diamond, area("centre", 0.9, 0.5, 0.3, 0.3))).toBe(true);
  });
  it("lists every overlapping pair and skips areas without a size", () => {
    const unsized: GrowingArea = { id: "u", name: "u", kind: "raised-bed", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } };
    const result = overlappingAreas([area("a", 0, 0, 2, 2), area("b", 1, 1, 2, 2), area("c", 8, 0, 1, 1), unsized]);
    expect(result.pairs.map(([first, second]) => [first.id, second.id])).toEqual([["a", "b"]]);
    expect([...result.ids]).toEqual(["a", "b"]);
  });
});
