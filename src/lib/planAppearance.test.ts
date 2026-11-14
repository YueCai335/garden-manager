import { describe, expect, it } from "vitest";
import { createRectangularLayout, type GrowingArea } from "@/lib/gardenWorkspace";
import { areaAppearance, areaAppearances, areaLabelPosition, areaSizeText, isRectangularLayout, ridgeLine } from "@/lib/planAppearance";

const viewport = { x: 0, y: 0, widthMeters: 10, depthMeters: 8 };
const area = (overrides: Partial<GrowingArea> = {}): GrowingArea => ({
  id: "bed", name: "Tomato bed", kind: "raised-bed",
  planPlacement: { x: 2, y: 2, rotationDegrees: 0 },
  layout: { ...createRectangularLayout(1.2, 2.4), allocations: [] },
  ...overrides,
});

describe("planting-area appearance", () => {
  it("draws each area type with its own fill and outline", () => {
    const looks = Object.values(areaAppearances);
    expect(new Set(looks.map((look) => look.fill)).size).toBe(looks.length);
    expect(new Set(looks.map((look) => look.stroke)).size).toBe(looks.length);
  });

  it("separates raised beds from in-ground beds by frame weight, soil tone and edge style", () => {
    const raised = areaAppearance("raised-bed");
    const inGround = areaAppearance("in-ground");
    expect(raised.strokeWidth).toBeGreaterThan(inGround.strokeWidth);
    expect(raised.dash).toBeUndefined();
    expect(inGround.dash).toBeDefined();
    // The raised bed's soil is lighter than the in-ground soil.
    const lightness = (hex: string) => [1, 3, 5].reduce((sum, start) => sum + Number.parseInt(hex.slice(start, start + 2), 16), 0);
    expect(lightness(raised.fill)).toBeGreaterThan(lightness(inGround.fill) + 150);
    expect(areaAppearance("container").rounded).toBe(true);
    expect(areaAppearance("greenhouse").ridge).toBe(true);
  });

  it("thins outlines and dashes for thumbnails", () => {
    expect(areaAppearance("raised-bed", true).strokeWidth).toBe(2);
    expect(areaAppearance("in-ground", true)).toMatchObject({ strokeWidth: 1, dash: [3, 2] });
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
