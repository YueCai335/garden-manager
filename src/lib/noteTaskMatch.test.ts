import { describe, expect, it } from "vitest";
import { careFixture } from "@/test/careFixture";
import { applyCareDraftBatch, newCareDraft, taskFromSuggestion, type CareDraftRow } from "./careNoteBatch";
import type { CareTask, GardenWorkspace, GrowingArea, PlantingRecord } from "./gardenWorkspace";
import { matchNoteTasks, type NoteRecord } from "./noteTaskMatch";

// ADR-0085: plain rules decide which due tasks a note's records tick off.
const DAY = "2026-11-20";

function workspace(): GardenWorkspace {
  const value = careFixture();
  value.careEvents = [];
  for (const garden of value.gardens) { garden.careEvents = []; garden.careTasks = []; }
  const front = value.gardens[0];
  front.growingAreas = [{ id: "bed", name: "Bed" } as GrowingArea, { id: "pots", name: "Pots" } as GrowingArea];
  front.plantings = [{ id: "pepper", commonName: "Pepper", growingAreaId: "bed" } as PlantingRecord, { id: "basil", commonName: "Basil", growingAreaId: "pots" } as PlantingRecord];
  return value;
}
const task = (id: string, extra: Partial<CareTask> = {}): CareTask => ({ id, type: "watering", dueDate: DAY, note: "", targetScope: "garden", ...extra });
const record = (key: string, extra: Partial<NoteRecord> = {}): NoteRecord => ({ key, type: "watering", date: DAY, targetScope: "garden", gardenId: "front", growingAreaId: "", plantingRecordId: "", ...extra });
const matched = (value: GardenWorkspace, records: NoteRecord[]) =>
  Object.fromEntries([...matchNoteTasks(value, records)].map(([key, refs]) => [key, refs.map((ref) => ref.key)]));

describe("matchNoteTasks", () => {
  it("ticks off tasks due that day or overdue, never future ones", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("today"), task("late", { dueDate: "2026-11-18" }), task("later", { dueDate: "2026-11-21" })];
    expect(matched(value, [record("r")])).toEqual({ r: ["front:today", "front:late"] });
  });

  it("needs the same care type", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("feed", { type: "fertilizing" })];
    expect(matched(value, [record("r")])).toEqual({ r: [] });
  });

  it("lets a wider target cover a narrower task, never the reverse", () => {
    const value = workspace();
    value.gardens[0].careTasks = [
      task("bed", { targetScope: "planting-area", growingAreaId: "bed", growingAreaName: "Bed" }),
      task("pepper", { targetScope: "plant-group", plantingRecordId: "pepper", plantingRecordName: "Pepper · Bed" }),
      task("basil", { targetScope: "plant-group", plantingRecordId: "basil", plantingRecordName: "Basil · Pots" }),
      task("whole"),
    ];
    // Watering the bed covers the bed and the pepper planted in it, not the basil or the whole garden.
    expect(matched(value, [record("r", { targetScope: "planting-area", growingAreaId: "bed" })])).toEqual({ r: ["front:bed", "front:pepper"] });
    expect(matched(value, [record("r", { targetScope: "plant-group", plantingRecordId: "basil" })])).toEqual({ r: ["front:basil"] });
    expect(matched(value, [record("r")])).toEqual({ r: ["front:bed", "front:pepper", "front:basil", "front:whole"] });
  });

  it("keeps each garden's tasks to that garden's records", () => {
    const value = workspace();
    value.gardens[1].careTasks = [task("back")];
    expect(matched(value, [record("r")])).toEqual({ r: [] });
    expect(matched(value, [record("r", { gardenId: "back" })])).toEqual({ r: ["back:back"] });
  });

  it("lets an all-gardens record cover every garden's task", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("front")];
    value.gardens[1].careTasks = [task("back")];
    expect(matched(value, [record("r", { targetScope: "all-gardens", gardenId: "" })])).toEqual({ r: ["front:front", "back:back"] });
  });

  it("completes an all-gardens task only when the note covers every garden", () => {
    const value = workspace();
    value.careTasks = [task("all", { targetScope: "all-gardens" })];
    expect(matched(value, [record("front")])).toEqual({ front: [] });
    expect(matched(value, [record("front"), record("back", { gardenId: "back" })])).toEqual({ front: [], back: ["all-gardens:all"] });
    // A bed is not the whole garden, so it does not count towards every garden.
    expect(matched(value, [record("front", { targetScope: "planting-area", growingAreaId: "bed" }), record("back", { gardenId: "back" })])).toEqual({ front: [], back: [] });
  });

  it("gives a task to one record: the narrowest, then the first", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("pepper", { targetScope: "plant-group", plantingRecordId: "pepper", plantingRecordName: "Pepper · Bed" })];
    const garden = record("garden");
    const bed = record("bed", { targetScope: "planting-area", growingAreaId: "bed" });
    expect(matched(value, [garden, bed])).toEqual({ garden: [], bed: ["front:pepper"] });
    expect(matched(value, [record("first"), record("second")])).toEqual({ first: ["front:pepper"], second: [] });
  });

  it("ignores records without a type, target, or valid date", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("t")];
    expect(matched(value, [record("a", { type: "" }), record("b", { targetScope: "" }), record("c", { date: "" })])).toEqual({ a: [], b: [], c: [] });
  });
});

