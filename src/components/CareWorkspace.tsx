"use client";

import { type FormEvent, type RefObject, useState } from "react";

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
export type CareRecords = { careEvents: CareEvent[]; careTasks: CareTask[] };

/**
 * Care tasks and history for one garden (or the synthetic "all gardens"
 * garden). Owns its own form state; the parent only supplies the records and
 * a way to replace them.
 */
export function CareWorkspace({
  garden,
  headingRef,
  initialView = "tasks",
  onMessage,
  onUpdateRecords,
}: {
  garden: Garden;
  headingRef: RefObject<HTMLHeadingElement | null>;
  initialView?: CareView;
  onMessage: (message: string) => void;
  onUpdateRecords: (update: (records: CareRecords) => CareRecords) => void;
}) {
  const allGardens = garden.id === "all-gardens";
  const defaultScope = allGardens ? "all-gardens" : "garden";
  const [view, setView] = useState<CareView>(initialView);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCareEventId, setEditingCareEventId] = useState<string>();
  const [form, setForm] = useState<CareForm>(emptyCareForm(defaultScope));
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [editingCareTaskId, setEditingCareTaskId] = useState<string>();
  const [taskForm, setTaskForm] = useState<CareTaskForm>(emptyCareTaskForm(defaultScope));
  const [completingCareTaskId, setCompletingCareTaskId] = useState<string>();
  const [completionDate, setCompletionDate] = useState("");

  const openAddCare = () => {
    setForm(emptyCareForm(defaultScope));
    setEditingCareEventId(undefined);
    setIsFormOpen(true);
  };

  const openEditCare = (event: CareEvent) => {
    setForm({
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
    setIsFormOpen(false);
    setEditingCareEventId(undefined);
  };

  const saveCare = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!isCalendarDate(form.date))
      return onMessage("Enter a valid care date.");
    const previous = garden.careEvents.find(
      (event) => event.id === editingCareEventId,
    );
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
    }));
    cancelCare();
    onMessage(`${form.type === "watering" ? "Watering" : "Fertilizing"} event ${action}.`);
  };

  const removeCare = (event: CareEvent) => {
    onUpdateRecords((records) => ({
      ...records,
      careEvents: records.careEvents.filter((item) => item.id !== event.id),
    }));
    onMessage("Care event removed.");
  };

  const openAddCareTask = () => {
    setTaskForm(emptyCareTaskForm(defaultScope));
    setEditingCareTaskId(undefined);
    setIsTaskFormOpen(true);
  };

  const openEditCareTask = (task: CareTask) => {
    setTaskForm({
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
    setIsTaskFormOpen(false);
    setEditingCareTaskId(undefined);
  };

  const saveCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!isCalendarDate(taskForm.dueDate))
      return onMessage("Enter a valid due date.");
    const previous = garden.careTasks.find(
      (task) => task.id === editingCareTaskId,
    );
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
    }));
    cancelCareTask();
    onMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task ${action}.`);
  };

  const openCompleteCareTask = (task: CareTask) => {
    setCompletingCareTaskId(task.id);
    setCompletionDate(todayDate());
  };

  const cancelCompletion = () => {
    setCompletingCareTaskId(undefined);
    setCompletionDate("");
  };

  const completeCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!completingCareTaskId) return;
    if (!isCalendarDate(completionDate))
      return onMessage("Enter a valid completion date.");
    const task = garden.careTasks.find(
      (candidate) => candidate.id === completingCareTaskId,
    );
    if (!task) return;
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
    }));
    cancelCompletion();
    onMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task completed.`);
  };

  const removeCareTask = (task: CareTask) => {
    onUpdateRecords((records) => ({
      ...records,
      careTasks: records.careTasks.filter((item) => item.id !== task.id),
    }));
    onMessage("Care task removed.");
  };

  return (
    <section className="management-section care-workspace" aria-labelledby="care-workspace-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden records</p>
          <h2 id="care-workspace-heading" ref={headingRef} tabIndex={-1}>Care</h2>
          <p className="section-context">{garden.name}</p>
        </div>
      </div>
      <div aria-label="Care views" className="care-tabs" role="tablist">
        <button
          aria-selected={view === "tasks"}
          className="text-button"
          onClick={() => setView("tasks")}
          role="tab"
          type="button"
        >
          Tasks
        </button>
        <button
          aria-selected={view === "history"}
          className="text-button"
          onClick={() => setView("history")}
          role="tab"
          type="button"
        >
          History
        </button>
      </div>
      {view === "tasks" ? (
        <CareTasks
          garden={garden}
          form={taskForm}
          completingCareTaskId={completingCareTaskId}
          completionDate={completionDate}
          editingCareTaskId={editingCareTaskId}
          isFormOpen={isTaskFormOpen}
          onAdd={openAddCareTask}
          onCancel={cancelCareTask}
          onCancelCompletion={cancelCompletion}
          onComplete={openCompleteCareTask}
          onEdit={openEditCareTask}
          onRemove={removeCareTask}
          onSave={saveCareTask}
          onSaveCompletion={completeCareTask}
          onSetCompletionDate={setCompletionDate}
          onSetForm={setTaskForm}
        />
      ) : (
        <CareLog
          garden={garden}
          editingCareEventId={editingCareEventId}
          form={form}
          isFormOpen={isFormOpen}
          onAdd={openAddCare}
          onCancel={cancelCare}
          onEdit={openEditCare}
          onRemove={removeCare}
          onSave={saveCare}
          onSetForm={setForm}
        />
      )}
    </section>
  );
}

