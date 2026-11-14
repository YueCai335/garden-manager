import { describe, expect, it } from "vitest";
import { areaLocalToPlan, isInsideArea, planToAreaLocal } from "./planGeometry";
import { createRectangularLayout, type GrowingArea } from "./gardenWorkspace";

const area = (rotationDegrees: number): GrowingArea => ({
  id: "bed", name: "Bed", kind: "raised-bed", planPlacement: { x: 3, y: 2, rotationDegrees }, layout: createRectangularLayout(3, 1.2),
});

describe("plan and area-local coordinates", () => {
  it.each([0, 30, 90, 180, -45])("round-trips local and plan points at %s degrees", (rotation) => {
    for (const point of [{ x: 0, y: 0 }, { x: 0.6, y: 0.6 }, { x: 3, y: 1.2 }, { x: -1, y: 4 }]) {
      const back = planToAreaLocal(area(rotation), areaLocalToPlan(area(rotation), point));
      expect(back.x).toBeCloseTo(point.x);
      expect(back.y).toBeCloseTo(point.y);
    }
  });
  it("rotates clockwise around the area's origin, as Konva draws it", () => {
    const point = areaLocalToPlan(area(90), { x: 1, y: 0 });
    expect(point.x).toBeCloseTo(3);
    expect(point.y).toBeCloseTo(3);
    const local = planToAreaLocal(area(30), areaLocalToPlan(area(30), { x: 2.5, y: 1 }));
    expect(isInsideArea(area(30), local)).toBe(true);
  });
  it("finds whether a local point is inside the area", () => {
    expect(isInsideArea(area(0), { x: 0, y: 0 })).toBe(true);
    expect(isInsideArea(area(0), { x: 3, y: 1.2 })).toBe(true);
    expect(isInsideArea(area(0), { x: 3.01, y: 1 })).toBe(false);
    expect(isInsideArea(area(0), { x: 1, y: -0.01 })).toBe(false);
    expect(isInsideArea({ layout: undefined }, { x: 0, y: 0 })).toBe(false);
  });
});
