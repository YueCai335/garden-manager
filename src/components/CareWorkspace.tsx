"use client";

import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import { useCareTicks } from "@/hooks/useCareTicks";

import { useConfirmation } from "./ConfirmDialog";
import { startTransition, type FormEvent, useOptimistic, useRef, useState } from "react";
import { CareBoard, type CareBoardActions } from "./care/CareBoard";
import { CareHistory } from "./care/CareHistory";
import { CareCompletionForm, CareLocation, CareRecordFormFields, CareTaskFormFields } from "./care/CareForms";
import { CareDialog } from "./care/CareParts";
import { careBoard, CARE_WINDOW_DAYS } from "@/lib/careBoard";
import { careHistory, HISTORY_PAGE, type HistoryType } from "@/lib/careHistory";
import { calendarLabel } from "@/lib/careLabels";

import {
  addDays,
  createId,
  todayDate,
  type CareEvent,
  type CareTask,
  type Garden,
} from "@/lib/gardenWorkspace";
import {
  emptyCareForm,
  emptyCareTaskForm,
  isCalendarDate,
  plantGroupDisplayName,
  type CareForm,
  type CareTaskForm,
} from "@/lib/careRecords";

export type CareView = "tasks" | "history";

/** The two record lists the care screen edits. */
export type { CareRecords } from "@/lib/careViews";
import { careEventForTask, careRows, careOwner, completeCareTask as applyTaskCompletion, workspaceCareGarden, type CareOwner, type CareRecords, type CareRow } from "@/lib/careViews";
import styles from "./care/Care.module.css";

/**
 * Care (ADR-0080): the Today board and the History log. Rows project their owners; each open
 * form keeps its own owner even when a filter changes. The parent updates that source collection.
 */
