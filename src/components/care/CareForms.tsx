"use client";

import type { FormEvent, ReactNode } from "react";
import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";
import { careTypeName } from "@/lib/careLabels";
import { careDetailsChanged, careDetailsFromForm, careTargetLabel, isCalendarDate, plantGroupDisplayName, type CareDetailsForm, type CareForm, type CareTaskForm } from "@/lib/careRecords";
import { careDetailFields, careEventTypes, type CareDetailField, type CareEvent, type CareEventTargetScope, type CareEventType, type CareTask, type Garden } from "@/lib/gardenWorkspace";
import styles from "./Care.module.css";
import { CareIcon } from "./CareMarks";

/**
 * The task, completion, and record forms (ADR-0080 D7 puts them in dialogs). Fields, validation,
 * and messages are the ones Care used before the redesign.
 */

export function careTargetError(garden: Garden, form: CareForm | CareTaskForm, previous?: CareEvent | CareTask) {
  if (form.targetScope === "planting-area" && !garden.growingAreas.some((area) => area.id === form.growingAreaId) && !(previous?.targetScope === "planting-area" && previous.growingAreaId === form.growingAreaId)) return "Choose an existing planting area.";
  if (form.targetScope === "plant-group" && !garden.plantings.some((planting) => planting.id === form.plantingRecordId) && !(previous?.targetScope === "plant-group" && previous.plantingRecordId === form.plantingRecordId)) return "Choose an existing plant group.";
}

export function CareLocation({ id, label, gardens, value, editing, onChange }: { id: string; label: string; gardens: Garden[]; value: string; editing: boolean; onChange: (id: string) => void }) {
  if (editing) return <p className={styles.formContext}>{label}: {gardens.find((garden) => garden.id === value)?.name ?? "Location no longer available"}</p>;
  return <FormField id={id} className={`field ${styles.wide}`}><label htmlFor={id}>{label}</label><select id={id} data-autofocus required value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Choose a location</option>
    {gardens.map((garden) => <option key={garden.id} value={garden.id}>{garden.name}</option>)}
  </select></FormField>;
}

