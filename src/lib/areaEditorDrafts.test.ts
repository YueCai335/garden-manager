import { describe, expect, it } from "vitest";
import { applyAreaProperties, areaProperties, areaPropertyErrors, sameAreaProperties } from "@/lib/areaEditorDrafts";
import { createDemoGardenWorkspace } from "@/lib/gardenWorkspace";

describe("area property merge", () => {
  it("preserves the latest plants and clamps persisted positions only when shrinking", () => {
    const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const values = { ...areaProperties(area), name: "New name", length: "1", width: "1", rotation: "450" };
    const latest = { ...area, layout: { ...area.layout!, allocations: [...area.layout!.allocations, { id: "new", label: "Kale", x: 2, y: 1.5, diameterMeters: 0.3 }] } };
    const result = applyAreaProperties(latest, values, { widthMeters: 10, depthMeters: 6 });
    expect(result.layout!.allocations).toHaveLength(latest.layout.allocations.length);
    expect(result.layout!.allocations.at(-1)).toMatchObject({ id: "new", label: "Kale", x: 1, y: 1 });
    expect(result.planPlacement.rotationDegrees).toBe(90);
    expect(latest.layout.allocations.at(-1)).toMatchObject({ x: 2, y: 1.5 });
  });
  it("maps width to the left-right size and length to the top-bottom size", () => {
    const area = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const values = areaProperties(area);
    expect(values.width).toBe(String(area.layout!.widthMeters));
    expect(values.length).toBe(String(area.layout!.depthMeters));
    const result = applyAreaProperties(area, { ...values, width: "2.4", length: "1.2" }, { widthMeters: 10, depthMeters: 6 });
    expect(result.layout).toMatchObject({ widthMeters: 2.4, depthMeters: 1.2 });
    expect(areaPropertyErrors({ ...values, width: "0" })).toEqual({ width: "Enter a width of at least 0.1 metres." });
    expect(areaPropertyErrors({ ...values, length: "0" })).toEqual({ length: "Enter a length of at least 0.1 metres." });
  });
  it("compares normalized values and rejects blank numeric fields", () => {
    const values = areaProperties(createDemoGardenWorkspace().gardens[0].growingAreas[0]);
    expect(sameAreaProperties(values, { ...values, name: ` ${values.name} `, length: Number(values.length).toFixed(2), rotation: String(Number(values.rotation) + 360) })).toBe(true);
    expect(areaPropertyErrors({ ...values, length: "", width: "-1", rotation: "" })).toHaveProperty("rotation");
    expect(areaPropertyErrors({ ...values, name: "园".repeat(200), length: "2.5" })).toEqual({});
  });
});

it("shares clamping and 0.1m snapping between saved area positions and canvas dragging", () => {
  const garden = createDemoGardenWorkspace().gardens[0];
  const area = garden.growingAreas[0];
  const result = applyAreaProperties(area, { ...areaProperties(area), x: "2.34", y: "1.27" }, garden.plan);
  expect(result.planPlacement).toEqual({ x: 2.3, y: 1.3, rotationDegrees: 0 });
  expect(result.layout!.allocations).toEqual(area.layout!.allocations);
  expect(() => applyAreaProperties(area, { ...areaProperties(area), x: "100" }, garden.plan)).toThrow("Invalid planting-area properties");
});
