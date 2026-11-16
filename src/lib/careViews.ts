import { careTargetLabel } from "./careRecords";
import { addDays, plantDisplayName, type CareEvent, type CareTask, type Garden, type GardenWorkspace } from "./gardenWorkspace";

export type CareOwner = { ownerScope: "workspace" } | { ownerScope: "garden"; gardenId: string };
export type CareRow<T> = { key: string; record: T; owner: CareOwner; garden: Garden; targetLabel: string };
export type CareRecords = { careEvents: CareEvent[]; careTasks: CareTask[] };

export function workspaceCareGarden(records: CareRecords): Garden {
  return { id: "all-gardens", name: "All gardens", plan: { widthMeters: 1, depthMeters: 1 }, growingAreas: [], plantings: [], healthRecords: [], ...records };
}
export function careOwner(garden: Garden): CareOwner {
  return garden.id === "all-gardens" ? { ownerScope: "workspace" } : { ownerScope: "garden", gardenId: garden.id };
}
export function careLocationKey(owner: CareOwner) {
  return owner.ownerScope === "workspace" ? "all-gardens" : owner.gardenId;
}
export function carePathLabel(record: CareEvent | CareTask, garden: Garden) {
  const target = careTargetLabel(record, garden.name);
  if (record.targetScope === "all-gardens" || record.targetScope === "garden") return target;
  const planting = garden.plantings.find((item) => item.id === record.plantingRecordId);
  const area = garden.growingAreas.find((item) => item.id === (record.growingAreaId ?? planting?.growingAreaId));
  const plantName = planting && !record.targetPlantingRecordDeleted ? plantDisplayName({ plantType: planting.plantType, variety: planting.variety, fallback: planting.commonName }) : target;
  return [garden.name, ...(record.targetScope === "plant-group" && area ? [area.name] : []), record.targetScope === "plant-group" ? plantName : target].join(" / ");
}

/** Projection only: IDs and source collections are never rewritten or copied into storage. */
export function careRows(gardens: Garden[], collection: "careEvents"): CareRow<CareEvent>[];
export function careRows(gardens: Garden[], collection: "careTasks"): CareRow<CareTask>[];
export function careRows(gardens: Garden[], collection: "careEvents" | "careTasks"): CareRow<CareEvent | CareTask>[] {
  const rootIds = new Set(gardens.find((garden) => garden.id === "all-gardens")?.[collection].map((record) => record.id));
  return gardens.flatMap((garden) => garden[collection].flatMap((record) => {
    // Legacy mirrors of a root-wide record count once; independent garden IDs remain distinct.
    if (garden.id !== "all-gardens" && record.targetScope === "all-gardens" && rootIds.has(record.id)) return [];
    const owner = careOwner(garden);
    return [{ key: JSON.stringify([owner.ownerScope, garden.id, record.id]), record, owner, garden, targetLabel: carePathLabel(record, garden) }];
  }));
}

export function updateCareOwner(workspace: GardenWorkspace, owner: CareOwner, update: (records: CareRecords) => CareRecords): GardenWorkspace {
  if (owner.ownerScope === "workspace") return { ...workspace, ...update({ careEvents: workspace.careEvents, careTasks: workspace.careTasks }) };
  return { ...workspace, gardens: workspace.gardens.map((garden) => garden.id === owner.gardenId ? { ...garden, ...update({ careEvents: garden.careEvents, careTasks: garden.careTasks }) } : garden) };
}

/** ADR-0023: completing a task writes one history record for the date it was done. */
export function careEventForTask(task: CareTask, date: string, owner: CareOwner, id: string): CareEvent {
  return {
    id,
    type: task.type,
    date,
    note: task.note,
    targetScope: owner.ownerScope === "workspace" ? "all-gardens" : task.targetScope,
    ...(task.targetScope === "planting-area"
      ? { growingAreaId: task.growingAreaId, growingAreaName: task.growingAreaName, ...(task.targetAreaDeleted ? { targetAreaDeleted: true } : {}) }
      : {}),
    ...(task.targetScope === "plant-group"
      ? { plantingRecordId: task.plantingRecordId, plantingRecordName: task.plantingRecordName, ...(task.targetPlantingRecordDeleted ? { targetPlantingRecordDeleted: true } : {}) }
      : {}),
  };
}

/** A one-time task leaves the list; a repeating task moves to its next date from the day it was done. */
export function completeCareTask(records: CareRecords, task: CareTask, event: CareEvent): CareRecords {
  return {
    ...records,
    careEvents: [...records.careEvents, event],
    careTasks: records.careTasks.flatMap((item) => item.id !== task.id ? [item]
      : item.repeatIntervalDays ? [{ ...item, dueDate: addDays(event.date, item.repeatIntervalDays) }] : []),
  };
}

/** Reverses completeCareTask: removes its history record and puts the task back as it was. */
export function undoCareTaskCompletion(records: CareRecords, task: CareTask, eventId: string): CareRecords {
  const present = records.careTasks.some((item) => item.id === task.id);
  return {
    ...records,
    careEvents: records.careEvents.filter((item) => item.id !== eventId),
    careTasks: present ? records.careTasks.map((item) => item.id === task.id ? task : item) : [...records.careTasks, task],
  };
}