function CareTargetSelect<F extends CareForm | CareTaskForm>({ id, form, garden, historicalTarget, onSetForm }: {
  id: string;
  form: F;
  garden: Garden;
  historicalTarget?: CareEvent | CareTask;
  onSetForm: (form: F) => void;
}) {
  return (
    <FormField id={id} className="field">
      <label htmlFor={id}>Target</label>
      <select
        id={id} required
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

/** Five icon pills for the care type (ADR-0085). They are radio buttons, so arrow keys move between them. */
function CareTypePicker({ name, value, onChange }: { name: string; value: CareEventType; onChange: (type: CareEventType) => void }) {
  return <fieldset className={`${styles.wide} ${styles.typePicker}`}>
    <legend>Care type</legend>
    <div className={styles.typeOptions}>
      {careEventTypes.map((type) => <label key={type} className={styles.typeOption}>
        <input type="radio" name={name} value={type} checked={value === type} onChange={() => onChange(type)} />
        <CareIcon type={type} />
        {careTypeName[type]}
      </label>)}
    </div>
  </fieldset>;
}

type Tense = "done" | "planned";
const detailIdPart: Record<CareDetailField, string> = {
  fertilizerProduct: "fertilizer-product", fertilizerAmount: "fertilizer-amount", fertilizerUnit: "fertilizer-unit",
  plantName: "plant-name", plantCount: "plant-count", pruneDetail: "prune-detail", pestProblem: "pest-problem", pestTreatment: "pest-treatment",
};
const detailLabel = (field: CareDetailField, tense: Tense) => ({
  fertilizerProduct: "Fertilizer product", fertilizerAmount: "Fertilizer amount", fertilizerUnit: "Fertilizer unit",
  plantName: "Plant", plantCount: "How many plants",
  pruneDetail: tense === "done" ? "What was cut" : "What to cut",
  pestProblem: "Problem", pestTreatment: tense === "done" ? "Treatment used" : "Treatment to use",
})[field] + " (optional)";
const detailPlaceholder: Partial<Record<CareDetailField, string>> = {
  fertilizerUnit: "e.g. g, tbsp, mL", plantName: "e.g. Basil", pruneDetail: "e.g. Side shoots", pestProblem: "e.g. Aphids", pestTreatment: "e.g. Soap spray",
};
/** Record fields keep their earlier IDs ("fertilizer-amount"); task fields add "care-task-". */
export const careDetailId = (prefix: string, field: CareDetailField) => `${prefix}${detailIdPart[field]}`;

/** The chosen type's optional details. A form kept from before ADR-0085 may lack a field, so it reads as empty. */
function CareDetailFields({ type, form, prefix, tense, onChange }: {
  type: CareEventType; form: Partial<CareDetailsForm>; prefix: string; tense: Tense; onChange: (field: CareDetailField, value: string) => void;
}) {
  return <>{careDetailFields[type].map((field) => {
    const id = careDetailId(prefix, field);
    const numeric = field === "fertilizerAmount" || field === "plantCount";
    return <FormField key={field} id={id} className="field">
      <label htmlFor={id}>{detailLabel(field, tense)}</label>
      <input id={id} value={form[field] ?? ""} onChange={(event) => onChange(field, event.target.value)}
        {...(numeric ? { type: "number", min: field === "plantCount" ? "1" : "0", step: field === "plantCount" ? "1" : "any" } : {})}
        {...(detailPlaceholder[field] ? { placeholder: detailPlaceholder[field] } : {})} />
    </FormField>;
  })}</>;
}

/** The detail error for the form's validation, keyed by the field's ID. */
function detailErrors(type: CareEventType, form: Partial<CareDetailsForm>, prefix: string) {
  const result = careDetailsFromForm(type, form);
  return "error" in result ? { [careDetailId(prefix, result.field)]: result.error } : {};
}

export function CareTaskFormFields({ garden, form, editingCareTaskId, locationControl, onSave, onCancel, onSetForm, extraActions }: {
  garden: Garden;
  form: CareTaskForm;
  editingCareTaskId?: string;
  locationControl?: ReactNode;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onSetForm: (form: CareTaskForm) => void;
  /** Complete on another date and Delete task, for a task being edited. */
  extraActions?: ReactNode;
}) {
  const historicalTarget = garden.careTasks.find((task) => task.id === editingCareTaskId);
  const hasTaskChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.dueDate !== historicalTarget.dueDate ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      form.repeatIntervalDays !== String(historicalTarget.repeatIntervalDays ?? "") ||
      careDetailsChanged(form.type, form, historicalTarget)
    ),
  );
  return (
    <FeedbackForm className={styles.form} onSubmit={onSave} validate={() => ({
      "care-task-due-date": !isCalendarDate(form.dueDate) ? "Enter a valid due date." : undefined,
      "care-task-target": careTargetError(garden, form, historicalTarget),
      ...detailErrors(form.type, form, "care-task-"),
    })}>
      {locationControl}
      <CareTypePicker name="care-task-type" value={form.type} onChange={(type) => onSetForm({ ...form, type })} />
      <FormField id="care-task-due-date" className="field">
        <label htmlFor="care-task-due-date">Due date</label>
        <input data-autofocus id="care-task-due-date" onChange={(event) => onSetForm({ ...form, dueDate: event.target.value })} required type="date" value={form.dueDate} />
      </FormField>
      <CareTargetSelect id="care-task-target" form={form} garden={garden} historicalTarget={historicalTarget} onSetForm={onSetForm} />
      <CareDetailFields type={form.type} form={form} prefix="care-task-" tense="planned" onChange={(field, value) => onSetForm({ ...form, [field]: value })} />
      <FormField id="care-task-repeat" className="field">
        <label htmlFor="care-task-repeat">Repeat every whole days (optional)</label>
        <input id="care-task-repeat" min="1" onChange={(event) => onSetForm({ ...form, repeatIntervalDays: event.target.value })} step="1" type="number" value={form.repeatIntervalDays} />
      </FormField>
      <div className={`field ${styles.wide}`}>
        <label htmlFor="care-task-note">Note (optional)</label>
        <input id="care-task-note" onChange={(event) => onSetForm({ ...form, note: event.target.value })} value={form.note} />
      </div>
      <div className={styles.formActions}>
        {editingCareTaskId
          ? hasTaskChanges || !historicalTarget ? <button className="primary-button" type="submit">Save care task</button> : null
          : <button className="primary-button" type="submit">Add care task</button>}
        <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
        {extraActions && <span className={styles.formActionsSecondary}>{extraActions}</span>}
      </div>
    </FeedbackForm>
  );
}

