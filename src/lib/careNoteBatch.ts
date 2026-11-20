import { careDetailsFromForm, emptyCareDetailsForm, isCalendarDate, plantGroupDisplayName, type CareDetailsForm } from "./careRecords";
import { finishCareTask, updateCareOwner, type CareOwner } from "./careViews";
import { careDetailsOf, careEventTypes, type CareDetailField, type CareDetails, type CareEvent, type CareEventTargetScope, type CareEventType, type CareTask, type GardenWorkspace } from "./gardenWorkspace";
import { CARE_NOTE_BATCH_LIMIT, type CareNoteBatchDraftResponse, type CareNoteBatchTaskSuggestion } from "./gardenWorkspaceApi";
import { matchNoteTasks, type TaskRef } from "./noteTaskMatch";

export type CareDraftRow = CareDetailsForm & {
  draftId: string; eventId: string; included: boolean; sourceText: string; note: string;
  gardenId: string; type: CareEventType | ""; date: string; targetScope: CareEventTargetScope | "";
  growingAreaId: string; plantingRecordId: string; reviewNotes: string[];
  /** Matched tasks the gardener unticked; every other match is completed on save (ADR-0085). */
  skippedTaskKeys?: string[];
};
/** A planned job the gardener chose to add as a Care task, with its ID allocated on that click. */
export type TaskDraft = { taskId: string; sourceText: string; suggestion: CareNoteBatchTaskSuggestion };
/** Error field IDs keep their earlier names: "amount" for the fertilizer amount, "count" for plants. */
const detailErrorField: Partial<Record<CareDetailField, string>> = { fertilizerAmount: "amount", plantCount: "count" };
export const batchFieldId = (row: CareDraftRow, field: string) => `batch-${row.draftId}-${field}`;

/** Allocate identity on an explicit action, never inside a React updater. */
export function newCareDraft(draft?: CareNoteBatchDraftResponse["drafts"][number]): CareDraftRow {
  return {
    draftId: crypto.randomUUID(), eventId: `care-${crypto.randomUUID()}`, included: true,
    sourceText: draft?.sourceText ?? "", note: draft?.sourceText ?? "", gardenId: draft?.gardenId ?? "",
    type: draft?.type ?? "", date: draft?.date ?? "", targetScope: draft?.targetScope ?? "",
    growingAreaId: draft?.growingAreaId ?? "", plantingRecordId: draft?.plantingRecordId ?? "",
    ...Object.fromEntries(Object.entries(emptyCareDetailsForm()).map(([field]) => [field, draft?.[field as CareDetailField]?.toString() ?? ""])) as CareDetailsForm,
    reviewNotes: draft?.reviewNotes ?? [],
  };
}

export function batchRowsErrors(workspace: GardenWorkspace, rows: CareDraftRow[]) {
  const errors: Record<string, string> = {};
  const ids = new Set<string>();
  for (const row of rows.filter((item) => item.included)) {
    const set = (field: string, message: string) => { errors[batchFieldId(row, field)] = message; };
    if (!row.eventId || ids.has(row.eventId)) set("type", "This draft has a duplicate record identity. Remove it and add a new draft.");
    ids.add(row.eventId);
    if (!careEventTypes.some((type) => type === row.type)) set("type", "Choose a care type.");
    if (!isCalendarDate(row.date)) set("date", "Enter a valid care date.");
    const garden = workspace.gardens.find((item) => item.id === row.gardenId);
    if (row.targetScope !== "all-gardens" && !garden) set("garden", "Choose an existing garden.");
    if (!["all-gardens", "garden", "planting-area", "plant-group"].includes(row.targetScope)) set("target", "Choose a target.");
    if (row.targetScope === "planting-area" && !garden?.growingAreas.some((item) => item.id === row.growingAreaId)) set("target", "Choose an existing planting area in this garden.");
    if (row.targetScope === "plant-group" && !garden?.plantings.some((item) => item.id === row.plantingRecordId)) set("target", "Choose an existing plant group in this garden.");
    if (row.note.length > 5000) set("note", "Shorten this record note to 5000 characters.");
    const details = row.type ? careDetailsFromForm(row.type, row) : { details: {} };
    if ("error" in details) set(detailErrorField[details.field] ?? details.field, details.field === "fertilizerAmount" ? "Enter an amount greater than zero, or leave it empty." : details.error);
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
    // Rows were validated first, so the details parse; a bad value never reaches a record.
    ...(() => { const result = careDetailsFromForm(row.type as CareEventType, row); return "details" in result ? result.details : {}; })(),
  };
}

/** The open tasks each included row would complete, keyed by draft ID, from one workspace snapshot. */
export function rowTaskMatches(workspace: GardenWorkspace, rows: CareDraftRow[]): Map<string, TaskRef[]> {
  return matchNoteTasks(workspace, rows.filter((row) => row.included).map((row) => ({ ...row, key: row.draftId })));
}

