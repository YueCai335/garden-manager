import { describe, expect, it } from "vitest";
import { createRectangularLayout, type GrowingArea } from "@/lib/gardenWorkspace";
import {
  advanceSetup, gardenDetailsErrors, goToStep, minimumGardenSize, parseGuidedSetup, resizedGardenSize, setupSummary, setupTrack, startSetup,
} from "@/lib/guidedSetup";

const area = (x: number, y: number, width: number, length: number, rotationDegrees = 0): GrowingArea => ({
  id: `area-${x}-${y}`, name: "Bed", kind: "raised-bed", planPlacement: { x, y, rotationDegrees }, layout: createRectangularLayout(width, length),
});

describe("guided setup steps", () => {
  it("starts at Garden size and continues one step at a time, stopping at Ready", () => {
    let setup = startSetup("garden-1");
    expect(setup).toEqual({ gardenId: "garden-1", step: "size", reached: "size" });
    setup = advanceSetup(setup);
    setup = advanceSetup(setup);
    setup = advanceSetup(setup);
    expect(setup).toMatchObject({ step: "ready", reached: "ready" });
    expect(advanceSetup(setup)).toBe(setup);
  });

  it("returns to reached steps and never skips ahead to a step not reached", () => {
    const atPlants = advanceSetup(advanceSetup(startSetup("g")));
    const back = goToStep(atPlants, "size");
    expect(back).toMatchObject({ step: "size", reached: "plants" });
    expect(goToStep(back, "plants")).toMatchObject({ step: "plants" });
    expect(goToStep(back, "ready")).toBe(back);
    // Continuing from an earlier step keeps the furthest step reached.
    expect(advanceSetup(back)).toMatchObject({ step: "areas", reached: "plants" });
  });

  it("marks completed, current, reached, and locked steps, and only reached ones are clickable", () => {
    expect(setupTrack({ step: "areas", reached: "areas" }).map(({ status, clickable }) => [status, clickable])).toEqual([
      ["complete", true], ["current", false], ["locked", false], ["locked", false],
    ]);
    expect(setupTrack({ step: "size", reached: "plants" }).map(({ status, clickable }) => [status, clickable])).toEqual([
      ["current", false], ["complete", true], ["available", true], ["locked", false],
    ]);
    expect(setupTrack({ step: "ready", reached: "ready" }).map(({ label, number }) => `${number} ${label}`)).toEqual([
      "1 Garden size", "2 Planting areas", "3 Plants", "4 Ready",
    ]);
  });

  it("reads only a well-formed stored guide", () => {
    expect(parseGuidedSetup(JSON.stringify({ gardenId: "g", step: "areas", reached: "plants" }))).toEqual({ gardenId: "g", step: "areas", reached: "plants" });
    expect(parseGuidedSetup(null)).toBeUndefined();
    expect(parseGuidedSetup("{not json")).toBeUndefined();
    expect(parseGuidedSetup(JSON.stringify({ gardenId: "g", step: "fly", reached: "ready" }))).toBeUndefined();
    expect(parseGuidedSetup(JSON.stringify({ gardenId: "g", step: "ready", reached: "size" }))).toBeUndefined();
  });
});

describe("garden size limits", () => {
  it("is the outer extent of the sized areas, rotated outlines included, rounded up to 0.1 m", () => {
    expect(minimumGardenSize([])).toEqual({ widthMeters: 0.1, depthMeters: 0.1 });
    expect(minimumGardenSize([area(0.5, 0, 1.2, 2.4), area(3, 1, 2, 0.5)])).toEqual({ widthMeters: 5, depthMeters: 2.4 });
    // A 2 × 1 m bed turned 90° about its top-left corner reaches 1 m to the left and 2 m down.
    expect(minimumGardenSize([area(4, 1, 2, 1, 90)])).toEqual({ widthMeters: 4, depthMeters: 3 });
    expect(minimumGardenSize([{ ...area(0, 0, 1, 1), layout: undefined }])).toEqual({ widthMeters: 0.1, depthMeters: 0.1 });
  });

  it("snaps a dragged corner to 0.1 m and keeps it outside the areas", () => {
    expect(resizedGardenSize({ x: 7.26, y: 3.04 }, { widthMeters: 0.1, depthMeters: 0.1 })).toEqual({ widthMeters: 7.3, depthMeters: 3 });
    expect(resizedGardenSize({ x: 1, y: -2 }, { widthMeters: 5, depthMeters: 2.4 })).toEqual({ widthMeters: 5, depthMeters: 2.4 });
  });

  it("reports an empty name, sizes under 0.1 m, and sizes smaller than the areas", () => {
    const minimum = { widthMeters: 5, depthMeters: 2.4 };
    expect(gardenDetailsErrors({ name: " ", width: "-1", depth: "" }, minimum)).toEqual({
      name: "Enter garden name.", width: "Enter a value of at least 0.1.", depth: "Enter a value of at least 0.1.",
    });
    expect(gardenDetailsErrors({ name: "Plot", width: "4", depth: "2" }, minimum)).toEqual({
      width: "Make the garden at least 5 m wide to hold its planting areas.", depth: "Make the garden at least 2.4 m long to hold its planting areas.",
    });
    expect(gardenDetailsErrors({ name: "", width: "5", depth: "2.4" }, minimum, false)).toEqual({});
  });
});

it("counts areas, placed plants, and active plant groups for Ready", () => {
  const bed = area(0, 0, 1, 1);
  bed.layout!.allocations = [{ id: "p1", label: "Kale", x: 0.5, y: 0.5, diameterMeters: 0.3 }, { id: "p2", label: "Kale", x: 0.2, y: 0.2, diameterMeters: 0.3 }];
  const plantings = [
    { id: "r1", commonName: "Kale", cropFamily: "brassica", quantity: 2, plantingDate: "2026-05-01", growingAreaId: bed.id, isActive: true },
    { id: "r2", commonName: "Peas", cropFamily: "legume", quantity: 1, plantingDate: "2025-05-01", growingAreaId: bed.id, isActive: false },
  ] as const;
  expect(setupSummary({ growingAreas: [bed, { ...area(2, 2, 1, 1), layout: undefined }], plantings: [...plantings] })).toEqual({ areas: 2, plants: 2, plantGroups: 1 });
});