export function CareCompletionForm({ task, location, date, onSetDate, onSave, onCancel }: {
  task?: CareTask;
  location?: string;
  date: string;
  onSetDate: (date: string) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <FeedbackForm className={styles.form} onSubmit={onSave} validate={() => ({ "care-task-completion-date": !isCalendarDate(date) ? "Enter a valid completion date." : undefined })}>
      {task ? <p className={styles.formContext}>{location} · {careTargetLabel(task, location)}</p>
        : <p role="alert" className={styles.formContext}>This task is no longer available. Your completion date is kept; cancel to return to the list.</p>}
      <FormField id="care-task-completion-date" className="field">
        <label htmlFor="care-task-completion-date">Completion date</label>
        <input id="care-task-completion-date" data-autofocus onChange={(event) => onSetDate(event.target.value)} required type="date" value={date} />
      </FormField>
      <div className={styles.formActions}>
        <button className="primary-button" type="submit" disabled={!task}>Complete task</button>
        <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
      </div>
    </FeedbackForm>
  );
}

export function CareRecordFormFields({ garden, form, editingCareEventId, locationControl, onSave, onCancel, onSetForm }: {
  garden: Garden;
  form: CareForm;
  editingCareEventId?: string;
  locationControl?: ReactNode;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onSetForm: (form: CareForm) => void;
}) {
  const historicalTarget = garden.careEvents.find((event) => event.id === editingCareEventId);
  const hasEventChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.date !== historicalTarget.date ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      careDetailsChanged(form.type, form, historicalTarget)
    ),
  );
  return (
    <FeedbackForm className={styles.form} onSubmit={onSave} validate={() => ({
      "care-date": !isCalendarDate(form.date) ? "Enter a valid care date." : undefined,
      "care-target": careTargetError(garden, form, historicalTarget),
      ...detailErrors(form.type, form, ""),
    })}>
      {locationControl}
      <CareTypePicker name="care-type" value={form.type} onChange={(type) => onSetForm({ ...form, type })} />
      <FormField id="care-date" className="field">
        <label htmlFor="care-date">Date</label>
        <input data-autofocus id="care-date" required onChange={(event) => onSetForm({ ...form, date: event.target.value })} type="date" value={form.date} />
      </FormField>
      <CareTargetSelect id="care-target" form={form} garden={garden} historicalTarget={historicalTarget} onSetForm={onSetForm} />
      <CareDetailFields type={form.type} form={form} prefix="" tense="done" onChange={(field, value) => onSetForm({ ...form, [field]: value })} />
      <div className={`field ${styles.wide}`}>
        <label htmlFor="care-note">Note (optional)</label>
        <input id="care-note" onChange={(event) => onSetForm({ ...form, note: event.target.value })} value={form.note} />
      </div>
      <div className={styles.formActions}>
        {editingCareEventId
          ? hasEventChanges || !historicalTarget ? <button className="primary-button" type="submit">Save care event</button> : null
          : <button className="primary-button" type="submit">Add care event</button>}
        <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
      </div>
    </FeedbackForm>
  );
}
