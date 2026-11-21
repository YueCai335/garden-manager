import { describe, expect, it } from "vitest";

import { careDoneTitle, careLocalTitle, careTitle, careTypeDoneVerb, careTypeName, careTypeNoun, careTypeVerb } from "./careLabels";
import { careDetailsChanged, careDetailsForm, careDetailsFromForm, careDetailsText, emptyCareDetailsForm } from "./careRecords";
import { careEventTypes } from "./careTypes";
import { careEventForTask } from "./careViews";
import {
  careDetailsOf,
  createGarden,
  createGardenWorkspace,
  hasValidCareDetails,
  readGardenWorkspace,
  type CareEvent,
  type CareTask,
} from "./gardenWorkspace";
import { careHistoryPath, careHistoryType } from "./workspaceRoutes";

// ADR-0085: five care types, each with its own optional details.
const event = (extra: Partial<CareEvent>): CareEvent => ({ id: "e", type: "watering", date: "2026-11-19", note: "", targetScope: "garden", ...extra });
const task = (extra: Partial<CareTask>): CareTask => ({ id: "t", type: "watering", dueDate: "2026-11-20", note: "", targetScope: "garden", ...extra });

function storedWith(careEvents: CareEvent[], careTasks: CareTask[] = []) {
  const workspace = createGardenWorkspace("Backyard");
  workspace.gardens[0].careEvents = careEvents;
  workspace.gardens[0].careTasks = careTasks;
  return JSON.stringify(workspace);
}

describe("care types and details", () => {
  it("lists five care types", () => {
    expect(careEventTypes).toEqual(["watering", "fertilizing", "planting", "pruning", "pest-treatment"]);
  });

  it("reads saved records and tasks of the new types with their details", () => {
    const events = [
      event({ id: "p", type: "planting", plantName: "Basil", plantCount: 2 }),
      event({ id: "r", type: "pruning", pruneDetail: "Side shoots" }),
      event({ id: "x", type: "pest-treatment", pestProblem: "Aphids", pestTreatment: "Soap spray" }),
    ];
    const tasks = [task({ type: "fertilizing", fertilizerProduct: "Fish emulsion", fertilizerAmount: 50, fertilizerUnit: "ml" })];
    const read = readGardenWorkspace(storedWith(events, tasks));
    expect(read?.gardens[0].careEvents).toEqual(events);
    expect(read?.gardens[0].careTasks).toEqual(tasks);
  });

  it("still reads a workspace saved before the new types existed", () => {
    const old = [event({ type: "fertilizing", fertilizerProduct: "Compost tea", fertilizerAmount: 2, fertilizerUnit: "L" })];
    expect(readGardenWorkspace(storedWith(old))?.gardens[0].careEvents).toEqual(old);
  });

  it("rejects a saved workspace whose record has a detail of another type", () => {
    expect(readGardenWorkspace(storedWith([event({ type: "watering", plantName: "Basil" })]))).toBeUndefined();
    expect(readGardenWorkspace(storedWith([], [task({ type: "pruning", fertilizerAmount: 2 })]))).toBeUndefined();
  });

  it.each([
    ["a detail of its own type", { type: "pruning", pruneDetail: "Dead wood" }, true],
    ["no details at all", { type: "pest-treatment" }, true],
    ["blank text", { type: "pruning", pruneDetail: "  " }, false],
    ["a plant count of 0", { type: "planting", plantCount: 0 }, false],
    ["a fractional plant count", { type: "planting", plantCount: 1.5 }, false],
    ["a plant count over 999", { type: "planting", plantCount: 1000 }, false],
    ["a negative amount", { type: "fertilizing", fertilizerAmount: -1 }, false],
    ["a detail of another type", { type: "planting", pestProblem: "Slugs" }, false],
  ] as const)("checks details: %s", (_, value, valid) => {
    expect(hasValidCareDetails(value)).toBe(valid);
  });

  it("keeps only the details of the record's own type", () => {
    expect(careDetailsOf({ type: "planting", plantName: "Basil", plantCount: 2 })).toEqual({ plantName: "Basil", plantCount: 2 });
    expect(careDetailsOf({ type: "watering" })).toEqual({});
  });

  it("carries a task's details into the record written when it is done", () => {
    const done = careEventForTask(task({ type: "planting", plantName: "Basil", plantCount: 2 }), "2026-11-20", { ownerScope: "garden", gardenId: "g" }, "e1");
    expect(done).toMatchObject({ type: "planting", date: "2026-11-20", plantName: "Basil", plantCount: 2 });
  });

  it("names every type for Care and History", () => {
    for (const type of careEventTypes) {
      expect(careTypeVerb[type]).toBeTruthy();
      expect(careTypeDoneVerb[type]).toBeTruthy();
      expect(careTypeNoun[type]).toBeTruthy();
    }
    expect(careTypeVerb.pruning).toBe("Prune");
    expect(careTypeDoneVerb["pest-treatment"]).toBe("Treated pests");
  });

  it("filters History by any of the five types", () => {
    expect(careHistoryType("pest-treatment")).toBe("pest-treatment");
    expect(careHistoryType("harvesting")).toBe("all");
    expect(careHistoryPath("all", "pruning")).toBe("/care?view=history&type=pruning");
  });
});

