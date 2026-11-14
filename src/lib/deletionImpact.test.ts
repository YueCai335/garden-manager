import { expect, it } from "vitest";
import { createDemoGardenWorkspace, createGarden } from "./gardenWorkspace";
import { areaDeletionMessage, gardenDeletionMessage } from "./deletionImpact";
import { removeGrowingArea } from "./gardenOperations";

it("describes actual removed counts while retaining and marking related history", () => {
  const workspace = createDemoGardenWorkspace();
  const garden = workspace.gardens[0]; const area = garden.growingAreas[0];
  garden.careEvents = [{ id: "event", type: "watering", date: "2026-11-10", targetScope: "planting-area", growingAreaId: area.id, growingAreaName: area.name, note: "" }];
  garden.careTasks = [{ id: "task", type: "watering", dueDate: "2026-11-11", targetScope: "planting-area", growingAreaId: area.id, growingAreaName: area.name, note: "" }];
  const removed = removeGrowingArea(garden, area.id);
  const message = areaDeletionMessage(garden, area);
  expect(message).toContain(`${garden.plantings.length - removed.plantings.length} planting record`);
  expect(message).toContain(`${area.layout!.allocations.length} layout plant`);
  expect(message).toContain("Care history, tasks, and health records stay");
  expect(removed.careEvents[0].targetAreaDeleted).toBe(true);
  expect(removed.careTasks[0].targetAreaDeleted).toBe(true);
  expect(message).not.toContain("this browser");
});

it("distinguishes deleting one garden from clearing the final device workspace", () => {
  const workspace = createDemoGardenWorkspace(); const garden = workspace.gardens[0];
  expect(gardenDeletionMessage(workspace, garden)).toContain("last device-only garden");
  workspace.gardens.push(createGarden("Other garden"));
  const message = gardenDeletionMessage(workspace, garden);
  expect(message).toContain("Other gardens and workspace-wide care records and tasks stay");
  expect(message).toContain(`${garden.careEvents.length} care records`);
  expect(message).toContain("history and unsaved edits will be lost");
});
