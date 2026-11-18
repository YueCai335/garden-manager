import { expect, it } from "vitest";
import { careEventForTask, careRows, completeCareTask, undoCareTaskCompletion, workspaceCareGarden, updateCareOwner } from "./careViews";
import type { CareTask } from "./gardenWorkspace";
import { careFixture } from "@/test/careFixture";


it("projects two front, three back and one root record once, retaining colliding owner-local IDs", () => {
  const workspace = careFixture();
  const rows = careRows([workspaceCareGarden(workspace), ...workspace.gardens], "careEvents");
  expect(rows).toHaveLength(6);
  expect(new Set(rows.map((row) => row.key)).size).toBe(6);
  expect(rows.filter((row) => row.record.id === "same").map((row) => row.owner)).toEqual([
    { ownerScope: "garden", gardenId: "front" }, { ownerScope: "garden", gardenId: "back" },
  ]);
  workspace.gardens[0].careEvents.push(workspace.careEvents[0]);
  expect(careRows([workspaceCareGarden(workspace), ...workspace.gardens], "careEvents")).toHaveLength(6);
});

it("updates only the declared collection and never recreates a deleted garden owner", () => {
  const workspace = careFixture();
  const result = updateCareOwner(workspace, { ownerScope: "garden", gardenId: "back" }, (records) => ({ ...records, careEvents: records.careEvents.filter((record) => record.id !== "same") }));
  expect(result.careEvents).toBe(workspace.careEvents);
  expect(result.gardens[0]).toBe(workspace.gardens[0]);
  expect(result.gardens[1].careEvents).toHaveLength(2);
  expect(workspace.gardens[1].careEvents).toHaveLength(3);
  expect(updateCareOwner(workspace, { ownerScope: "garden", gardenId: "missing" }, () => ({ careEvents: [], careTasks: [] }))).toEqual(workspace);
});

it("removes a one-time task when it is completed, and restores it when undone", () => {
  const task: CareTask = { id: "once", dueDate: "2026-11-10", type: "watering", note: "", targetScope: "garden" };
  const records = { careEvents: [], careTasks: [task] };
  const event = careEventForTask(task, "2026-11-10", { ownerScope: "workspace" }, "e");
  expect(completeCareTask(records, task, event)).toEqual({ careEvents: [{ ...event, targetScope: "all-gardens" }], careTasks: [] });
  expect(undoCareTaskCompletion({ careEvents: [event], careTasks: [] }, task, "e")).toEqual(records);
});
