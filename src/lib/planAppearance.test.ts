import { describe, expect, it } from "vitest";
import { createRectangularLayout, plantingCropFamilies, type GrowingArea } from "@/lib/gardenWorkspace";
import {
  allocationCropFamily,
  areaAppearance,
  areaAppearances,
  areaLabelPosition,
  areaSizeText,
  cropFamilyColor,
  cropFamilyColors,
  cropFamilyLegendLabels,
  familiesInView,
  isRectangularLayout,
  planColors,
  plantingFamilies,
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
const saturation = (hex: string) => {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
  return Math.max(...channels) - Math.min(...channels);
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

describe("crop-family plant colours", () => {
  it("gives every crop family its own light fill and dark stroke", () => {
    expect(Object.keys(cropFamilyColors).sort()).toEqual([...plantingCropFamilies].sort());
    const families = plantingCropFamilies.map(cropFamilyColor);
    expect(new Set(families.map(({ fill }) => fill)).size).toBe(families.length);
    expect(new Set(families.map(({ stroke }) => stroke)).size).toBe(families.length);
    for (const { fill, stroke } of families) {
      expect(luminance(fill)).toBeGreaterThan(luminance(stroke));
      // A stroke stays visible against its fill, the soil, and the ground (3:1 for graphics).
      for (const background of [fill, areaAppearances["raised-bed"].fill, areaAppearances["in-ground"].fill, planColors.ground])
        expect(contrast(stroke, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it.each([
    ["nightshade", "#ebc3b4", "#a85a42"],
    ["brassica", "#c9daea", "#466f9a"],
    ["cucurbit", "#f0dcae", "#8f6d1f"],
    ["legume", "#c4ddd4", "#3f7a68"],
    ["allium", "#dad3ee", "#6656a0"],
    ["root", "#edcbd9", "#a04a73"],
    ["leafy", "#d3e4bc", "#5a8236"],
  ] as const)("colours %s plants", (family, fill, stroke) => {
    expect(cropFamilyColor(family)).toEqual({ fill, stroke });
  });

  it("draws plants of an unknown family in a neutral Other", () => {
    const other = cropFamilyColor("other");
    expect(other).toEqual({ fill: "#e6e6e4", stroke: "#77777b" });
    expect(saturation(other.fill)).toBeLessThanOrEqual(4);
    expect(saturation(other.stroke)).toBeLessThanOrEqual(4);
    expect(cropFamilyLegendLabels.other).toBe("Other");
    expect(allocationCropFamily({ label: "Basil" })).toBe("other");
    expect(allocationCropFamily({ label: "Mystery seedling" })).toBe("other");
  });

  it("finds a plant's family from its linked planting record, then from its type name", () => {
    const families = plantingFamilies([{ id: "record", cropFamily: "brassica" }]);
    // A linked record decides, even when the name suggests another family.
    expect(allocationCropFamily({ label: "Tomato", plantingRecordId: "record" }, families)).toBe("brassica");
    expect(allocationCropFamily({ label: "Tomato", plantingRecordId: "missing" }, families)).toBe("nightshade");
    expect(allocationCropFamily({ label: "Bed 1", plantType: "Bush bean" })).toBe("legume");
    expect(allocationCropFamily({ label: "番茄" })).toBe("nightshade");
    expect(allocationCropFamily({ label: "Cherry", plantType: " ", variety: "Sun Gold" })).toBe("nightshade");
  });

  it("lists only the families in view, in the standard order", () => {
    expect(familiesInView(["other", "legume", "nightshade", "legume"])).toEqual(["nightshade", "legume", "other"]);
    expect(familiesInView([])).toEqual([]);
  });
});
