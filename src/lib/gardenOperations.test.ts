import { describe, expect, it } from "vitest";

import {
  createGarden,
  createGardenWorkspace,
  type CareEvent,
  type CareTask,
  type Garden,
  type HealthRecord,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";
import {
  addSeasonPlanPlanting,
  archivePlanting,
  removeGarden,
  removeGrowingArea,
  removeSeasonPlanPlanting,
} from "@/lib/gardenOperations";

function gardenWithArea(): Garden {
  const garden = createGarden("Test garden");
  return {
    ...garden,
    growingAreas: [
      { id: "area-1", name: "Bed 1", kind: "raised-bed", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } },
      { id: "area-2", name: "Bed 2", kind: "raised-bed", planPlacement: { x: 1, y: 0, rotationDegrees: 0 } },
    ],
  };
}

const planting = (id: string, growingAreaId: string): PlantingRecord => ({
  id,
  commonName: "Tomato",
  cropFamily: "nightshade",
  growingAreaId,
  quantity: 1,
  plantingDate: "2026-05-01",
  isActive: true,
});

describe("removeGrowingArea", () => {
  it("removes the area and its planting records", () => {
    const garden = { ...gardenWithArea(), plantings: [planting("p-1", "area-1"), planting("p-2", "area-2")] };
    const result = removeGrowingArea(garden, "area-1");
    expect(result.growingAreas.map((area) => area.id)).toEqual(["area-2"]);
    expect(result.plantings.map((item) => item.id)).toEqual(["p-2"]);
  });

  it("drops next-season plan entries that point at the deleted area", () => {
    const garden: Garden = {
      ...gardenWithArea(),
      seasonPlans: [
        {
          id: "plan-2027",
          seasonYear: 2027,
          plantings: [
            { id: "pp-1", commonName: "Kale", cropFamily: "brassica", growingAreaId: "area-1" },
            { id: "pp-2", commonName: "Bean", cropFamily: "legume", growingAreaId: "area-2" },
          ],
        },
      ],
    };
    const result = removeGrowingArea(garden, "area-1");
    expect(result.seasonPlans).toEqual([
      {
        id: "plan-2027",
        seasonYear: 2027,
        plantings: [{ id: "pp-2", commonName: "Bean", cropFamily: "legume", growingAreaId: "area-2" }],
      },
    ]);
  });

  it("removes a season plan entirely once it has no plantings left", () => {
    const garden: Garden = {
      ...gardenWithArea(),
      seasonPlans: [
        { id: "plan-2027", seasonYear: 2027, plantings: [{ id: "pp-1", commonName: "Kale", cropFamily: "brassica", growingAreaId: "area-1" }] },
      ],
    };
    expect(removeGrowingArea(garden, "area-1").seasonPlans).toEqual([]);
  });

  it("keeps care and health history but flags the deleted target", () => {
    const areaEvent: CareEvent = { id: "e-1", type: "watering", date: "2026-05-02", note: "", targetScope: "planting-area", growingAreaId: "area-1", growingAreaName: "Bed 1" };
    const plantEvent: CareEvent = { id: "e-2", type: "watering", date: "2026-05-02", note: "", targetScope: "plant-group", plantingRecordId: "p-1", plantingRecordName: "Tomato" };
    const otherEvent: CareEvent = { id: "e-3", type: "watering", date: "2026-05-02", note: "", targetScope: "garden" };
    const task: CareTask = { id: "t-1", type: "watering", dueDate: "2026-05-09", note: "", targetScope: "planting-area", growingAreaId: "area-1", growingAreaName: "Bed 1" };
    const record: HealthRecord = { id: "h-1", observedOn: "2026-05-03", symptoms: "wilting", severity: "low", targetScope: "plant-group", plantingRecordId: "p-1", plantingRecordName: "Tomato", photoPaths: [] };
    const garden: Garden = {
      ...gardenWithArea(),
      plantings: [planting("p-1", "area-1")],
      careEvents: [areaEvent, plantEvent, otherEvent],
      careTasks: [task],
      healthRecords: [record],
    };
    const result = removeGrowingArea(garden, "area-1");
    expect(result.careEvents).toEqual([
      { ...areaEvent, targetAreaDeleted: true },
      { ...plantEvent, targetPlantingRecordDeleted: true },
      otherEvent,
    ]);
    expect(result.careTasks).toEqual([{ ...task, targetAreaDeleted: true }]);
    expect(result.healthRecords).toEqual([{ ...record, targetPlantingRecordDeleted: true }]);
  });
});

describe("removeGarden", () => {
  it("selects the first remaining garden", () => {
    const workspace = createGardenWorkspace("First");
    const second = createGarden("Second");
    const full = { ...workspace, gardens: [...workspace.gardens, second], selectedGardenId: second.id };
    const result = removeGarden(full, second.id);
    expect(result?.gardens.map((garden) => garden.name)).toEqual(["First"]);
    expect(result?.selectedGardenId).toBe(workspace.gardens[0].id);
  });

  it("returns undefined when the last garden is removed", () => {
    const workspace = createGardenWorkspace("Only");
    expect(removeGarden(workspace, workspace.gardens[0].id)).toBeUndefined();
  });
});

describe("archivePlanting", () => {
  it("marks only the matching planting inactive", () => {
    const garden = { ...gardenWithArea(), plantings: [planting("p-1", "area-1"), planting("p-2", "area-2")] };
    const result = archivePlanting(garden, "p-1");
    expect(result.plantings.map((item) => item.isActive)).toEqual([false, true]);
  });
});

describe("season plan plantings", () => {
  it("creates the plan for the year when none exists, then appends to it", () => {
    const garden = gardenWithArea();
    const once = addSeasonPlanPlanting(garden, 2027, { id: "pp-1", commonName: "Kale", plantType: "Kale", cropFamily: "brassica", growingAreaId: "area-1" });
    expect(once.seasonPlans).toHaveLength(1);
    expect(once.seasonPlans?.[0].seasonYear).toBe(2027);
    const twice = addSeasonPlanPlanting(once, 2027, { id: "pp-2", commonName: "Bean", plantType: "Bean", cropFamily: "legume", growingAreaId: "area-2" });
    expect(twice.seasonPlans).toHaveLength(1);
    expect(twice.seasonPlans?.[0].plantings.map((item) => item.id)).toEqual(["pp-1", "pp-2"]);
  });

  it("removes a planting and drops the plan when it becomes empty", () => {
    const garden = addSeasonPlanPlanting(gardenWithArea(), 2027, { id: "pp-1", commonName: "Kale", plantType: "Kale", cropFamily: "brassica", growingAreaId: "area-1" });
    expect(removeSeasonPlanPlanting(garden, 2027, "pp-1").seasonPlans).toEqual([]);
  });
});