describe("care type words and details (N2)", () => {
  const garden = { ...createGarden("Front Yard") };

  it.each([
    [{ type: "watering", targetScope: "garden" }, "Water Front Yard", "Watered Front Yard"],
    [{ type: "pruning", targetScope: "garden" }, "Prune Front Yard", "Pruned Front Yard"],
    [{ type: "planting", targetScope: "garden", plantName: "Basil" }, "Plant Basil in Front Yard", "Planted Basil in Front Yard"],
    [{ type: "planting", targetScope: "garden" }, "Plant in Front Yard", "Planted in Front Yard"],
    [{ type: "pest-treatment", targetScope: "all-gardens" }, "Treat pests in all gardens", "Treated pests in all gardens"],
  ] as const)("titles %o", (record, title, done) => {
    expect(careTitle(record, garden)).toBe(title);
    expect(careDoneTitle(record, garden)).toBe(done);
  });

  it("drops the garden name inside a garden card", () => {
    expect(careLocalTitle({ type: "pruning", targetScope: "plant-group" }, { area: "Bed 1", plant: "Pepper" })).toBe("Prune Pepper");
    expect(careLocalTitle({ type: "planting", targetScope: "planting-area", plantName: "Basil" }, { area: "Planter" })).toBe("Plant Basil");
    expect(careLocalTitle({ type: "pest-treatment", targetScope: "plant-group" }, { plant: "Kale" })).toBe("Treat pests on Kale");
    expect(careLocalTitle({ type: "pest-treatment", targetScope: "garden" }, {})).toBe("Treat pests in whole garden");
    expect(careLocalTitle({ type: "watering", targetScope: "garden" }, {})).toBe("Water whole garden");
  });

  it("writes each type's details as one short line", () => {
    expect(careDetailsText({ type: "fertilizing", fertilizerProduct: "Fish emulsion", fertilizerAmount: 50, fertilizerUnit: "ml" })).toBe("Fish emulsion · 50 ml");
    expect(careDetailsText({ type: "planting", plantName: "Basil", plantCount: 1 })).toBe("1 plant");
    expect(careDetailsText({ type: "planting", plantCount: 3 })).toBe("3 plants");
    expect(careDetailsText({ type: "pruning", pruneDetail: "Side shoots" })).toBe("Side shoots");
    expect(careDetailsText({ type: "pest-treatment", pestProblem: "Aphids", pestTreatment: "Soap spray" })).toBe("Aphids · Soap spray");
    expect(careDetailsText({ type: "watering" })).toBe("");
  });

  it("reads only the chosen type's details from the form", () => {
    const form = { ...emptyCareDetailsForm(), plantName: " Basil ", plantCount: "2", pestProblem: "Aphids" };
    expect(careDetailsFromForm("planting", form)).toEqual({ details: { plantName: "Basil", plantCount: 2 } });
    expect(careDetailsFromForm("watering", form)).toEqual({ details: {} });
    expect(careDetailsFromForm("planting", { plantCount: "0" })).toEqual({ error: "Enter a whole number of plants from 1 to 999.", field: "plantCount" });
    expect(careDetailsFromForm("fertilizing", { fertilizerAmount: "-1" })).toEqual({ error: "Enter a fertilizer amount greater than zero.", field: "fertilizerAmount" });
    // A draft kept from before ADR-0085 has no new fields; it reads as empty.
    expect(careDetailsFromForm("pruning", {})).toEqual({ details: {} });
  });

  it("round-trips details through the form and notices a change", () => {
    const record = { type: "pest-treatment" as const, pestProblem: "Aphids" };
    const form = careDetailsForm(record);
    expect(form.pestProblem).toBe("Aphids");
    expect(careDetailsChanged("pest-treatment", form, record)).toBe(false);
    expect(careDetailsChanged("pest-treatment", { ...form, pestTreatment: "Soap spray" }, record)).toBe(true);
  });

  it("names each type for forms and filters", () => {
    expect(careEventTypes.map((type) => careTypeName[type])).toEqual(["Watering", "Fertilizing", "Planting", "Pruning", "Pest treatment"]);
  });
});