function CareTasks({
  garden,
  form,
  completingCareTaskId,
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
  completingCareTaskId?: string;
  completionDate: string;
  editingCareTaskId?: string;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onCancelCompletion: () => void;
  onComplete: (task: CareTask) => void;
  onEdit: (task: CareTask) => void;
  onRemove: (task: CareTask) => void;
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
  const completingTask = garden.careTasks.find(
    (task) => task.id === completingCareTaskId,
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
        <h3 id="care-tasks-heading">Tasks</h3>
        <button className="primary-button" onClick={onAdd} type="button">Add task</button>
      </div>
      {isFormOpen ? (
        <form className="care-form" onSubmit={onSave}>
          <h3>{editingCareTaskId ? "Edit care task" : "Add care task"}</h3>
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
          <div className="field">
            <label htmlFor="care-task-due-date">Due date</label>
            <input
              autoFocus
              id="care-task-due-date"
              onChange={(event) => onSetForm({ ...form, dueDate: event.target.value })}
              required
              type="date"
              value={form.dueDate}
            />
          </div>
          <CareTargetSelect
            form={form}
            garden={garden}
            historicalTarget={historicalTarget}
            onSetForm={onSetForm}
          />
          <div className="field">
            <label htmlFor="care-task-repeat">Repeat every whole days (optional)</label>
            <input
              id="care-task-repeat"
              min="1"
              onChange={(event) => onSetForm({ ...form, repeatIntervalDays: event.target.value })}
              step="1"
              type="number"
              value={form.repeatIntervalDays}
            />
          </div>
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
              ? hasTaskChanges ? <button className="primary-button" type="submit">Save care task</button> : null
              : <button className="primary-button" type="submit">Add care task</button>}
            <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
          </div>
        </form>
      ) : null}
      {completingTask ? (
        <form className="care-completion-form" onSubmit={onSaveCompletion}>
          <h3>Complete {completingTask.type === "watering" ? "watering" : "fertilizing"} task</h3>
          <div className="field">
            <label htmlFor="care-task-completion-date">Completion date</label>
            <input
              id="care-task-completion-date"
              onChange={(event) => onSetCompletionDate(event.target.value)}
              required
              type="date"
              value={completionDate}
            />
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit">Complete task</button>
            <button className="secondary-button" onClick={onCancelCompletion} type="button">Cancel</button>
          </div>
        </form>
      ) : null}
      {groups.map(([status, label]) => {
        const tasks = garden.careTasks
          .filter((task) => careTaskStatus(task, today) === status)
          .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
        return (
          <section className="care-task-group" key={status} aria-labelledby={`care-task-${status}`}>
            <h4 id={`care-task-${status}`}>{label}</h4>
            {tasks.length ? (
              <ul className="care-event-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                      <p>
                        Due {task.dueDate} · {careTargetLabel(task, garden.name)}
                        {task.repeatIntervalDays ? ` · Repeats every ${task.repeatIntervalDays} days` : ""}
                        {task.note ? ` · ${task.note}` : ""}
                      </p>
                    </div>
                    <div className="area-actions">
                      <button className="primary-button" onClick={() => onComplete(task)} type="button">Complete</button>
                      <button className="text-button" onClick={() => onEdit(task)} type="button">Edit</button>
                      <button className="remove-button" onClick={() => onRemove(task)} type="button">Remove</button>
                    </div>
                  </li>
                ))}
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
    <div className="field">
      <label htmlFor="care-task-target">Target</label>
      <select
        id="care-task-target"
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
    </div>
  );
}

function CareLog({
  garden,
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
  editingCareEventId?: string;
  form: CareForm;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onEdit: (event: CareEvent) => void;
  onRemove: (event: CareEvent) => void;
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
  const events = [...garden.careEvents].sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  return (
    <section className="care-view care-log" aria-labelledby="care-history-heading">
      <div className="care-view-header">
        <h3 id="care-history-heading">History</h3>
        <button className="primary-button" onClick={onAdd} type="button">
          Add care event
        </button>
      </div>
      {isFormOpen ? (
        <form className="care-form" onSubmit={onSave}>
          <h3>{editingCareEventId ? "Edit care event" : "Add care event"}</h3>
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
          <div className="field">
            <label htmlFor="care-date">Date</label>
            <input
              autoFocus
              id="care-date"
              onChange={(event) => onSetForm({ ...form, date: event.target.value })}
              type="date"
              value={form.date}
            />
          </div>
          <div className="field">
            <label htmlFor="care-target">Target</label>
            <select
              id="care-target"
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
          </div>
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
              <div className="field">
                <label htmlFor="fertilizer-amount">Fertilizer amount (optional)</label>
                <input
                  id="fertilizer-amount"
                  min="0.01"
                  onChange={(event) => onSetForm({ ...form, fertilizerAmount: event.target.value })}
                  step="any"
                  type="number"
                  value={form.fertilizerAmount}
                />
              </div>
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
              ? hasEventChanges ? <button className="primary-button" type="submit">Save care event</button> : null
              : <button className="primary-button" type="submit">Add care event</button>}
            <button className="secondary-button" onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {events.length ? (
        <ul className="care-event-list">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                <p>
                  {event.date} · {careTargetLabel(event, garden.name)}
                  {event.type === "fertilizing" && careFertilizerDetails(event)
                    ? ` · ${careFertilizerDetails(event)}`
                    : ""}
                  {event.note ? ` · ${event.note}` : ""}
                </p>
              </div>
              <div className="area-actions">
                <button className="text-button" onClick={() => onEdit(event)} type="button">
                  Correct record
                </button>
                <button className="remove-button" onClick={() => onRemove(event)} type="button">
                  Delete record
                </button>
              </div>
            </li>
          ))}
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