const detailsFromSuggestion = (suggestion: CareNoteBatchTaskSuggestion, type: CareEventType): CareDetails =>
  careDetailsOf({ type, ...Object.fromEntries(Object.entries(suggestion).filter(([, value]) => value !== null && value !== undefined)) } as CareDetails & { type: CareEventType });

/**
 * A Care task from a planned job's suggestion, or undefined when the note left out the type, the due
 * date, or a target that still exists. The job's own words become the task's note.
 */
export function taskFromSuggestion(workspace: GardenWorkspace, draft: TaskDraft): { owner: CareOwner; task: CareTask } | undefined {
  const { suggestion } = draft;
  if (!suggestion.type || !suggestion.dueDate || !isCalendarDate(suggestion.dueDate) || !suggestion.targetScope) return undefined;
  const base = { id: draft.taskId, type: suggestion.type, dueDate: suggestion.dueDate, note: draft.sourceText, ...detailsFromSuggestion(suggestion, suggestion.type) };
  if (suggestion.targetScope === "all-gardens") return { owner: { ownerScope: "workspace" }, task: { ...base, targetScope: "all-gardens" } };
  const garden = workspace.gardens.find((item) => item.id === suggestion.gardenId);
  if (!garden) return undefined;
  const owner: CareOwner = { ownerScope: "garden", gardenId: garden.id };
  if (suggestion.targetScope === "garden") return { owner, task: { ...base, targetScope: "garden" } };
  if (suggestion.targetScope === "planting-area") {
    const area = garden.growingAreas.find((item) => item.id === suggestion.growingAreaId);
    return area ? { owner, task: { ...base, targetScope: "planting-area", growingAreaId: area.id, growingAreaName: area.name } } : undefined;
  }
  const planting = garden.plantings.find((item) => item.id === suggestion.plantingRecordId);
  return planting ? { owner, task: { ...base, targetScope: "plant-group", plantingRecordId: planting.id, plantingRecordName: plantGroupDisplayName(planting, garden) } } : undefined;
}

export function batchRowsPresent(workspace: GardenWorkspace, rows: CareDraftRow[]) {
  return rows.every((row) => (row.targetScope === "all-gardens" ? workspace.careEvents : workspace.gardens.find((garden) => garden.id === row.gardenId)?.careEvents)?.some((event) => event.id === row.eventId));
}

/**
 * Validate the whole selection against the latest snapshot before writing any row. A saved row also
 * finishes the open tasks it matches (ADR-0085): the row is that task's history record, so no second
 * record is written. Chosen planned jobs become new tasks in the same save.
 */
export function applyCareDraftBatch(workspace: GardenWorkspace, rows: CareDraftRow[], taskDrafts: TaskDraft[] = []) {
  const selected = rows.filter((row) => row.included);
  const errors = batchRowsErrors(workspace, rows);
  const none = { workspace, errors, added: 0, tasksCompleted: 0, tasksAdded: 0 };
  if ((!selected.length && !taskDrafts.length) || selected.length > CARE_NOTE_BATCH_LIMIT) errors.batch = `Select between 1 and ${CARE_NOTE_BATCH_LIMIT} records to save.`;
  const newTasks = taskDrafts.map((draft) => taskFromSuggestion(workspace, draft));
  if (newTasks.some((item) => !item)) errors.batch = "A planned job is missing its type, date, or target. Add it in Care instead.";
  if (Object.keys(errors).length) return none;
  const matches = rowTaskMatches(workspace, rows);
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
  if (Object.keys(errors).length || (!pending.length && !taskDrafts.length)) return none;
  let next: GardenWorkspace = {
    ...workspace,
    careEvents: [...workspace.careEvents, ...pending.filter(({ row }) => row.targetScope === "all-gardens").map(({ event }) => event)],
    gardens: workspace.gardens.map((garden) => {
      const additions = pending.filter(({ row }) => row.targetScope !== "all-gardens" && row.gardenId === garden.id).map(({ event }) => event);
      return additions.length ? { ...garden, careEvents: [...garden.careEvents, ...additions] } : garden;
    }),
  };
  // Only rows written now finish tasks, so a replay of saved rows never advances a task twice.
  let tasksCompleted = 0;
  for (const { row } of pending) {
    for (const ref of matches.get(row.draftId) ?? []) {
      if (row.skippedTaskKeys?.includes(ref.key)) continue;
      next = updateCareOwner(next, ref.owner, (records) => finishCareTask(records, ref.task.id, row.date));
      tasksCompleted += 1;
    }
  }
  let tasksAdded = 0;
  for (const item of newTasks) {
    // A replay keeps the task its ID already added instead of adding it twice.
    next = updateCareOwner(next, item!.owner, (records) => records.careTasks.some((task) => task.id === item!.task.id) ? records
      : (tasksAdded += 1, { ...records, careTasks: [...records.careTasks, item!.task] }));
  }
  return { workspace: next, errors, added: pending.length, tasksCompleted, tasksAdded };
}