const row = (extra: Partial<CareDraftRow> = {}): CareDraftRow => ({ ...newCareDraft(), gardenId: "front", type: "watering", date: DAY, targetScope: "garden", ...extra });

describe("saving a note with matched tasks", () => {
  it("finishes a matched task without writing a second history record", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("once"), task("repeat", { dueDate: "2026-11-18", repeatIntervalDays: 3 })];
    const result = applyCareDraftBatch(value, [row()]);
    expect(result.tasksCompleted).toBe(2);
    expect(result.workspace.gardens[0].careEvents).toHaveLength(1);
    // One-time tasks leave; repeating ones move on from the day the note says the work was done.
    expect(result.workspace.gardens[0].careTasks).toEqual([task("repeat", { dueDate: "2026-11-23", repeatIntervalDays: 3 })]);
  });

  it("leaves a task the gardener unticked", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("keep")];
    const result = applyCareDraftBatch(value, [row({ skippedTaskKeys: ["front:keep"] })]);
    expect(result.tasksCompleted).toBe(0);
    expect(result.workspace.gardens[0].careTasks).toEqual([task("keep")]);
  });

  it("does not finish a task twice when the same rows are saved again", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("repeat", { repeatIntervalDays: 3 })];
    const rows = [row()];
    const first = applyCareDraftBatch(value, rows).workspace;
    const again = applyCareDraftBatch(first, rows);
    expect(again.tasksCompleted).toBe(0);
    expect(again.workspace.gardens[0].careTasks[0].dueDate).toBe("2026-11-23");
  });

  it("adds a planned job as a task with its details and the note's words", () => {
    const value = workspace();
    const suggestion = { gardenId: "front", type: "pruning" as const, dueDate: "2026-11-21", targetScope: "plant-group" as const, growingAreaId: null, plantingRecordId: "pepper", pruneDetail: "侧枝" };
    const draft = { taskId: "t-new", sourceText: "明天给辣椒剪侧枝", suggestion };
    const result = applyCareDraftBatch(value, [], [draft]);
    expect(result.errors).toEqual({});
    expect(result.tasksAdded).toBe(1);
    expect(result.workspace.gardens[0].careTasks).toEqual([{ id: "t-new", type: "pruning", dueDate: "2026-11-21", note: "明天给辣椒剪侧枝", targetScope: "plant-group", plantingRecordId: "pepper", plantingRecordName: expect.stringContaining("Pepper"), pruneDetail: "侧枝" }]);
    // Saving the same choice again keeps one task.
    expect(applyCareDraftBatch(result.workspace, [], [draft]).workspace.gardens[0].careTasks).toHaveLength(1);
  });

  it("refuses a planned job without a type, date, or existing target", () => {
    const value = workspace();
    const base = { gardenId: "front", type: "pruning" as const, dueDate: "2026-11-21", targetScope: "garden" as const, growingAreaId: null, plantingRecordId: null };
    expect(taskFromSuggestion(value, { taskId: "t", sourceText: "", suggestion: { ...base, dueDate: null } })).toBeUndefined();
    expect(taskFromSuggestion(value, { taskId: "t", sourceText: "", suggestion: { ...base, type: null } })).toBeUndefined();
    expect(taskFromSuggestion(value, { taskId: "t", sourceText: "", suggestion: { ...base, gardenId: "gone" } })).toBeUndefined();
    expect(taskFromSuggestion(value, { taskId: "t", sourceText: "", suggestion: { ...base, targetScope: "planting-area", growingAreaId: "gone" } })).toBeUndefined();
    const result = applyCareDraftBatch(value, [row()], [{ taskId: "t", sourceText: "", suggestion: { ...base, dueDate: null } }]);
    expect(result.errors.batch).toMatch(/missing its type, date, or target/);
    expect(result.workspace).toBe(value);
  });
});
