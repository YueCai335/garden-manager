import { careLocationKey, type CareOwner } from "./careViews";
import type { CareEventTargetScope, CareEventType, CareTask, GardenWorkspace } from "./gardenWorkspace";

/**
 * Which open Care tasks a garden note's records complete (ADR-0085). Plain rules, no AI:
 *
 * 1. Only tasks due on the record's date or earlier (due today or overdue), never later ones.
 * 2. The care type must be the same.
 * 3. The record's target must equal or contain the task's: a whole garden contains its areas and
 *    plant groups, an area contains the plant groups planted in it, and all gardens contains
 *    everything. Never the reverse.
 * 4. An all-gardens task is done only by an all-gardens record, or when the note's records cover
 *    every garden.
 * 5. A task is completed by at most one record: the narrowest one that covers it, then the first.
 */

/** The parts of a draft or record that matching reads. */
export type NoteRecord = {
  key: string;
  type: CareEventType | "";
  date: string;
  targetScope: CareEventTargetScope | "";
  gardenId: string;
  growingAreaId: string;
  plantingRecordId: string;
};

export type TaskRef = { key: string; owner: CareOwner; task: CareTask };

/** A stable key for a task across the whole workspace: its owner and its ID. */
export const taskKey = (owner: CareOwner, taskId: string) => `${careLocationKey(owner)}:${taskId}`;

const narrowness: Record<CareEventTargetScope, number> = { "all-gardens": 0, garden: 1, "planting-area": 2, "plant-group": 3 };

function plantArea(workspace: GardenWorkspace, gardenId: string, plantingRecordId?: string) {
  return workspace.gardens.find((garden) => garden.id === gardenId)?.plantings.find((planting) => planting.id === plantingRecordId)?.growingAreaId;
}

/** Whether a record's target equals or contains a garden task's target (rule 3). */
function covers(workspace: GardenWorkspace, record: NoteRecord, gardenId: string, task: CareTask) {
  if (record.targetScope === "all-gardens") return true;
  if (record.gardenId !== gardenId) return false;
  if (record.targetScope === "garden") return true;
  if (record.targetScope === "planting-area") {
    if (task.targetScope === "planting-area") return task.growingAreaId === record.growingAreaId;
    return task.targetScope === "plant-group" && plantArea(workspace, gardenId, task.plantingRecordId) === record.growingAreaId;
  }
  return record.targetScope === "plant-group" && task.targetScope === "plant-group" && task.plantingRecordId === record.plantingRecordId;
}

const usable = (record: NoteRecord) => Boolean(record.type && record.targetScope && /^\d{4}-\d{2}-\d{2}$/.test(record.date));
const fits = (record: NoteRecord, task: CareTask) => record.type === task.type && task.dueDate <= record.date;

/** The tasks each record completes, keyed by the record's key. Records come in their display order. */
export function matchNoteTasks(workspace: GardenWorkspace, records: NoteRecord[]): Map<string, TaskRef[]> {
  const matches = new Map<string, TaskRef[]>(records.map((record) => [record.key, []]));
  const candidates = records.filter(usable);
  const assign = (record: NoteRecord, ref: TaskRef) => matches.get(record.key)!.push(ref);

  for (const garden of workspace.gardens) {
    for (const task of garden.careTasks) {
      const options = candidates.filter((record) => fits(record, task) && covers(workspace, record, garden.id, task));
      if (!options.length) continue;
      const best = options.reduce((chosen, record) => narrowness[record.targetScope as CareEventTargetScope] > narrowness[chosen.targetScope as CareEventTargetScope] ? record : chosen);
      const owner: CareOwner = { ownerScope: "garden", gardenId: garden.id };
      assign(best, { key: taskKey(owner, task.id), owner, task });
    }
  }

  const root: CareOwner = { ownerScope: "workspace" };
  for (const task of workspace.careTasks) {
    const fitting = candidates.filter((record) => fits(record, task));
    const wide = fitting.find((record) => record.targetScope === "all-gardens");
    // Rule 4: without an all-gardens record, every garden needs a whole-garden record of its own.
    const perGarden = workspace.gardens.map((garden) => fitting.find((record) => record.targetScope === "garden" && record.gardenId === garden.id));
    const covering = wide ?? (workspace.gardens.length && perGarden.every(Boolean) ? perGarden.at(-1) : undefined);
    if (covering) assign(covering, { key: taskKey(root, task.id), owner: root, task });
  }
  return matches;
}
