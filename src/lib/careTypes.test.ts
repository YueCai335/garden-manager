import { describe, expect, it } from "vitest";

import { careTypeDoneVerb, careTypeNoun, careTypeVerb } from "./careLabels";
import { careEventTypes } from "./careTypes";
import { careEventForTask } from "./careViews";
import {
  careDetailsOf,
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
