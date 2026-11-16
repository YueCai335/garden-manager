import { describe, expect, it } from "vitest";
import { careEventForTask, completeCareTask, undoCareTaskCompletion, updateCareOwner } from "./careViews";
import { createDemoGardenWorkspace, createGarden, type CareTask } from "./gardenWorkspace";
import { homeTasks } from "./homeTasks";

const task = (id: string, dueDate: string): CareTask => ({ id, dueDate, type: "watering", note: "", targetScope: "garden" });

describe("Care to do on Gardens", () => {
  it("splits root and garden tasks into Overdue, Today, and the next seven days, each counted once", () => {
    const workspace = createDemoGardenWorkspace();
    workspace.gardens.push(createGarden("Back garden"));
    workspace.careTasks = [{ ...task("root", "2026-11-09"), targetScope: "all-gardens", type: "fertilizing" }];
    workspace.gardens[0].careTasks = [workspace.careTasks[0], task("today", "2026-11-10")];
    workspace.gardens[1].careTasks = [task("tomorrow", "2026-11-11"), task("friday", "2026-11-13"), task("seventh-day", "2026-11-17"), task("outside", "2026-11-18"), { ...task("old", "2026-11-07"), targetScope: "planting-area", growingAreaId: "bed", growingAreaName: "Raised bed" }];
    workspace.careEvents = [];
    workspace.gardens.forEach((garden) => { garden.careEvents = []; });

    const summary = homeTasks(workspace, "2026-11-10");
    expect(summary.overdue.map(({ title, detail }) => [title, detail])).toEqual([
      ["Water Back garden", "Raised bed · Due 3 days ago"],
      ["Fertilize all gardens", "Due yesterday"],
    ]);
    expect(summary.today.map(({ title }) => title)).toEqual(["Water Demo Garden"]);
    expect(summary.upcoming.map(({ when }) => when)).toEqual(["Tomorrow", "Fri", "Tue"]);
    expect([...summary.overdue, ...summary.today].every((row) => row.task && !row.done)).toBe(true);
    expect({ done: summary.done, total: summary.total }).toEqual({ done: 0, total: 3 });
  });

  it("keeps a ticked task in its group struck through, shows earlier work done today, and unticks cleanly", () => {
    let workspace = createDemoGardenWorkspace();
    const garden = workspace.gardens[0];
    garden.careTasks = [{ ...task("late", "2026-11-09"), repeatIntervalDays: 3 }, task("once", "2026-11-10")];
    garden.careEvents = [{ id: "from-note", type: "fertilizing", date: "2026-11-10", note: "", targetScope: "garden" }, { id: "old", type: "watering", date: "2026-11-01", note: "", targetScope: "garden" }];
    workspace.careTasks = []; workspace.careEvents = [];
    const before = workspace;

    const row = homeTasks(workspace, "2026-11-10").overdue[0];
    const event = careEventForTask(row.task!, "2026-11-10", row.owner, "tick-1");
    workspace = updateCareOwner(workspace, row.owner, (records) => completeCareTask(records, row.task!, event));
    const completion = { taskKey: row.key, task: row.task!, owner: row.owner, eventId: "tick-1" };

    const after = homeTasks(workspace, "2026-11-10", [completion]);
    expect(after.overdue).toMatchObject([{ title: "Water Demo Garden", detail: "Due yesterday", done: true, completion }]);
    // The repeating task moves on three days from today; the earlier fertilizing counts as done today.
    expect(after.upcoming).toMatchObject([{ when: "Fri", done: false }]);
    expect(after.today.map(({ title, done, task: open }) => [title, done, Boolean(open)])).toEqual([
      ["Fertilize Demo Garden", true, false],
      ["Water Demo Garden", false, true],
    ]);
    expect({ done: after.done, total: after.total }).toEqual({ done: 2, total: 3 });

    workspace = updateCareOwner(workspace, completion.owner, (records) => undoCareTaskCompletion(records, completion.task, completion.eventId));
    expect(workspace.gardens[0].careTasks).toEqual(before.gardens[0].careTasks);
    expect(workspace.gardens[0].careEvents).toEqual(before.gardens[0].careEvents);
    expect(homeTasks(workspace, "2026-11-10", [completion]).overdue).toMatchObject([{ done: false }]);
  });

  it("removes a one-time task when it is completed", () => {
    const records = { careEvents: [], careTasks: [task("once", "2026-11-10")] };
    const event = careEventForTask(records.careTasks[0], "2026-11-10", { ownerScope: "workspace" }, "e");
    expect(completeCareTask(records, records.careTasks[0], event)).toEqual({ careEvents: [{ ...event, targetScope: "all-gardens" }], careTasks: [] });
    expect(undoCareTaskCompletion({ careEvents: [event], careTasks: [] }, records.careTasks[0], "e")).toEqual(records);
  });
});
