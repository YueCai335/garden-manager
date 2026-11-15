"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";

import { useConfirmation } from "./ConfirmDialog";
import Link from "next/link";
import { startTransition, type FormEvent, type ReactNode, useOptimistic, useRef, useState } from "react";

import {
  addDays,
  careTaskStatus,
  createId,
  todayDate,
  type CareEvent,
  type CareEventTargetScope,
  type CareEventType,
  type CareTask,
  type Garden,
} from "@/lib/gardenWorkspace";
import {
  careFertilizerDetails,
  careTargetLabel,
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
import { careRows, careOwner, careLocationKey, type CareOwner, type CareRecords, type CareRow } from "@/lib/careViews";
import styles from "./care/Care.module.css";

/**
 * Care lists project their owners; each open form keeps its own owner even
 * when the browsing filter changes. The parent updates that source collection.
 */
export function CareWorkspace({
  garden: scopeGarden,
  gardens = [],
  locationFilter, onLocationChange,
  initialView = "tasks",
  viewHref,
  onMessage,
  onUpdateRecords,
}: {
  garden: Garden;
  gardens?: Garden[];
  locationFilter?: string;
  onLocationChange?: (location: string) => void;
  initialView?: CareView;
  viewHref?: string;
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
    // The view links need the new filter while the URL transition is still pending.
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
  const eventRows = careRows(sources, "careEvents").filter((row) => !allGardens || location === "all" || careLocationKey(row.owner) === location);
  const taskRows = careRows(sources, "careTasks").filter((row) => !allGardens || location === "all" || careLocationKey(row.owner) === location);
  const [actionError, setActionError] = useState("");
  const defaultScope = allGardens ? "all-gardens" : "garden";
  const { requestConfirmation, confirmation, confirmDiscard } = useConfirmation();
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
    const owner = allGardens ? (location === "all" ? "" : location) : garden.id;
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
    const owner = allGardens ? (location === "all" ? "" : location) : garden.id;
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
    onUpdateRecords((records) => ({
      ...records,
      careTasks: editingCareTaskId
        ? records.careTasks.map((item) => (item.id === editingCareTaskId ? task : item))
        : [...records.careTasks, task],
    }), careOwner(garden));
    cancelCareTask();
    onMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task ${action}.`);
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
    const allGardens = garden.id === "all-gardens";
    if (!completingCareTaskId || completionSubmitted.current) return;
    if (!isCalendarDate(completionDate))
      return onMessage("Enter a valid completion date.");
    const task = garden.careTasks.find(
      (candidate) => candidate.id === completingCareTaskId,
    );
    if (!task) return setActionError("This task no longer exists. Your completion date is kept.");
    completionSubmitted.current = true;
    const event: CareEvent = {
      id: createId("care"),
      type: task.type,
      date: completionDate,
      note: task.note,
      targetScope: allGardens ? "all-gardens" : task.targetScope,
      ...(task.targetScope === "planting-area"
        ? {
            growingAreaId: task.growingAreaId,
            growingAreaName: task.growingAreaName,
            ...(task.targetAreaDeleted ? { targetAreaDeleted: true } : {}),
          }
        : {}),
      ...(task.targetScope === "plant-group"
        ? {
            plantingRecordId: task.plantingRecordId,
            plantingRecordName: task.plantingRecordName,
            ...(task.targetPlantingRecordDeleted
              ? { targetPlantingRecordDeleted: true }
              : {}),
          }
        : {}),
    };
    onUpdateRecords((records) => ({
      careEvents: [...records.careEvents, event],
      careTasks: records.careTasks.flatMap((item) =>
        item.id !== task.id
          ? [item]
          : item.repeatIntervalDays
            ? [{ ...item, dueDate: addDays(completionDate, item.repeatIntervalDays) }]
            : [],
      ),
    }), careOwner(garden));
    cancelCompletion();
    onMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task completed.`);
  };

  const removeCareTask = (row: CareRow<CareTask>) => {
    const task = row.record;
    requestConfirmation({
      confirmLabel: "Delete task", tone: "danger", fallbackFocusId: "care-tasks-heading",
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

  return (
    <section className="management-section care-workspace" id="care-workspace-heading" aria-label="Care records">
      {confirmation}
      <div className={styles.toolbar}>
        <div aria-label="Care views" className={styles.views} role={viewHref ? "navigation" : "tablist"} onKeyDown={viewHref ? undefined : (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "tasks" : event.key === "End" ? "history" : view === "tasks" ? "history" : "tasks";
          setView(next);
          document.getElementById(`care-tab-${next}`)?.focus();
        }}>
          {viewHref ? <>{(["tasks", "history"] as const).map((item) => <Link key={item} className="text-button" href={`${viewHref}?view=${item}${allGardens && location !== "all" ? `&location=${encodeURIComponent(location)}` : ""}`} aria-current={view === item ? "page" : undefined}>{item === "tasks" ? "Tasks" : "History"}</Link>)}</> : <>
          <button
            aria-selected={view === "tasks"}
            id="care-tab-tasks" aria-controls="care-panel-tasks" tabIndex={view === "tasks" ? 0 : -1}
            className="text-button"
            onClick={() => setView("tasks")}
            role="tab"
            type="button"
          >
            Tasks
          </button>
          <button
            aria-selected={view === "history"}
            id="care-tab-history" aria-controls="care-panel-history" tabIndex={view === "history" ? 0 : -1}
            className="text-button"
            onClick={() => setView("history")}
            role="tab"
            type="button"
          >
            History
          </button>
          </>}
        </div>
        {allGardens && <div className={styles.filter}>
          <label htmlFor="care-location-filter">Location</label>
          <select id="care-location-filter" value={location} onChange={(event) => changeLocation(event.target.value)}>
            <option value="all">All locations</option>
            {location !== "all" && !sources.some((item) => item.id === location) && <option value={location}>Location no longer available</option>}
            <option value="all-gardens">All gardens records</option>
            {gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <p>{view === "tasks" ? `${taskRows.length} ${taskRows.length === 1 ? "task" : "tasks"}` : `${eventRows.length} ${eventRows.length === 1 ? "record" : "records"}`}</p>
        </div>}
      </div>
      {actionError && <p role="alert">{actionError}</p>}
      <div id="care-panel-tasks" role={viewHref ? undefined : "tabpanel"} aria-labelledby={viewHref ? undefined : "care-tab-tasks"} hidden={view !== "tasks"}>
      {view === "tasks" && <CareTasks
          garden={taskGarden ?? garden}
          rows={taskRows}
          locationControl={allGardens && <CareLocation id="task-location" label="Task location" gardens={sources} value={taskOwnerId} editing={Boolean(editingCareTaskId)} onChange={(id) => {
            setTaskOwnerId(id); setTaskForm({ ...taskForm, targetScope: id === "all-gardens" ? "all-gardens" : "garden", growingAreaId: "", plantingRecordId: "" }); setActionError("");
          }} />}
          completionRequested={Boolean(completingCareTaskId)}
          completionTask={completionGarden?.careTasks.find((task) => task.id === completingCareTaskId)}
          completionLocation={completionGarden?.name}
          form={taskForm}
          completionDate={completionDate}
          editingCareTaskId={editingCareTaskId}
          isFormOpen={isTaskFormOpen}
          onAdd={() => confirmDiscard(taskDirty, openAddCareTask)}
          onCancel={() => confirmDiscard(taskDirty, cancelCareTask, "care-tasks-heading")}
          onCancelCompletion={() => confirmDiscard(completionDate !== completionBaseline, cancelCompletion, "care-tasks-heading")}
          onComplete={(task) => confirmDiscard(Boolean(completingCareTaskId && completionDate !== completionBaseline), () => openCompleteCareTask(task))}
          onEdit={(task) => confirmDiscard(taskDirty, () => openEditCareTask(task))}
          onRemove={removeCareTask}
          onSave={saveCareTask}
          onSaveCompletion={completeCareTask}
          onSetCompletionDate={setCompletionDate}
          onSetForm={setTaskForm}
        />}
      </div>
      <div id="care-panel-history" role={viewHref ? undefined : "tabpanel"} aria-labelledby={viewHref ? undefined : "care-tab-history"} hidden={view !== "history"}>
      {view === "history" && <CareLog
          garden={eventGarden ?? garden}
          rows={eventRows}
          locationControl={allGardens && <CareLocation id="record-location" label="Record location" gardens={sources} value={eventOwnerId} editing={Boolean(editingCareEventId)} onChange={(id) => {
            setEventOwnerId(id); setForm({ ...form, targetScope: id === "all-gardens" ? "all-gardens" : "garden", growingAreaId: "", plantingRecordId: "" }); setActionError("");
          }} />}
          editingCareEventId={editingCareEventId}
          form={form}
          isFormOpen={isFormOpen}
          onAdd={() => confirmDiscard(careDirty, openAddCare)}
          onCancel={() => confirmDiscard(careDirty, cancelCare, "care-history-heading")}
          onEdit={(event) => confirmDiscard(careDirty, () => openEditCare(event))}
          onRemove={removeCare}
          onSave={saveCare}
          onSetForm={setForm}
        />}
      </div>
    </section>
  );
}

function CareTasks({
  garden,
  rows, locationControl, completionTask: completingTask, completionLocation, completionRequested,
  form,
  completionDate,
  editingCareTaskId,
  isFormOpen,
  onAdd,
  onCancel,
  onCancelCompletion,
  onComplete,
  onEdit,
  onRemove,
  onSave,
  onSaveCompletion,
  onSetCompletionDate,
  onSetForm,
}: {
  garden: Garden;
  form: CareTaskForm;
  rows: CareRow<CareTask>[];
  locationControl?: ReactNode;
  completionTask?: CareTask;
  completionRequested: boolean;
  completionLocation?: string;
  completionDate: string;
  editingCareTaskId?: string;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onCancelCompletion: () => void;
  onComplete: (task: CareRow<CareTask>) => void;
  onEdit: (task: CareRow<CareTask>) => void;
  onRemove: (task: CareRow<CareTask>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSaveCompletion: (event: FormEvent<HTMLFormElement>) => void;
  onSetCompletionDate: (date: string) => void;
  onSetForm: (form: CareTaskForm) => void;
}) {
  const historicalTarget = garden.careTasks.find(
    (task) => task.id === editingCareTaskId,
  );
  const hasTaskChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.dueDate !== historicalTarget.dueDate ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      form.repeatIntervalDays !== String(historicalTarget.repeatIntervalDays ?? "")
    ),
  );
  const today = todayDate();
  const groups = [
    ["overdue", "Overdue"],
    ["due-today", "Due today"],
    ["upcoming", "Upcoming"],
  ] as const;

  return (
    <section className="care-view" aria-labelledby="care-tasks-heading">
      <div className="care-view-header">
        <h2 id="care-tasks-heading" tabIndex={-1}>Tasks</h2>
        <button className="primary-button" onClick={onAdd} type="button">Add task</button>
      </div>
      {isFormOpen ? (
        <FeedbackForm className="care-form" onSubmit={onSave} validate={() => ({
          "care-task-due-date": !isCalendarDate(form.dueDate) ? "Enter a valid due date." : undefined,
          "care-task-target": careTargetError(garden, form, historicalTarget),
        })}>
          <h3>{editingCareTaskId ? "Edit care task" : "Add care task"}</h3>
          {locationControl}
          <div className="field">
            <label htmlFor="care-task-type">Care type</label>
            <select
              id="care-task-type"
              onChange={(event) => onSetForm({ ...form, type: event.target.value as CareEventType })}
              value={form.type}
            >
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </div>
          <FormField id="care-task-due-date" className="field">
            <label htmlFor="care-task-due-date">Due date</label>
            <input
              autoFocus
              id="care-task-due-date"
              onChange={(event) => onSetForm({ ...form, dueDate: event.target.value })}
              required
              type="date"
              value={form.dueDate}
            />
          </FormField>
          <CareTargetSelect
            form={form}
            garden={garden}
            historicalTarget={historicalTarget}
            onSetForm={onSetForm}
          />
          <FormField id="care-task-repeat" className="field">
            <label htmlFor="care-task-repeat">Repeat every whole days (optional)</label>
            <input
              id="care-task-repeat"
              min="1"
              onChange={(event) => onSetForm({ ...form, repeatIntervalDays: event.target.value })}
              step="1"
              type="number"
              value={form.repeatIntervalDays}
            />
          </FormField>
          <div className="field care-note-field">
            <label htmlFor="care-task-note">Note (optional)</label>
            <input
              id="care-task-note"
              onChange={(event) => onSetForm({ ...form, note: event.target.value })}
              value={form.note}
            />
          </div>
          <div className="form-actions">
            {editingCareTaskId
              ? hasTaskChanges || !historicalTarget ? <button className="primary-button" type="submit">Save care task</button> : null
              : <button className="primary-button" type="submit">Add care task</button>}
            <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
          </div>
        </FeedbackForm>
      ) : null}
      {completionRequested ? (
        <FeedbackForm className="care-completion-form" onSubmit={onSaveCompletion} validate={() => ({ "care-task-completion-date": !isCalendarDate(completionDate) ? "Enter a valid completion date." : undefined })}>
          <h3>Complete {completingTask?.type === "watering" ? "watering" : completingTask ? "fertilizing" : "care"} task</h3>
          {completingTask ? <p>{completionLocation} · {careTargetLabel(completingTask, completionLocation)}</p> : <p role="alert">This task is no longer available. Your completion date is kept; cancel to return to the list.</p>}
          <FormField id="care-task-completion-date" className="field">
            <label htmlFor="care-task-completion-date">Completion date</label>
            <input
              id="care-task-completion-date" autoFocus
              onChange={(event) => onSetCompletionDate(event.target.value)}
              required
              type="date"
              value={completionDate}
            />
          </FormField>
          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={!completingTask}>Complete task</button>
            <button className="secondary-button" onClick={onCancelCompletion} type="button">Cancel</button>
          </div>
        </FeedbackForm>
      ) : null}
      {groups.map(([status, label]) => {
        const tasks = rows
          .filter((row) => careTaskStatus(row.record, today) === status)
          .sort((left, right) => left.record.dueDate.localeCompare(right.record.dueDate));
        return (
          <section className="care-task-group" key={status} aria-labelledby={`care-task-${status}`}>
            <h3 id={`care-task-${status}`}>{label}</h3>
            {tasks.length ? (
              <ul className="care-event-list">
                {tasks.map((row) => { const task = row.record; return (
                  <li key={row.key} className={styles.row}>
                    <div>
                      <strong>{task.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                      <p>{row.targetLabel}</p>
                      <p>Due {task.dueDate}{task.repeatIntervalDays ? ` · Repeats every ${task.repeatIntervalDays} days` : ""}</p>
                      {task.note && <p className={styles.note}>{task.note}</p>}
                    </div>
                    <div className="area-actions">
                      <button className="primary-button" onClick={() => onComplete(row)} type="button">Complete</button>
                      <button className="text-button" onClick={() => onEdit(row)} type="button">Edit</button>
                      <button className="remove-button" onClick={() => onRemove(row)} type="button">Delete</button>
                    </div>
                  </li>
                ); })}
              </ul>
            ) : (
              <p className="section-context">No {label.toLowerCase()} tasks.</p>
            )}
          </section>
        );
      })}
    </section>
  );
}

function CareTargetSelect({
  form,
  garden,
  historicalTarget,
  onSetForm,
}: {
  form: CareTaskForm;
  garden: Garden;
  historicalTarget?: CareTask;
  onSetForm: (form: CareTaskForm) => void;
}) {
  return (
    <FormField id="care-task-target" className="field">
      <label htmlFor="care-task-target">Target</label>
      <select
        id="care-task-target" required
        onChange={(event) => {
          const [targetScope, targetId] = event.target.value.split(":");
          onSetForm({
            ...form,
            targetScope: targetScope as CareEventTargetScope,
            growingAreaId: targetScope === "planting-area" ? targetId : "",
            plantingRecordId: targetScope === "plant-group" ? targetId : "",
          });
        }}
        value={form.targetScope === "all-gardens" || form.targetScope === "garden" ? form.targetScope : `${form.targetScope}:${form.targetScope === "planting-area" ? form.growingAreaId : form.plantingRecordId}`}
      >
        <option value={garden.id === "all-gardens" ? "all-gardens" : "garden"}>{garden.name}</option>
        <optgroup label="Planting areas">
          {historicalTarget?.targetScope === "planting-area" &&
          historicalTarget.growingAreaId === form.growingAreaId &&
          !garden.growingAreas.some((area) => area.id === form.growingAreaId) ? (
            <option value={`planting-area:${form.growingAreaId}`}>Former planting area: {historicalTarget.growingAreaName}</option>
          ) : null}
          {garden.growingAreas.map((area) => (
            <option key={area.id} value={`planting-area:${area.id}`}>{area.name}</option>
          ))}
        </optgroup>
        <optgroup label="Plant groups">
          {historicalTarget?.targetScope === "plant-group" &&
          historicalTarget.plantingRecordId === form.plantingRecordId &&
          !garden.plantings.some((planting) => planting.id === form.plantingRecordId) ? (
            <option value={`plant-group:${form.plantingRecordId}`}>Former plant group: {historicalTarget.plantingRecordName}</option>
          ) : null}
          {garden.plantings.map((planting) => (
            <option key={planting.id} value={`plant-group:${planting.id}`}>{plantGroupDisplayName(planting, garden)}</option>
          ))}
        </optgroup>
      </select>
    </FormField>
  );
}

function CareLog({
  garden,
  rows, locationControl,
  editingCareEventId,
  form,
  isFormOpen,
  onAdd,
  onCancel,
  onEdit,
  onRemove,
  onSave,
  onSetForm,
}: {
  garden: Garden;
  rows: CareRow<CareEvent>[];
  locationControl?: ReactNode;
  editingCareEventId?: string;
  form: CareForm;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onEdit: (event: CareRow<CareEvent>) => void;
  onRemove: (event: CareRow<CareEvent>) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSetForm: (form: CareForm) => void;
}) {
  const historicalTarget = garden.careEvents.find(
    (event) => event.id === editingCareEventId,
  );
  const hasEventChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.date !== historicalTarget.date ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      form.fertilizerProduct !== (historicalTarget.fertilizerProduct ?? "") ||
      form.fertilizerAmount !== String(historicalTarget.fertilizerAmount ?? "") ||
      form.fertilizerUnit !== (historicalTarget.fertilizerUnit ?? "")
    ),
  );
  const events = [...rows].sort((left, right) =>
    right.record.date.localeCompare(left.record.date),
  );

  return (
    <section className="care-view care-log" aria-labelledby="care-history-heading">
      <div className="care-view-header">
        <h2 id="care-history-heading" tabIndex={-1}>History</h2>
        <button className="primary-button" onClick={onAdd} type="button">
          Add care event
        </button>
      </div>
      {isFormOpen ? (
        <FeedbackForm className="care-form" onSubmit={onSave} validate={() => ({
          "care-date": !isCalendarDate(form.date) ? "Enter a valid care date." : undefined,
          "care-target": careTargetError(garden, form, historicalTarget),
          "fertilizer-amount": form.type === "fertilizing" && form.fertilizerAmount.trim() && Number(form.fertilizerAmount) <= 0 ? "Enter a fertilizer amount greater than zero." : undefined,
        })}>
          <h3>{editingCareEventId ? "Edit care event" : "Add care event"}</h3>
          {locationControl}
          <div className="field">
            <label htmlFor="care-type">Care type</label>
            <select
              id="care-type"
              onChange={(event) =>
                onSetForm({ ...form, type: event.target.value as CareEventType })
              }
              value={form.type}
            >
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </div>
          <FormField id="care-date" className="field">
            <label htmlFor="care-date">Date</label>
            <input
              autoFocus
              id="care-date" required
              onChange={(event) => onSetForm({ ...form, date: event.target.value })}
              type="date"
              value={form.date}
            />
          </FormField>
          <FormField id="care-target" className="field">
            <label htmlFor="care-target">Target</label>
            <select
              id="care-target" required
              onChange={(event) => {
                const [targetScope, targetId] = event.target.value.split(":");
                onSetForm({
                  ...form,
                  targetScope: targetScope as CareEventTargetScope,
                  growingAreaId:
                    targetScope === "planting-area" ? targetId : "",
                  plantingRecordId:
                    targetScope === "plant-group" ? targetId : "",
                });
              }}
              value={
                form.targetScope === "all-gardens" || form.targetScope === "garden"
                  ? form.targetScope
                  : `${form.targetScope}:${form.targetScope === "planting-area" ? form.growingAreaId : form.plantingRecordId}`
              }
            >
              <option value={garden.id === "all-gardens" ? "all-gardens" : "garden"}>{garden.name}</option>
              <optgroup label="Planting areas">
                {historicalTarget?.targetScope === "planting-area" &&
                  historicalTarget.growingAreaId === form.growingAreaId &&
                  !garden.growingAreas.some(
                    (area) => area.id === form.growingAreaId,
                  ) ? (
                  <option value={`planting-area:${form.growingAreaId}`}>
                    Former planting area: {historicalTarget.growingAreaName}
                  </option>
                ) : null}
                {garden.growingAreas.map((area) => (
                  <option key={area.id} value={`planting-area:${area.id}`}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Plant groups">
                {historicalTarget?.targetScope === "plant-group" &&
                  historicalTarget.plantingRecordId === form.plantingRecordId &&
                  !garden.plantings.some(
                    (planting) => planting.id === form.plantingRecordId,
                  ) ? (
                  <option value={`plant-group:${form.plantingRecordId}`}>
                    Former plant group: {historicalTarget.plantingRecordName}
                  </option>
                ) : null}
                {garden.plantings.map((planting) => (
                  <option key={planting.id} value={`plant-group:${planting.id}`}>
                    {plantGroupDisplayName(planting, garden)}
                  </option>
                ))}
              </optgroup>
            </select>
          </FormField>
          {form.type === "fertilizing" ? (
            <>
              <div className="field">
                <label htmlFor="fertilizer-product">Fertilizer product (optional)</label>
                <input
                  id="fertilizer-product"
                  onChange={(event) => onSetForm({ ...form, fertilizerProduct: event.target.value })}
                  value={form.fertilizerProduct}
                />
              </div>
              <FormField id="fertilizer-amount" className="field">
                <label htmlFor="fertilizer-amount">Fertilizer amount (optional)</label>
                <input
                  id="fertilizer-amount"
                  min="0"
                  onChange={(event) => onSetForm({ ...form, fertilizerAmount: event.target.value })}
                  step="any"
                  type="number"
                  value={form.fertilizerAmount}
                />
              </FormField>
              <div className="field">
                <label htmlFor="fertilizer-unit">Fertilizer unit (optional)</label>
                <input
                  id="fertilizer-unit"
                  onChange={(event) => onSetForm({ ...form, fertilizerUnit: event.target.value })}
                  placeholder="e.g. g, tbsp, mL"
                  value={form.fertilizerUnit}
                />
              </div>
            </>
          ) : null}
          <div className="field care-note-field">
            <label htmlFor="care-note">Note (optional)</label>
            <input
              id="care-note"
              onChange={(event) => onSetForm({ ...form, note: event.target.value })}
              value={form.note}
            />
          </div>
          <div className="form-actions">
            {editingCareEventId
              ? hasEventChanges || !historicalTarget ? <button className="primary-button" type="submit">Save care event</button> : null
              : <button className="primary-button" type="submit">Add care event</button>}
            <button className="secondary-button" onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </FeedbackForm>
      ) : null}
      {events.length ? (
        <ul className="care-event-list">
          {events.map((row) => { const event = row.record; return (
            <li key={row.key} className={styles.row}>
              <div>
                <strong>{event.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                <p>{row.targetLabel}</p>
                <p>{event.date}{event.type === "fertilizing" && careFertilizerDetails(event) ? ` · ${careFertilizerDetails(event)}` : ""}</p>
                {event.note && <p className={styles.note}>{event.note}</p>}
              </div>
              <div className="area-actions">
                <button className="text-button" onClick={() => onEdit(row)} type="button">
                  Correct record
                </button>
                <button className="remove-button" onClick={() => onRemove(row)} type="button">
                  Delete record
                </button>
              </div>
            </li>
          ); })}
        </ul>
      ) : (
        <div className="empty-areas">
          <h3>No care events yet</h3>
          <p>Record completed watering or fertilizing for {garden.name}.</p>
        </div>
      )}
    </section>
  );
}

function careTargetError(garden: Garden, form: CareForm | CareTaskForm, previous?: CareEvent | CareTask) {
  if (form.targetScope === "planting-area" && !garden.growingAreas.some((area) => area.id === form.growingAreaId) && !(previous?.targetScope === "planting-area" && previous.growingAreaId === form.growingAreaId)) return "Choose an existing planting area.";
  if (form.targetScope === "plant-group" && !garden.plantings.some((planting) => planting.id === form.plantingRecordId) && !(previous?.targetScope === "plant-group" && previous.plantingRecordId === form.plantingRecordId)) return "Choose an existing plant group.";
}

function CareLocation({ id, label, gardens, value, editing, onChange }: { id: string; label: string; gardens: Garden[]; value: string; editing: boolean; onChange: (id: string) => void }) {
  if (editing) return <p>{label}: {gardens.find((garden) => garden.id === value)?.name ?? "Location no longer available"}</p>;
  return <FormField id={id} className="field"><label htmlFor={id}>{label}</label><select id={id} required value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Choose a location</option>
    {gardens.map((garden) => <option key={garden.id} value={garden.id}>{garden.name}</option>)}
  </select></FormField>;
}
