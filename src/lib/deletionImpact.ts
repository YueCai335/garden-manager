import type { Garden, GardenWorkspace, GrowingArea } from "./gardenWorkspace";

const quantity = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function gardenDeletionMessage(workspace: GardenWorkspace, garden: Garden) {
  const plans = (garden.seasonPlans ?? []).reduce((count, plan) => count + plan.plantings.length, 0);
  const rootHistory = workspace.gardens.length === 1
    ? `Deleting the last device-only garden also clears ${quantity(workspace.careEvents.length, "workspace care record")} and ${quantity(workspace.careTasks.length, "workspace task")}.`
    : "Other gardens and workspace-wide care records and tasks stay available.";
  return `Delete “${garden.name}”? This removes ${quantity(garden.growingAreas.length, "planting area")}, ${quantity(garden.plantings.length, "planting record")}, ${quantity(garden.careEvents.length, "care record")}, ${quantity(garden.careTasks.length, "task")}, ${quantity(garden.healthRecords.length, "health record")}, and ${quantity(plans, "future plan item")}. This garden's history and unsaved edits will be lost. ${rootHistory} This cannot be undone.`;
}
export function areaDeletionMessage(garden: Garden, area: GrowingArea) {
  const plantings = garden.plantings.filter((planting) => planting.growingAreaId === area.id).length;
  const plans = (garden.seasonPlans ?? []).flatMap((plan) => plan.plantings).filter((planting) => planting.growingAreaId === area.id).length;
  return `Delete “${area.name}”? This removes ${quantity(area.layout?.allocations.length ?? 0, "layout plant")}, ${quantity(plantings, "planting record")}, and ${quantity(plans, "future plan item")}. Care history, tasks, and health records stay in this garden; affected targets are marked as former locations or plants. Unsaved edits for this area will be discarded. This cannot be undone.`;
}
