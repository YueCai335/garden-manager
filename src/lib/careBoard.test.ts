import { describe, expect, it } from "vitest";
import { careBoard } from "./careBoard";
import { careEventForTask, completeCareTask, updateCareOwner } from "./careViews";
import { createGarden, createGardenWorkspace, type CareEvent, type CareTask } from "./gardenWorkspace";
import type { HomeCompletion } from "./homeTasks";

const TODAY = "2026-11-16";
const task = (id: string, dueDate: string, extra: Partial<CareTask> = {}): CareTask => ({ id, dueDate, type: "watering", note: "", targetScope: "garden", ...extra });
const event = (id: string, date: string, extra: Partial<CareEvent> = {}): CareEvent => ({ id, date, type: "watering", note: "", targetScope: "garden", ...extra });

function workspace() {
  const value = createGardenWorkspace("Backyard");
  value.gardens[0].id = "back";
  value.gardens.push({ ...createGarden("Front Yard"), id: "front" });
  value.gardens.forEach((garden) => { garden.careTasks = []; garden.careEvents = []; });
  value.careTasks = []; value.careEvents = [];
  return value;
}

describe("Care board (ADR-0080)", () => {
  it("puts overdue before due today and keeps equal dates in a stable order", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("b", TODAY), task("late", "2026-11-14"), task("a", TODAY)];
    value.gardens[1].careTasks = [task("a", TODAY), task("yesterday", "2026-11-15", { type: "fertilizing" })];
    const board = careBoard(value, TODAY);
    expect(board.todo.map((row) => [row.location, row.title, row.late])).toEqual([
      ["back", "Water Backyard", "Due 2 days ago"],
      ["front", "Fertilize Front Yard", "Due yesterday"],
      ["back", "Water Backyard", undefined],
      ["front", "Water Front Yard", undefined],
      ["back", "Water Backyard", undefined],
    ]);
    expect(board.todo.map((row) => row.source?.record.id)).toEqual(["late", "yesterday", "a", "a", "b"]);
    expect({ overdue: board.overdue, dueToday: board.dueToday, progress: board.progress }).toEqual({ overdue: 2, dueToday: 3, progress: { done: 0, total: 5 } });
  });

  it("lists exactly the next seven days and leaves the eighth day off the page", () => {
    const value = workspace();
    value.gardens[0].careTasks = [task("tomorrow", "2026-11-17"), task("seventh", "2026-11-23"), task("eighth", "2026-11-24")];
    const board = careBoard(value, TODAY);
    expect(board.days.map(({ date, weekday, day }) => [date, weekday, day])).toEqual([
      ["2026-11-17", "Tue", 17], ["2026-11-18", "Wed", 18], ["2026-11-19", "Thu", 19], ["2026-11-20", "Fri", 20],
      ["2026-11-21", "Sat", 21], ["2026-11-22", "Sun", 22], ["2026-11-23", "Mon", 23],
    ]);
    expect(board.days[0].rows.map((row) => row.source?.record.id)).toEqual(["tomorrow"]);
    expect(board.days[6].rows.map((row) => row.source?.record.id)).toEqual(["seventh"]);
    expect(board.gardens[0].upcoming.map((row) => row.source?.record.id)).toEqual(["tomorrow", "seventh"]);
  });

  it("crosses a month and a year", () => {
    const board = careBoard(workspace(), "2026-12-28");
    expect(board.days.map((day) => day.date)).toEqual(["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03", "2027-01-04"]);
  });

  it("counts workspace-wide care in To do and All gardens, never in a garden card", () => {
    const value = workspace();
    value.careTasks = [task("root", TODAY, { targetScope: "all-gardens", type: "fertilizing", repeatIntervalDays: 7 }), task("root-next", "2026-11-20", { targetScope: "all-gardens" })];
    const board = careBoard(value, TODAY);
    expect(board.todo.map((row) => [row.title, row.detail, row.location])).toEqual([["Fertilize all gardens", "Every 7 days", "all-gardens"]]);
    expect(board.allGardens.today.map((row) => row.localTitle)).toEqual(["Fertilize all gardens"]);
    expect(board.allGardens.upcoming.map((row) => row.source?.record.id)).toEqual(["root-next"]);
    expect(board.gardens.map(({ total, upcoming }) => [total, upcoming.length])).toEqual([[0, 0], [0, 0]]);
  });

  it("counts a legacy mirror of a root record once", () => {
    const value = workspace();
    value.careTasks = [task("shared", TODAY, { targetScope: "all-gardens" })];
    value.gardens[0].careTasks = [task("shared", TODAY, { targetScope: "all-gardens" })];
    value.careEvents = [event("note", TODAY, { targetScope: "all-gardens" })];
    value.gardens[1].careEvents = [event("note", TODAY, { targetScope: "all-gardens" })];
    const board = careBoard(value, TODAY);
    expect(board.todo).toHaveLength(1);
    expect(board.doneToday).toHaveLength(1);
  });

  it("drops the garden name inside a garden card and keeps the area under a plant", () => {
    const value = workspace();
    const garden = value.gardens[0];
    garden.growingAreas = [{ ...garden.growingAreas[0], id: "bed", name: "Raised bed A" }];
    garden.plantings = [{ ...garden.plantings[0], id: "pepper", growingAreaId: "bed", commonName: "Pepper", plantType: "Pepper", variety: "" }];
    garden.careTasks = [
      task("plant", TODAY, { targetScope: "plant-group", plantingRecordId: "pepper", plantingRecordName: "Pepper", note: "Check the leaves" }),
      task("area", TODAY, { targetScope: "planting-area", growingAreaId: "bed", growingAreaName: "Raised bed A", repeatIntervalDays: 3 }),
      task("whole", TODAY),
    ];
    const board = careBoard(value, TODAY);
    expect(board.todo.map(({ title, detail, note }) => [title, detail, note])).toEqual([
      ["Water Backyard", "Raised bed A · Every 3 days", undefined],
      ["Water Backyard", "Raised bed A · Pepper", "Check the leaves"],
      ["Water Backyard", "Whole garden", undefined],
    ]);
    expect(board.gardens[0].today.map(({ localTitle, localDetail }) => [localTitle, localDetail])).toEqual([
      ["Water Raised bed A", "Every 3 days"],
      ["Water Pepper", "Raised bed A"],
      ["Water whole garden", undefined],
    ]);
  });

  it("shows today's records as Done today and lets only this visit's ticks be undone", () => {
    let value = workspace();
    value.gardens[0].careTasks = [task("late", "2026-11-15"), task("now", TODAY)];
    value.gardens[1].careEvents = [event("from-note", TODAY, { type: "fertilizing" }), event("old", "2026-11-10")];
    const row = careBoard(value, TODAY).todo[0];
    const done = careEventForTask(row.source!.record, TODAY, row.owner, "tick-1");
    value = updateCareOwner(value, row.owner, (records) => completeCareTask(records, row.source!.record, done));
    const completion: HomeCompletion = { taskKey: row.key, task: row.source!.record, owner: row.owner, eventId: "tick-1" };

    const board = careBoard(value, TODAY, [completion]);
    expect(board.todo.map((item) => item.source?.record.id)).toEqual(["now"]);
    expect(board.doneToday.map(({ key, title, completion }) => [key, title, Boolean(completion)])).toEqual([
      ["done:tick-1", "Water Backyard", true],
      [expect.stringContaining("from-note"), "Fertilize Front Yard", false],
    ]);
    expect(board.progress).toEqual({ done: 2, total: 3 });
    // In its garden card the tick stays where the overdue task was.
    expect(board.gardens[0].today.map(({ done, key }) => [done, key])).toEqual([[true, "done:tick-1"], [false, row.key.replace("late", "now")]]);
    expect({ left: board.gardens[0].left, total: board.gardens[0].total }).toEqual({ left: 1, total: 2 });
    expect({ left: board.gardens[1].left, total: board.gardens[1].total }).toEqual({ left: 0, total: 1 });
    // Without this visit's completion the same record is done but cannot be unticked.
    expect(careBoard(value, TODAY).doneToday.every((item) => !item.completion)).toBe(true);
  });

  it("moves a ticked repeating task into the ribbon only when its next date is inside the window", () => {
    for (const [interval, expected] of [[3, "2026-11-19"], [8, undefined]] as const) {
      let value = workspace();
      value.gardens[0].careTasks = [task("repeat", TODAY, { repeatIntervalDays: interval })];
      const row = careBoard(value, TODAY).todo[0];
      const done = careEventForTask(row.source!.record, TODAY, row.owner, "tick");
      value = updateCareOwner(value, row.owner, (records) => completeCareTask(records, row.source!.record, done));
      const board = careBoard(value, TODAY);
      expect(board.todo).toHaveLength(0);
      expect(board.days.find((day) => day.rows.length)?.date).toBe(expected);
    }
  });
});