export function CareWorkspace({
  garden: scopeGarden,
  gardens = [],
  locationFilter, onLocationChange,
  typeFilter, onTypeChange, onClearFilters,
  initialView = "tasks",
  viewHref,
  message = "",
  onMessage,
  onUpdateRecords,
}: {
  garden: Garden;
  gardens?: Garden[];
  /** On Tasks, the garden card to scroll to; on History, the garden filter (ADR-0080 D6, D10). */
  locationFilter?: string;
  onLocationChange?: (location: string) => void;
  typeFilter?: HistoryType;
  onTypeChange?: (type: HistoryType) => void;
  /** Resets both History filters in one address change. */
  onClearFilters?: () => void;
  initialView?: CareView;
  /** The Care route: views become links (`?view=`) instead of local state. */
  viewHref?: string;
  /** The page's status line (role="status"). */
  message?: string;
  onMessage: (message: string) => void;
  onUpdateRecords: (update: (records: CareRecords) => CareRecords, owner?: CareOwner) => void;
}) {
  const garden = scopeGarden;
  const allGardens = garden.id === "all-gardens";
  const sources = allGardens ? [garden, ...gardens] : [garden];
  const sourcesRef = useRef(sources); sourcesRef.current = sources;
  const [savedLocation, setSavedLocation] = useWorkspaceDraft(`care:${garden.id}:location`, "all");
  const [location, setPendingLocation] = useOptimistic(locationFilter ?? savedLocation);
  const changeLocation = (nextLocation: string) => {
    if (!onLocationChange) {
      setSavedLocation(nextLocation);
      return;
    }
    // The filter buttons show the new choice while the address change is still pending.
    startTransition(() => {
      setPendingLocation(nextLocation);
      onLocationChange(nextLocation);
    });
  };
  const [eventOwnerId, setEventOwnerId] = useWorkspaceDraft(`care:${garden.id}:eventOwner`, garden.id);
  const [taskOwnerId, setTaskOwnerId] = useWorkspaceDraft(`care:${garden.id}:taskOwner`, garden.id);
  const [completionOwnerId, setCompletionOwnerId] = useWorkspaceDraft(`care:${garden.id}:completionOwner`, garden.id);
  const eventGarden = sources.find((item) => item.id === eventOwnerId);
  const taskGarden = sources.find((item) => item.id === taskOwnerId);
  const completionGarden = sources.find((item) => item.id === completionOwnerId);
  const [localType, setLocalType] = useState<HistoryType>("all");
  const [type, setPendingType] = useOptimistic<HistoryType>(typeFilter ?? localType);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const changeType = (nextType: HistoryType) => {
    setLimit(HISTORY_PAGE);
    if (!onTypeChange) { setLocalType(nextType); return; }
    startTransition(() => {
      setPendingType(nextType);
      onTypeChange(nextType);
    });
  };
  const clearFilters = () => {
    setLimit(HISTORY_PAGE);
    if (!onClearFilters) { changeLocation("all"); changeType("all"); return; }
    startTransition(() => {
      setPendingLocation("all");
      setPendingType("all");
      onClearFilters();
    });
  };
  // A filter for a garden that no longer exists falls back to All (ADR-0080, 6.1).
  const knownLocation = location === "all" || sources.some((item) => item.id === location);
  const activeLocation = allGardens && knownLocation ? location : "all";
  const [actionError, setActionError] = useState("");
  const defaultScope = allGardens ? "all-gardens" : "garden";
  const { requestConfirmation, confirmation, confirmDiscard } = useConfirmation();
  const today = todayDate();
  const { completions, focus, tick, untick } = useCareTicks((owner, change) => onUpdateRecords(change, owner));
  const [localView, setView] = useState<CareView>(initialView);
  const view = viewHref ? initialView : localView;
  const [isFormOpen, setIsFormOpen] = useWorkspaceDraft(`care:${garden.id}:isFormOpen`, false);
  const [editingCareEventId, setEditingCareEventId] = useWorkspaceDraft<string | undefined>(`care:${garden.id}:editingCareEventId`, undefined);
  const [form, setForm] = useWorkspaceDraft<CareForm>(`care:${garden.id}:form`, emptyCareForm(defaultScope));
  const [isTaskFormOpen, setIsTaskFormOpen] = useWorkspaceDraft(`care:${garden.id}:isTaskFormOpen`, false);
  const [editingCareTaskId, setEditingCareTaskId] = useWorkspaceDraft<string | undefined>(`care:${garden.id}:editingCareTaskId`, undefined);
  const [taskForm, setTaskForm] = useWorkspaceDraft<CareTaskForm>(`care:${garden.id}:taskForm`, emptyCareTaskForm(defaultScope));
  const [completingCareTaskId, setCompletingCareTaskId] = useWorkspaceDraft<string | undefined>(`care:${garden.id}:completingCareTaskId`, undefined);
  const completionSubmitted = useRef(false);
  const [completionDate, setCompletionDate] = useWorkspaceDraft(`care:${garden.id}:completionDate`, "");

  const [careBaseline, setCareBaseline] = useWorkspaceDraft(`care:${garden.id}:baseline`, JSON.stringify(emptyCareForm(defaultScope)));
  const [taskBaseline, setTaskBaseline] = useWorkspaceDraft(`care:${garden.id}:taskBaseline`, JSON.stringify(emptyCareTaskForm(defaultScope)));
  const [completionBaseline, setCompletionBaseline] = useWorkspaceDraft(`care:${garden.id}:completionBaseline`, "");
  const careDirty = isFormOpen && JSON.stringify(form) !== careBaseline;
  const taskDirty = isTaskFormOpen && JSON.stringify(taskForm) !== taskBaseline;
  const startCareForm = (values: CareForm) => { setForm(values); setCareBaseline(JSON.stringify(values)); };
  const startTaskForm = (values: CareTaskForm) => { setTaskForm(values); setTaskBaseline(JSON.stringify(values)); };

  useUnsavedDraft(`care:${garden.id}`, careDirty || taskDirty || Boolean(completingCareTaskId && completionDate !== completionBaseline));

  const openAddCare = () => {
    const owner = allGardens ? (activeLocation === "all" ? "" : activeLocation) : garden.id;
    setEventOwnerId(owner); setActionError("");
    startCareForm(emptyCareForm(owner === "all-gardens" ? "all-gardens" : "garden"));
    setEditingCareEventId(undefined);
    setIsFormOpen(true);
  };

  const openEditCare = (row: CareRow<CareEvent>) => {
    const event = row.record;
    setEventOwnerId(row.garden.id); setActionError("");
    startCareForm({
      type: event.type,
      date: event.date,
      note: event.note,
      targetScope: event.targetScope,
      growingAreaId: event.growingAreaId ?? "",
      plantingRecordId: event.plantingRecordId ?? "",
      fertilizerProduct: event.fertilizerProduct ?? "",
      fertilizerAmount: event.fertilizerAmount ? String(event.fertilizerAmount) : "",
      fertilizerUnit: event.fertilizerUnit ?? "",
    });
    setEditingCareEventId(event.id);
    setIsFormOpen(true);
  };

  const cancelCare = () => {
    setActionError("");
    startCareForm(emptyCareForm(defaultScope));
    setIsFormOpen(false);
    setEditingCareEventId(undefined);
  };

  const saveCare = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const garden = eventGarden;
    if (!garden) return setActionError("Choose an available record location. Your draft is kept.");
    const allGardens = garden.id === "all-gardens";
    if (!isCalendarDate(form.date))
      return onMessage("Enter a valid care date.");
    const previous = garden.careEvents.find(
      (event) => event.id === editingCareEventId,
    );
    if (editingCareEventId && !previous) return setActionError("This care record no longer exists. Your draft is kept.");
    const area = garden.growingAreas.find(
      (candidate) => candidate.id === form.growingAreaId,
    );
    const planting = garden.plantings.find(
      (candidate) => candidate.id === form.plantingRecordId,
    );
    if (
      form.targetScope === "planting-area" &&
      !area &&
      !(previous?.targetScope === "planting-area" &&
        previous.growingAreaId === form.growingAreaId)
    )
      return onMessage("Choose an existing planting area.");
    if (
      form.targetScope === "plant-group" &&
      !planting &&
      !(previous?.targetScope === "plant-group" &&
        previous.plantingRecordId === form.plantingRecordId)
    )
      return onMessage("Choose an existing plant group.");

    const fertilizerProduct = form.fertilizerProduct.trim();
    const fertilizerUnit = form.fertilizerUnit.trim();
    const hasFertilizerAmount = Boolean(form.fertilizerAmount.trim());
    const fertilizerAmount = Number(form.fertilizerAmount);
    if (
      form.type === "fertilizing" &&
      hasFertilizerAmount &&
      (!Number.isFinite(fertilizerAmount) || fertilizerAmount <= 0)
    )
      return onMessage("Enter a fertilizer amount greater than zero.");

    const event: CareEvent = {
      id: editingCareEventId ?? createId("care"),
      type: form.type,
      date: form.date,
      note: form.note.trim(),
      targetScope: allGardens ? "all-gardens" : form.targetScope,
      ...(!allGardens && form.targetScope === "planting-area"
        ? {
            growingAreaId: form.growingAreaId,
            growingAreaName: area?.name ?? previous?.growingAreaName,
            ...(area ? {} : { targetAreaDeleted: true }),
          }
        : {}),
      ...(!allGardens && form.targetScope === "plant-group"
        ? {
            plantingRecordId: form.plantingRecordId,
            plantingRecordName:
              planting
                ? plantGroupDisplayName(planting, garden)
                : previous?.plantingRecordName,
            ...(planting ? {} : { targetPlantingRecordDeleted: true }),
          }
        : {}),
      ...(form.type === "fertilizing"
        ? {
            ...(fertilizerProduct ? { fertilizerProduct } : {}),
            ...(hasFertilizerAmount ? { fertilizerAmount } : {}),
            ...(fertilizerUnit ? { fertilizerUnit } : {}),
          }
        : {}),
    };
    const action = editingCareEventId ? "updated" : "added";
    onUpdateRecords((records) => ({
      ...records,
      careEvents: editingCareEventId
        ? records.careEvents.map((item) => (item.id === editingCareEventId ? event : item))
        : [...records.careEvents, event],
    }), careOwner(garden));
    cancelCare();
    onMessage(`${form.type === "watering" ? "Watering" : "Fertilizing"} event ${action}.`);
  };

  const removeCare = (row: CareRow<CareEvent>) => {
    const event = row.record;
    requestConfirmation({
      confirmLabel: "Delete care record", tone: "danger", fallbackFocusId: "care-history-heading",
      message: `Delete the ${event.type} record for ${row.targetLabel} on ${event.date}? This removes only this care-history entry and cannot be undone.`,
      onConfirm: () => {
        const latest = sourcesRef.current.find((item) => item.id === row.garden.id)?.careEvents.find((item) => item.id === event.id);
        if (!latest) throw new Error("This care record no longer exists. Cancel to return to history.");
        if (JSON.stringify(latest) !== JSON.stringify(event)) throw new Error("This care record changed. Cancel and review deletion again.");
        onUpdateRecords((records) => ({ ...records, careEvents: records.careEvents.filter((item) => item.id !== event.id) }), row.owner);
        if (eventOwnerId === row.garden.id && editingCareEventId === event.id) cancelCare();
        onMessage("Care record deleted.");
      },
    });
  };

  const openAddCareTask = () => {
    const owner = allGardens ? (activeLocation === "all" ? "" : activeLocation) : garden.id;
    setTaskOwnerId(owner); setActionError("");
    startTaskForm(emptyCareTaskForm(owner === "all-gardens" ? "all-gardens" : "garden"));
    setEditingCareTaskId(undefined);
    setIsTaskFormOpen(true);
  };

  const openEditCareTask = (row: CareRow<CareTask>) => {
    const task = row.record;
    setTaskOwnerId(row.garden.id); setActionError("");
    startTaskForm({
      type: task.type,
      dueDate: task.dueDate,
      note: task.note,
      targetScope: task.targetScope,
      growingAreaId: task.growingAreaId ?? "",
      plantingRecordId: task.plantingRecordId ?? "",
      repeatIntervalDays: task.repeatIntervalDays
        ? String(task.repeatIntervalDays)
        : "",
    });
    setEditingCareTaskId(task.id);
    setIsTaskFormOpen(true);
  };

  const cancelCareTask = () => {
    setActionError("");
    startTaskForm(emptyCareTaskForm(defaultScope));
    setIsTaskFormOpen(false);
    setEditingCareTaskId(undefined);
  };

  const saveCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const garden = taskGarden;
    if (!garden) return setActionError("Choose an available task location. Your draft is kept.");
    const allGardens = garden.id === "all-gardens";
    if (!isCalendarDate(taskForm.dueDate))
      return onMessage("Enter a valid due date.");
    const previous = garden.careTasks.find(
      (task) => task.id === editingCareTaskId,
    );
    if (editingCareTaskId && !previous) return setActionError("This task no longer exists. Your draft is kept.");
    const area = garden.growingAreas.find(
      (candidate) => candidate.id === taskForm.growingAreaId,
    );
    const planting = garden.plantings.find(
      (candidate) => candidate.id === taskForm.plantingRecordId,
    );
    if (
      taskForm.targetScope === "planting-area" &&
      !area &&
      !(previous?.targetScope === "planting-area" &&
        previous.growingAreaId === taskForm.growingAreaId)
    )
      return onMessage("Choose an existing planting area.");
    if (
      taskForm.targetScope === "plant-group" &&
      !planting &&
      !(previous?.targetScope === "plant-group" &&
        previous.plantingRecordId === taskForm.plantingRecordId)
    )
      return onMessage("Choose an existing plant group.");

    const hasRepeatInterval = Boolean(taskForm.repeatIntervalDays.trim());
    const repeatIntervalDays = Number(taskForm.repeatIntervalDays);
    if (
      hasRepeatInterval &&
      (!Number.isInteger(repeatIntervalDays) || repeatIntervalDays < 1)
    )
      return onMessage("Enter a whole-day repeat interval of at least 1.");

    const task: CareTask = {
      id: editingCareTaskId ?? createId("care-task"),
      type: taskForm.type,
      dueDate: taskForm.dueDate,
      note: taskForm.note.trim(),
      targetScope: allGardens ? "all-gardens" : taskForm.targetScope,
      ...(!allGardens && taskForm.targetScope === "planting-area"
        ? {
            growingAreaId: taskForm.growingAreaId,
            growingAreaName: area?.name ?? previous?.growingAreaName,
            ...(area ? {} : { targetAreaDeleted: true }),
          }
        : {}),
      ...(!allGardens && taskForm.targetScope === "plant-group"
        ? {
            plantingRecordId: taskForm.plantingRecordId,
            plantingRecordName: planting
              ? plantGroupDisplayName(planting, garden)
              : previous?.plantingRecordName,
            ...(planting ? {} : { targetPlantingRecordDeleted: true }),
          }
        : {}),
      ...(hasRepeatInterval ? { repeatIntervalDays } : {}),
    };
    const action = editingCareTaskId ? "updated" : "added";
    const later = task.dueDate > addDays(todayDate(), CARE_WINDOW_DAYS);
    onUpdateRecords((records) => ({
      ...records,
      careTasks: editingCareTaskId
        ? records.careTasks.map((item) => (item.id === editingCareTaskId ? task : item))
        : [...records.careTasks, task],
    }), careOwner(garden));
    cancelCareTask();
    // Care shows seven days ahead (ADR-0080 D5), so say when a later task will appear.
    onMessage(later
      ? `Task ${action}. It will appear here 7 days before ${calendarLabel(task.dueDate, { month: "long", day: "numeric", year: "numeric" })}.`
      : `${task.type === "watering" ? "Watering" : "Fertilizing"} task ${action}.`);
  };

  const openCompleteCareTask = (row: CareRow<CareTask>) => {
    completionSubmitted.current = false;
    const task = row.record;
    setCompletionOwnerId(row.garden.id); setActionError("");
    setCompletingCareTaskId(task.id);
    setCompletionDate(todayDate());
    setCompletionBaseline(todayDate());
  };

  const cancelCompletion = () => {
    setActionError("");
    setCompletingCareTaskId(undefined);
    setCompletionDate("");
  };

  const completeCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const garden = completionGarden;
    if (!garden) return setActionError("This task location no longer exists. Your completion date is kept.");
    if (!completingCareTaskId || completionSubmitted.current) return;
    if (!isCalendarDate(completionDate))
      return onMessage("Enter a valid completion date.");
    const task = garden.careTasks.find(
      (candidate) => candidate.id === completingCareTaskId,
    );
    if (!task) return setActionError("This task no longer exists. Your completion date is kept.");
    completionSubmitted.current = true;
    const owner = careOwner(garden);
    const event = careEventForTask(task, completionDate, owner, createId("care"));
    onUpdateRecords((records) => applyTaskCompletion(records, task, event), owner);
    cancelCompletion();
    onMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task completed.`);
  };

  const removeCareTask = (row: CareRow<CareTask>) => {
    const task = row.record;
    requestConfirmation({
      confirmLabel: "Delete task", tone: "danger", fallbackFocusId: "care-today-heading",
      message: `Delete the ${task.type} task for ${row.targetLabel} due ${task.dueDate}? This removes the pending task, including its repeat schedule. Completed care history stays available.`,
      onConfirm: () => {
        const latest = sourcesRef.current.find((item) => item.id === row.garden.id)?.careTasks.find((item) => item.id === task.id);
        if (!latest) throw new Error("This task no longer exists. Cancel to return to tasks.");
        if (JSON.stringify(latest) !== JSON.stringify(task)) throw new Error("This task changed. Cancel and review deletion again.");
        onUpdateRecords((records) => ({ ...records, careTasks: records.careTasks.filter((item) => item.id !== task.id) }), row.owner);
        if (taskOwnerId === row.garden.id && editingCareTaskId === task.id) cancelCareTask();
        if (completionOwnerId === row.garden.id && completingCareTaskId === task.id) cancelCompletion();
        onMessage("Care task deleted.");
      },
    });
  };

  // The board and History read the same records as the forms: the root first, then each garden.
  const root = allGardens ? garden : workspaceCareGarden({ careEvents: [], careTasks: [] });
  const records = { careEvents: root.careEvents, careTasks: root.careTasks, gardens: allGardens ? gardens : [garden] };
  const taskRow = (ownerId?: string, taskId?: string) => careRows(sources, "careTasks").find((row) => row.garden.id === ownerId && row.record.id === taskId);
  const editingTaskRow = taskRow(taskOwnerId, editingCareTaskId);
  const completionTask = completionGarden?.careTasks.find((task) => task.id === completingCareTaskId);
  const careTypeLabel = (type: "watering" | "fertilizing") => type === "watering" ? "watering" : "fertilizing";

  const actions: CareBoardActions = {
    onTick: (row, region) => {
      tick({ key: row.key, owner: row.owner, task: row.source?.record }, region);
      onMessage(`${row.title} ticked off for today.`);
    },
    onUntick: (row, region) => {
      untick(row.completion, region);
      onMessage(`${row.title} moved back to To do.`);
    },
    onEdit: (row) => confirmDiscard(taskDirty, () => openEditCareTask(row)),
    onCompleteOn: (row) => confirmDiscard(Boolean(completingCareTaskId && completionDate !== completionBaseline), () => openCompleteCareTask(row)),
    onDelete: removeCareTask,
  };
  const locationControl = (id: string, label: string, value: string, editing: boolean, onChange: (id: string) => void) =>
    allGardens ? <CareLocation id={id} label={label} gardens={sources} value={value} editing={editing} onChange={onChange} /> : undefined;
  // The missing-location notice comes first, so an earlier message cannot hide it.
  const statusText = [view === "history" && !knownLocation ? "That location no longer exists. Showing all records." : "", message].filter(Boolean).join(" ");

  // The status line sits under the band or strip, where a saved change is seen.
  const status = <p aria-live="polite" className={styles.status} role="status">{statusText}</p>;

  return (
    <div className={styles.page} data-view={view} id="care-workspace-heading">
      {confirmation}
      {actionError && <p className={styles.alert} role="alert">{actionError}</p>}
      {view === "tasks" ? <>
        <CareBoard
          board={careBoard(records, today, completions)}
          today={today}
          focus={focus}
          scrollTo={allGardens && locationFilter && locationFilter !== "all" ? locationFilter : undefined}
          onAddTask={() => confirmDiscard(taskDirty, openAddCareTask)}
          historyHref={viewHref ? `${viewHref}?view=history` : undefined}
          onHistory={viewHref ? undefined : () => setView("history")}
          actions={actions}
          status={status}
        />
        {isTaskFormOpen && <CareDialog id="care-task-dialog" title={editingCareTaskId ? "Edit care task" : "Add care task"}
          onClose={() => confirmDiscard(taskDirty, cancelCareTask, "care-today-heading")}>
          <CareTaskFormFields
            garden={taskGarden ?? garden}
            form={taskForm}
            editingCareTaskId={editingCareTaskId}
            locationControl={locationControl("task-location", "Task location", taskOwnerId, Boolean(editingCareTaskId), (id) => {
              setTaskOwnerId(id); setTaskForm({ ...taskForm, targetScope: id === "all-gardens" ? "all-gardens" : "garden", growingAreaId: "", plantingRecordId: "" }); setActionError("");
            })}
            onSave={saveCareTask}
            onCancel={() => confirmDiscard(taskDirty, cancelCareTask, "care-today-heading")}
            onSetForm={setTaskForm}
            extraActions={editingTaskRow && <>
              <button className="secondary-button" type="button" onClick={() => confirmDiscard(taskDirty, () => { cancelCareTask(); openCompleteCareTask(editingTaskRow); })}>Complete on another date…</button>
              <button className="remove-button" type="button" onClick={() => removeCareTask(editingTaskRow)}>Delete task</button>
            </>}
          />
        </CareDialog>}
        {completingCareTaskId && <CareDialog id="care-completion-dialog" title={`Complete ${completionTask ? careTypeLabel(completionTask.type) : "care"} task`}
          onClose={() => confirmDiscard(completionDate !== completionBaseline, cancelCompletion, "care-today-heading")}>
          <CareCompletionForm task={completionTask} location={completionGarden?.name} date={completionDate} onSetDate={setCompletionDate}
            onSave={completeCareTask} onCancel={() => confirmDiscard(completionDate !== completionBaseline, cancelCompletion, "care-today-heading")} />
        </CareDialog>}
      </> : <>
        <CareHistory
          history={careHistory(records, { today, location: activeLocation, type, limit })}
          gardens={allGardens ? gardens : []}
          location={activeLocation}
          type={type}
          careHref={viewHref}
          onBack={viewHref ? undefined : () => setView("tasks")}
          onLocation={(next) => { setLimit(HISTORY_PAGE); changeLocation(next); }}
          onType={changeType}
          onMore={() => setLimit((current) => current + HISTORY_PAGE)}
          onClear={clearFilters}
          onAddRecord={() => confirmDiscard(careDirty, openAddCare)}
          onCorrect={(row) => confirmDiscard(careDirty, () => openEditCare(row))}
          onDelete={removeCare}
          status={status}
        />
        {isFormOpen && <CareDialog id="care-record-dialog" title={editingCareEventId ? "Edit care event" : "Add care event"}
          onClose={() => confirmDiscard(careDirty, cancelCare, "care-history-heading")}>
          <CareRecordFormFields
            garden={eventGarden ?? garden}
            form={form}
            editingCareEventId={editingCareEventId}
            locationControl={locationControl("record-location", "Record location", eventOwnerId, Boolean(editingCareEventId), (id) => {
              setEventOwnerId(id); setForm({ ...form, targetScope: id === "all-gardens" ? "all-gardens" : "garden", growingAreaId: "", plantingRecordId: "" }); setActionError("");
            })}
            onSave={saveCare}
            onCancel={() => confirmDiscard(careDirty, cancelCare, "care-history-heading")}
            onSetForm={setForm}
          />
        </CareDialog>}
      </>}
    </div>
  );
}
