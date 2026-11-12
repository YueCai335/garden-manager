import { isCalendarDate, plantGroupDisplayName } from "./careRecords";
import type { CareEvent, CareEventTargetScope, CareEventType, GardenWorkspace } from "./gardenWorkspace";
import type { CareNoteBatchDraftResponse } from "./gardenWorkspaceApi";

export type CareDraftRow = {
  draftId: string; eventId: string; included: boolean; sourceText: string; note: string;
  gardenId: string; type: CareEventType | ""; date: string; targetScope: CareEventTargetScope | "";
  growingAreaId: string; plantingRecordId: string;
  fertilizerProduct: string; fertilizerAmount: string; fertilizerUnit: string; reviewNotes: string[];
};
export const batchFieldId = (row: CareDraftRow, field: string) => `batch-${row.draftId}-${field}`;

/** Allocate identity on an explicit action, never inside a React updater. */
export function newCareDraft(draft?: CareNoteBatchDraftResponse["drafts"][number]): CareDraftRow {
  return {
    draftId: crypto.randomUUID(), eventId: `care-${crypto.randomUUID()}`, included: true,
    sourceText: draft?.sourceText ?? "", note: draft?.sourceText ?? "", gardenId: draft?.gardenId ?? "",
    type: draft?.type ?? "", date: draft?.date ?? "", targetScope: draft?.targetScope ?? "",
    growingAreaId: draft?.growingAreaId ?? "", plantingRecordId: draft?.plantingRecordId ?? "",
    fertilizerProduct: draft?.fertilizerProduct ?? "", fertilizerAmount: draft?.fertilizerAmount?.toString() ?? "",
    fertilizerUnit: draft?.fertilizerUnit ?? "", reviewNotes: draft?.reviewNotes ?? [],
  };
}

export function batchRowsErrors(workspace: GardenWorkspace, rows: CareDraftRow[]) {
  const errors: Record<string, string> = {};
  const ids = new Set<string>();
  for (const row of rows.filter((item) => item.included)) {
    const set = (field: string, message: string) => { errors[batchFieldId(row, field)] = message; };
    if (!row.eventId || ids.has(row.eventId)) set("type", "This draft has a duplicate record identity. Remove it and add a new draft.");
    ids.add(row.eventId);
    if (!["watering", "fertilizing"].includes(row.type)) set("type", "Choose a care type.");
    if (!isCalendarDate(row.date)) set("date", "Enter a valid care date.");
    const garden = workspace.gardens.find((item) => item.id === row.gardenId);
    if (row.targetScope !== "all-gardens" && !garden) set("garden", "Choose an existing garden.");
    if (!["all-gardens", "garden", "planting-area", "plant-group"].includes(row.targetScope)) set("target", "Choose a target.");
    if (row.targetScope === "planting-area" && !garden?.growingAreas.some((item) => item.id === row.growingAreaId)) set("target", "Choose an existing planting area in this garden.");
    if (row.targetScope === "plant-group" && !garden?.plantings.some((item) => item.id === row.plantingRecordId)) set("target", "Choose an existing plant group in this garden.");
    if (row.note.length > 5000) set("note", "Shorten this record note to 5000 characters.");
    if (row.type === "fertilizing" && row.fertilizerAmount.trim() && (!Number.isFinite(Number(row.fertilizerAmount)) || Number(row.fertilizerAmount) <= 0)) set("amount", "Enter an amount greater than zero, or leave it empty.");
  }
  return errors;
}

function rowEvent(workspace: GardenWorkspace, row: CareDraftRow): CareEvent {
  const garden = workspace.gardens.find((item) => item.id === row.gardenId);
  const area = garden?.growingAreas.find((item) => item.id === row.growingAreaId);
  const planting = garden?.plantings.find((item) => item.id === row.plantingRecordId);
  return {
    id: row.eventId, type: row.type as CareEventType, date: row.date, note: row.note.trim(), targetScope: row.targetScope as CareEventTargetScope,
    ...(row.targetScope === "planting-area" ? { growingAreaId: area!.id, growingAreaName: area!.name } : {}),
    ...(row.targetScope === "plant-group" ? { plantingRecordId: planting!.id, plantingRecordName: plantGroupDisplayName(planting!, garden!) } : {}),
    ...(row.type === "fertilizing" ? {
      ...(row.fertilizerProduct.trim() ? { fertilizerProduct: row.fertilizerProduct.trim() } : {}),
      ...(row.fertilizerAmount.trim() ? { fertilizerAmount: Number(row.fertilizerAmount) } : {}),
      ...(row.fertilizerUnit.trim() ? { fertilizerUnit: row.fertilizerUnit.trim() } : {}),
    } : {}),
  };
}

export function batchRowsPresent(workspace: GardenWorkspace, rows: CareDraftRow[]) {
  return rows.every((row) => (row.targetScope === "all-gardens" ? workspace.careEvents : workspace.gardens.find((garden) => garden.id === row.gardenId)?.careEvents)?.some((event) => event.id === row.eventId));
}

/** Validate the whole selection against the latest snapshot before writing any row. */
export function applyCareDraftBatch(workspace: GardenWorkspace, rows: CareDraftRow[]) {
  const selected = rows.filter((row) => row.included);
  const errors = batchRowsErrors(workspace, rows);
  if (!selected.length || selected.length > 6) errors.batch = "Select between 1 and 6 records to save.";
  if (Object.keys(errors).length) return { workspace, errors, added: 0 };
  const pending: Array<{ row: CareDraftRow; event: CareEvent }> = [];
  for (const row of selected) {
    const event = rowEvent(workspace, row);
    const owner = row.targetScope === "all-gardens" ? "" : row.gardenId;
    const existing = [
      ...workspace.careEvents.map((item) => ({ owner: "", event: item })),
      ...workspace.gardens.flatMap((garden) => garden.careEvents.map((item) => ({ owner: garden.id, event: item }))),
    ].filter((item) => item.event.id === row.eventId);
    if (existing.length) {
      // A replay may reuse identical records, but may never overwrite a collision.
      if (existing.length !== 1 || existing[0].owner !== owner || Object.keys({ ...existing[0].event, ...event }).some((key) => existing[0].event[key as keyof CareEvent] !== event[key as keyof CareEvent])) {
        errors[batchFieldId(row, "type")] = "This record changed after it was added. Review History before adding another record.";
      }
    } else pending.push({ row, event });
  }
  if (Object.keys(errors).length || !pending.length) return { workspace, errors, added: 0 };
  return {
    workspace: {
      ...workspace,
      careEvents: [...workspace.careEvents, ...pending.filter(({ row }) => row.targetScope === "all-gardens").map(({ event }) => event)],
      gardens: workspace.gardens.map((garden) => {
        const additions = pending.filter(({ row }) => row.targetScope !== "all-gardens" && row.gardenId === garden.id).map(({ event }) => event);
        return additions.length ? { ...garden, careEvents: [...garden.careEvents, ...additions] } : garden;
      }),
    }, errors, added: pending.length,
  };
}
