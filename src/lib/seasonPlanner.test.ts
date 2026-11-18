import { describe, expect, it } from "vitest";

import { createSampleGardenWorkspace, type Garden, type PlantingRecord } from "@/lib/gardenWorkspace";
import { gardenPlantColors, plantingFamilies } from "@/lib/planAppearance";
import {
  companionNotes,
  historyBySeason,
  latestFamilyYear,
  plannedAreaCount,
  plantsToCheck,
  recentFamilies,
  recentHistory,
  repeatedFamily,
  rotationFit,
  seasonPlantColors,
} from "@/lib/seasonPlanner";

const record = (overrides: Partial<PlantingRecord>): PlantingRecord => ({
  id: "r", commonName: "Tomato", plantType: "Tomato", cropFamily: "nightshade", quantity: 1, plantingDate: "2026-05-01", growingAreaId: "bed", isActive: false, ...overrides,
});

describe("companionNotes", () => {
  it("recognizes bilingual tomato and basil records with the short note", () => {
    const notes = companionNotes([
      { id: "tomato", commonName: "番茄", plantType: "番茄", cropFamily: "nightshade", quantity: 2, plantingDate: "2027-05-20", growingAreaId: "bed-1", isActive: false },
      { id: "basil", commonName: "罗勒", plantType: "罗勒", cropFamily: "other", quantity: 1, plantingDate: "2027-05-20", growingAreaId: "bed-1", isActive: false },
    ]);
    expect(notes).toEqual([expect.objectContaining({ kind: "helpful", message: "Basil may reduce some tomato pests.", sourceLabel: "University of Minnesota Extension" })]);
  });

  it("keeps the space and same-family notes short and cautious", () => {
    expect(companionNotes([record({ id: "t" }), record({ id: "l", commonName: "Lettuce", plantType: "Lettuce", cropFamily: "leafy" })]).map((note) => note.message))
      .toEqual(["Lettuce can use the space before the tomato fills in."]);
    expect(companionNotes([record({ id: "k", commonName: "Kale", cropFamily: "brassica" }), record({ id: "c", commonName: "Cabbage", cropFamily: "brassica" })]).map((note) => note.message))
      .toEqual(["Brassica crops share pests and diseases. Keep an eye on spacing."]);
    expect(companionNotes([record({ id: "k", commonName: "Kale", cropFamily: "brassica" })])).toEqual([]);
  });
});

describe("rotation rules for the sheet", () => {
  const history = [
    record({ id: "a", commonName: "Tomatoes", plantType: "Tomato", variety: "Sun Gold", plantingDate: "2026-05-18" }),
    record({ id: "b", commonName: "sungold", plantType: "sungold", plantingDate: "2026-06-01" }),
    record({ id: "c", commonName: "Bush beans", plantType: "Bean", cropFamily: "legume", plantingDate: "2024-05-24" }),
    record({ id: "d", commonName: "Marigold", plantType: "Marigold", cropFamily: "other", plantingDate: "2026-05-24" }),
    record({ id: "e", commonName: "Pepper", plantType: "Pepper", plantingDate: "2025-05-01" }),
  ];

  it("groups history by season, newest first, with each plant named once", () => {
    expect(historyBySeason(history).map(({ year, plants }) => [year, plants.map((plant) => plant.label)])).toEqual([
      [2026, ["Tomato · Sun Gold", "Marigold"]],
      [2025, ["Pepper"]],
      [2024, ["Bean"]],
    ]);
    expect(historyBySeason([])).toEqual([]);
  });

  it("keeps only the three seasons before the plan year", () => {
    const garden = { plantings: [...history, record({ id: "old", plantingDate: "2023-05-01" }), record({ id: "now", plantingDate: "2027-04-01" }), record({ id: "other-bed", growingAreaId: "x" })] };
    expect(recentHistory(garden, "bed", 2027).map((planting) => planting.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("rests from every known family it grew and suggests the rest in order", () => {
    const families = recentFamilies(history);
    expect(families).toEqual(["nightshade", "legume"]);
    expect(rotationFit(families)).toEqual(["brassica", "cucurbit", "allium", "root", "leafy"]);
    expect(recentFamilies([])).toEqual([]);
    expect(latestFamilyYear(history, "nightshade")).toBe(2026);
    expect(latestFamilyYear(history, "legume")).toBe(2024);
    expect(latestFamilyYear(history, "root")).toBeUndefined();
  });

  it("flags a repeat only for a known family the area grew", () => {
    expect(repeatedFamily({ cropFamily: "nightshade" }, ["nightshade"])).toBe("nightshade");
    expect(repeatedFamily({ cropFamily: "brassica" }, ["nightshade"])).toBeUndefined();
    expect(repeatedFamily({ cropFamily: "other" }, ["other" as never])).toBeUndefined();
  });

  it("counts planned areas and plants to check across a garden", () => {
    const garden: Garden = {
      ...createSampleGardenWorkspace().gardens[0],
      seasonPlans: [{ id: "p", seasonYear: 2027, plantings: [
        { id: "1", growingAreaId: "demo-raised-bed", commonName: "Pepper", cropFamily: "nightshade" },
        { id: "2", growingAreaId: "demo-raised-bed", commonName: "Eggplant", cropFamily: "nightshade" },
        { id: "3", growingAreaId: "demo-in-ground-area", commonName: "Pea", cropFamily: "legume" },
        { id: "4", growingAreaId: "demo-container-group", commonName: "Tomato", cropFamily: "nightshade" },
      ] }],
    };
    expect(plannedAreaCount(garden, 2027)).toBe(3);
    expect(plannedAreaCount(garden, 2028)).toBe(0);
    // Two nightshades in the bed that grew tomatoes, and peas where beans grew. The container has no history.
    expect(plantsToCheck(garden, 2027)).toBe(3);
  });
});

describe("seasonPlantColors", () => {
  it("gives a plant on the Garden Plan exactly the plan's colour", () => {
    const garden = createSampleGardenWorkspace().gardens[0];
    const allocations = garden.growingAreas.flatMap((area) => area.layout?.allocations ?? []);
    const planColors = gardenPlantColors(allocations, plantingFamilies(garden.plantings));
    const colorOf = seasonPlantColors({ ...garden, seasonPlans: [{ id: "p", seasonYear: 2027, plantings: [{ id: "k", growingAreaId: "demo-raised-bed", commonName: "Kale", plantType: "Kale", cropFamily: "brassica" }] }] });
    expect(colorOf({ commonName: "Tomato", plantType: "Tomato" })).toEqual(planColors.get("tomato"));
    expect(colorOf({ id: "k", commonName: "Kale", plantType: "Kale" })).toEqual(expect.objectContaining({ fill: expect.any(String), stroke: expect.any(String) }));
    // Steady: the same plant gets the same colour each time.
    expect(colorOf({ commonName: "Kale", plantType: "Kale" })).toEqual(colorOf({ id: "k", commonName: "Kale", plantType: "Kale" }));
  });
});
