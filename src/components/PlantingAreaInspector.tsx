"use client";
import { type FormEvent, type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { areaProperties, areaPropertyErrors, sameAreaProperties, type AreaProperties, type AreaPropertiesDraft } from "@/lib/areaEditorDrafts";
import { createRectangularLayout, growingAreaKindLabels, snapToGrid, type GardenPlan, type LayoutPoint, type GrowingArea, type GrowingAreaKind, type GrowingAreaLayout } from "@/lib/gardenWorkspace";

import { EditorPanel } from "./editor/EditorPanel";
import type { EditorMode } from "./editor/EditorWorkbench";
import styles from "./editor/Editor.module.css";

export function PlantingAreaInspector({
  plan, mode = "wide", gardenName, title = "Edit planting area",
  area,
  returnFocusId,
  draft,
  onDraftChange,
  hasPlantChanges = false,
  onDiscardPlants,
  showProperties = true,
  children,
  onClose,
  onDelete,
  onSave,
}: {
  area: GrowingArea;
  plan: GardenPlan;
  mode?: EditorMode;
  gardenName?: string;
  /** The panel heading: "Edit planting area" on Planting areas, "Plants" on Plants (ADR-0075). */
  title?: string;
  /** Where focus returns on close; defaults to the area's link in the area list. */
  returnFocusId?: string;
  draft?: AreaPropertiesDraft;
  onDraftChange: (draft?: AreaPropertiesDraft) => void;
  hasPlantChanges?: boolean;
  onDiscardPlants: () => void;
  /** The guided setup's Plants step shows only the planting controls (ADR-0072, G6). */
  showProperties?: boolean;
  children?: ReactNode;
  onClose: () => void;
  onDelete: () => void;
  onSave: (
    areaId: string,
    name: string,
    kind: GrowingAreaKind,
    rotationDegrees: number,
    layout: GrowingAreaLayout,
    position: LayoutPoint,
  ) => boolean;
}) {
  const current = areaProperties(area);
  const hasChanges = Boolean(draft && !sameAreaProperties(draft.values, draft.baseline));
  const values = draft && (hasChanges || sameAreaProperties(current, draft.baseline)) ? { ...draft.values } : { ...current };
  const baseline = draft ? { ...draft.baseline } : current;
  // An untouched coordinate follows a later drag; a typed position stays a draft.
  for (const axis of ["x", "y"] as const) {
    if (draft && draft.values[axis] === draft.baseline[axis]) { values[axis] = current[axis]; baseline[axis] = current[axis]; }
  }
  const { name, length, width, rotation: rotationDegrees } = values;
  const changedElsewhere = hasChanges && draft && !sameAreaProperties(current, baseline);
  const [errors, setErrors] = useState<Partial<Record<keyof AreaProperties, string>>>({});
  const [closing, setClosing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const change = (key: keyof AreaProperties, value: string) => {
    const next = { ...values, [key]: value };
    const nextBaseline = hasChanges && draft ? baseline : current;
    onDraftChange(JSON.stringify(next) === JSON.stringify(current) ? undefined : { baseline: nextBaseline, values: next });
    setErrors((old) => ({ ...old, [key]: undefined }));
  };
  const setName = (value: string) => change("name", value);
  const setLength = (value: string) => change("length", value);
  const setWidth = (value: string) => change("width", value);
  const setRotationDegrees = (value: string) => change("rotation", value);

  /**
   * Applies the fields when one loses focus or on Enter (ADR-0072, phase G5).
   * The type is chosen when the area is added and is not edited here; moving
   * is done by dragging or with the position fields. Invalid values stay in
   * the form with their errors and change nothing; the draft protection from
   * ADR-0062 covers them until they are fixed or discarded.
   */
  const apply = (next: AreaProperties = values, focusError = false) => {
    if (sameAreaProperties(next, current)) { if (draft) onDraftChange(undefined); setErrors({}); return; }
    const nextErrors = areaPropertyErrors(next, plan);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      if (focusError) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const layout = createRectangularLayout(snapToGrid(Number(next.width)), snapToGrid(Number(next.length)));
    if (onSave(area.id, next.name.trim(), next.kind, Number(next.rotation), layout, { x: Number(next.x), y: Number(next.y) })) onDraftChange(undefined);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); apply(values, true); };
  // Without a submit button, Enter in a field does not submit the form on its own.
  const applyOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    apply(values, true);
  };

  return (
    <EditorPanel mode={mode} title={title} context={`${gardenName ?? "Garden"} / ${area.name}`} headingId="edit-planting-area-heading" returnFocusId={returnFocusId ?? `area-link-${area.id}`} onClose={() => hasChanges || hasPlantChanges ? setClosing(true) : onClose()}>
      <div className={styles.properties}>
      {hasChanges && Object.values(errors).some(Boolean) && <p role="status">Not applied yet: fix the highlighted values.</p>}
      {changedElsewhere && <div role="alert">
        <p>These properties changed elsewhere. Your edits are kept. Press Enter to apply your values.</p>
        <p>Current values: {current.name}, {growingAreaKindLabels[current.kind]}, {current.width} × {current.length} m, {current.rotation}°, position {current.x}, {current.y} m.</p>
        <button className="secondary-button" type="button" onClick={() => { onDraftChange(undefined); setErrors({}); }}>Reload properties</button>
      </div>}
      {closing && <ConfirmDialog message="Discard unsaved changes in this planting area?" confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setClosing(false)} onConfirm={() => { onDraftChange(undefined); onDiscardPlants(); onClose(); }} />}
      {/* Rendered only when shown: the form's grid display would override a hidden attribute. */}
      {showProperties && <form className="planting-area-creation-form" noValidate onSubmit={submit} onKeyDown={applyOnEnter} onBlur={(event) => { if (event.target instanceof HTMLInputElement) apply(); }} ref={formRef}>
        <h3 className={styles.inspectorSectionHeading}>Dimensions and position</h3>
        <div className="field">
          <label htmlFor="editing-planting-area-name">Planting-area name</label>
          <input
            id="editing-planting-area-name" name="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "editing-planting-area-name-error" : undefined}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
            {errors.name && <p id="editing-planting-area-name-error" role="alert">{errors.name}</p>}
        </div>
        <div className="planting-area-creation-measurements">
          <div className="field">
            <label htmlFor="layout-width">Width (m)</label>
            <input
              id="layout-width" name="width" aria-invalid={Boolean(errors.width)} aria-describedby={errors.width ? "layout-width-error" : undefined}
              min="0.1"
              onChange={(event) => setWidth(event.target.value)}
              required
              step="0.1"
              type="number"
              value={width}
            />
            {errors.width && <p id="layout-width-error" role="alert">{errors.width}</p>}
          </div>
          <div className="field">
            <label htmlFor="layout-length">Length (m)</label>
            <input
              id="layout-length" name="length" aria-invalid={Boolean(errors.length)} aria-describedby={errors.length ? "layout-length-error" : undefined}
              min="0.1"
              onChange={(event) => setLength(event.target.value)}
              required
              step="0.1"
              type="number"
              value={length}
            />
            {errors.length && <p id="layout-length-error" role="alert">{errors.length}</p>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="editing-planting-area-rotation">Rotation (degrees)</label>
          <input
            id="editing-planting-area-rotation" name="rotation" aria-invalid={Boolean(errors.rotation)} aria-describedby={errors.rotation ? "editing-planting-area-rotation-error" : undefined}
            onChange={(event) => setRotationDegrees(event.target.value)}
            step="1"
            type="number"
            value={rotationDegrees}
          />
            {errors.rotation && <p id="editing-planting-area-rotation-error" role="alert">{errors.rotation}</p>}
        </div>
        <div className="planting-area-creation-measurements">
          {(["x", "y"] as const).map((axis) => <div className="field" key={axis}>
            <label htmlFor={`area-position-${axis}`}>Area {axis.toUpperCase()} position (m)</label>
            <input id={`area-position-${axis}`} name={axis} type="number" min="0" max={axis === "x" ? plan.widthMeters : plan.depthMeters} step="any" required value={values[axis]}
              aria-invalid={Boolean(errors[axis])} aria-describedby={errors[axis] ? `area-position-${axis}-error` : undefined} onChange={(event) => change(axis, event.target.value)} />
            {errors[axis] && <p id={`area-position-${axis}-error`} role="alert">{errors[axis]}</p>}
          </div>)}
        </div>
        <p className={styles.applyHint}>Changes apply when you leave a field or press Enter. Undo reverses them.</p>
        <div className="form-actions">
          <button className="remove-button" onClick={onDelete} type="button">Delete area</button>
        </div>
      </form>}
      {children}
      </div>
    </EditorPanel>
  );
}

