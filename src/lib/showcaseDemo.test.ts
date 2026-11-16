import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDemoGardenWorkspace,
  createShowcaseWorkspace,
  isDemoGardenId,
  createGarden,
  createSampleGardenWorkspace,
  readGardenWorkspace,
  replaceLegacyDemoGarden,
  todayDate,
} from "@/lib/gardenWorkspace";

const today = "2027-03-10";

const plantTypes = (gardenIndex: number) =>
  [...new Set(createShowcaseWorkspace(today).gardens[gardenIndex].growingAreas.flatMap((area) => area.layout!.allocations.map((plant) => plant.plantType)))];

describe("showcase demo (ADR-0077)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("opens on three gardens for three kinds of place", () => {
    const workspace = createShowcaseWorkspace(today);
    expect(workspace.gardens.map((garden) => garden.name)).toEqual(["Backyard", "Community Garden", "Front Yard"]);
    expect(workspace.selectedGardenId).toBe("demo-backyard");
    expect(workspace.gardens.map((garden) => garden.growingAreas.length)).toEqual([10, 6, 3]);
  });

  it("grows vegetables at home, a shared plot of crops, and flowers out front", () => {
    expect(plantTypes(0)).toEqual(["Pepper", "Meadow sage", "Lettuce", "Carrot", "Eggplant", "Marigold", "Sunflower", "Squash"]);
    expect(plantTypes(1)).toEqual(["Eggplant", "Kale", "Cucumber", "Bean", "Basil", "Tomato"]);
    expect(plantTypes(2)).toEqual(["Panicle hydrangea", "Sunflower", "Marigold"]);
  });

  it("counts planting dates and care from the visitor's today", () => {
    const workspace = createShowcaseWorkspace(today);
    const dates = new Set(workspace.gardens.flatMap((garden) => garden.plantings.map((planting) => planting.plantingDate)));
    expect([...dates].sort()).toEqual(["2027-03-09", "2027-03-10"]);
    expect(workspace.careTasks).toEqual([
      { id: "demo-fertilize-all-gardens", type: "fertilizing", dueDate: "2027-03-14", note: "", targetScope: "all-gardens", repeatIntervalDays: 7 },
    ]);
  });

  it("links every plant to a planting record that counts it", () => {
    for (const garden of createShowcaseWorkspace(today).gardens) {
      for (const planting of garden.plantings) {
        const plants = garden.growingAreas.flatMap((area) => area.layout!.allocations).filter((plant) => plant.plantingRecordId === planting.id);
        expect(plants.length).toBe(planting.quantity);
        expect(garden.growingAreas.find((area) => area.id === planting.growingAreaId)).toBeDefined();
      }
    }
    const tomato = createShowcaseWorkspace(today).gardens[1].plantings.find((planting) => planting.commonName === "Tomato");
    expect(tomato).toMatchObject({ cropFamily: "nightshade", quantity: 2, isActive: true });
  });

  it("keeps every plant inside its area and every area inside its garden", () => {
    for (const garden of createShowcaseWorkspace(today).gardens) {
      for (const area of garden.growingAreas) {
        const { widthMeters, depthMeters, allocations } = area.layout!;
        for (const plant of allocations) {
          expect(plant.x).toBeGreaterThanOrEqual(0);
          expect(plant.x).toBeLessThanOrEqual(widthMeters);
          expect(plant.y).toBeGreaterThanOrEqual(0);
          expect(plant.y).toBeLessThanOrEqual(depthMeters);
        }
        expect(area.planPlacement.x).toBeLessThan(garden.plan.widthMeters);
        expect(area.planPlacement.y).toBeLessThan(garden.plan.depthMeters);
      }
    }
  });

  it("uses unique IDs across the whole demo", () => {
    const workspace = createShowcaseWorkspace(today);
    const ids = workspace.gardens.flatMap((garden) => [
      garden.id,
      ...garden.growingAreas.map((area) => area.id),
      ...garden.growingAreas.flatMap((area) => area.layout!.allocations.map((plant) => plant.id)),
      ...garden.plantings.map((planting) => planting.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("survives saving and reading back unchanged", () => {
    // Read on the real today: plantings dated after it would count as next season's plan.
    const workspace = createShowcaseWorkspace(todayDate());
    expect(readGardenWorkspace(JSON.stringify(workspace))).toEqual(workspace);
  });

  it("recognizes demo gardens, so the gardens list can hide them beside the user's own", () => {
    for (const garden of createShowcaseWorkspace(today).gardens) expect(isDemoGardenId(garden.id)).toBe(true);
    expect(isDemoGardenId("demo-garden")).toBe(true);
    expect(isDemoGardenId("a1bee09d-c1cb-4b9e-9e80-80f058c77ff0")).toBe(false);
  });

  it("gives tests the sample garden and everyone else the showcase", () => {
    expect(createDemoGardenWorkspace(today).gardens.map((garden) => garden.id)).toEqual(["demo-garden"]);
    vi.stubEnv("NEXT_PUBLIC_DEMO_FIXTURE", "");
    expect(createDemoGardenWorkspace(today)).toEqual(createShowcaseWorkspace(today));
  });

  describe("swapping the old sample demo", () => {
    beforeEach(() => vi.stubEnv("NEXT_PUBLIC_DEMO_FIXTURE", ""));

    it("turns a workspace holding only the old demo into the showcase", () => {
      expect(replaceLegacyDemoGarden(createSampleGardenWorkspace(), today)).toEqual(createShowcaseWorkspace(today));
    });

    it("also replaces an old demo that sits beside showcase gardens and nothing else", () => {
      const sample = createSampleGardenWorkspace();
      const mixed = { ...sample, gardens: [...sample.gardens, ...createShowcaseWorkspace("2026-01-01").gardens] };
      expect(replaceLegacyDemoGarden(mixed, today)).toEqual(createShowcaseWorkspace(today));
    });

    it("removes only the old demo when the user has gardens of their own", () => {
      const sample = createSampleGardenWorkspace();
      const own = createGarden("Back garden");
      const workspace = { ...sample, careTasks: [], gardens: [...sample.gardens, own] };
      expect(replaceLegacyDemoGarden(workspace, today)).toEqual({ ...workspace, selectedGardenId: own.id, gardens: [own] });
      const selectedOwn = { ...workspace, selectedGardenId: own.id };
      expect(replaceLegacyDemoGarden(selectedOwn, today).selectedGardenId).toBe(own.id);
    });

    it("leaves a workspace without the old demo untouched", () => {
      const showcase = createShowcaseWorkspace(today);
      expect(replaceLegacyDemoGarden(showcase, "2030-01-01")).toBe(showcase);
    });

    it("does nothing while tests use the sample fixture", () => {
      vi.stubEnv("NEXT_PUBLIC_DEMO_FIXTURE", "sample");
      const sample = createSampleGardenWorkspace();
      expect(replaceLegacyDemoGarden(sample, today)).toBe(sample);
    });
  });
});
