import { expect, it } from "vitest";
import { createDemoGardenWorkspace, createGarden, type CareTask } from "./gardenWorkspace";
import { homeTasks } from "./homeTasks";
it("aggregates root and all garden tasks once, counts the next seven days and caps the sorted summary", () => {
  const workspace = createDemoGardenWorkspace();
  workspace.gardens.push(createGarden("Back garden"));
  const task = (id: string, dueDate: string): CareTask => ({ id, dueDate, type: "watering", note: "", targetScope: "garden" });
  workspace.careTasks = [{ ...task("root", "2026-11-09"), targetScope: "all-gardens" }];
  workspace.gardens[0].careTasks = [workspace.careTasks[0], task("today", "2026-11-10")];
  workspace.gardens[1].careTasks = [task("future", "2026-11-11"), task("next", "2026-11-14"), task("seventh-day", "2026-11-17"), task("outside", "2026-11-18"), { ...task("old", "2026-11-08"), targetScope: "planting-area", growingAreaId: "bed", growingAreaName: "Raised bed" }];
  const summary = homeTasks(workspace, "2026-11-10");
  expect(summary.counts).toEqual({ overdue: 2, "due-today": 1, upcoming: 3 });
  expect(summary.recent.map(({ task }) => task.id)).toEqual(["old", "root", "today", "future", "next"]);
  expect(summary.recent[0].location).toBe("Back garden / Raised bed");
  expect(summary.recent[1].location).toBe("All gardens");
});
