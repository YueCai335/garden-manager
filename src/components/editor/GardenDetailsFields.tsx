"use client";

import { useRef, useState, type FormEvent, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { useUnsavedDraft, useWorkspaceDraft } from "@/components/workspace/WorkspaceProvider";
import { gardenDetailsErrors, type GardenDetailsValues } from "@/lib/guidedSetup";
import { snapToGrid, type GardenPlan } from "@/lib/gardenWorkspace";
import styles from "./Editor.module.css";

export type GardenDetailsChange = { name?: string; plan?: GardenPlan };

/**
 * The garden's name, width, and length. A field applies when it loses focus
 * or on Enter, like the planting-area fields (ADR-0072, phases G5 and G6);
 * there is no Save button. A value that fails validation stays in the field
 * with its error and changes nothing. The guided setup's Garden size step
 * shows the same fields without the name.
 */
export function GardenDetailsFields({ gardenId, name, plan, minimum, showName = true, autoFocus = false, onApply, children }: {
  gardenId?: string;
  name: string;
  plan: GardenPlan;
  /** The smallest size that still holds every planting area. */
  minimum: GardenPlan;
  showName?: boolean;
  autoFocus?: boolean;
  onApply: (change: GardenDetailsChange) => void;
  children?: ReactNode;
}) {
  const current: GardenDetailsValues = { name, width: String(plan.widthMeters), depth: String(plan.depthMeters) };
  const key = `garden-details:${gardenId ?? "standalone"}`;
  const [draft, setDraft] = useWorkspaceDraft<GardenDetailsValues | undefined>(key, undefined);
  const values = draft ?? current;
  const [errors, setErrors] = useState<Partial<Record<keyof GardenDetailsValues, string>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const same = (next: GardenDetailsValues) => (!showName || next.name.trim() === name) && Number(next.width) === plan.widthMeters && Number(next.depth) === plan.depthMeters && next.width.trim() !== "" && next.depth.trim() !== "";
  useUnsavedDraft(key, Boolean(draft && !same(draft)));

  const change = (field: keyof GardenDetailsValues, value: string) => {
    const next = { ...values, [field]: value };
    setDraft(JSON.stringify(next) === JSON.stringify(current) ? undefined : next);
    setErrors((old) => ({ ...old, [field]: undefined }));
  };
  const apply = (next: GardenDetailsValues = values, focusError = false) => {
    if (same(next)) { setDraft(undefined); setErrors({}); return; }
    const nextErrors = gardenDetailsErrors(next, minimum, showName);
    setErrors(nextErrors);
    const first = Object.keys(nextErrors)[0];
    if (first) {
      if (focusError) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    const nextName = next.name.trim();
    const nextPlan = { widthMeters: snapToGrid(Number(next.width)), depthMeters: snapToGrid(Number(next.depth)) };
    onApply({
      name: showName && nextName !== name ? nextName : undefined,
      plan: nextPlan.widthMeters !== plan.widthMeters || nextPlan.depthMeters !== plan.depthMeters ? nextPlan : undefined,
    });
    setDraft(undefined);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); apply(values, true); };
  // Without a submit button, Enter in a field does not submit the form on its own.
  const applyOnEnter = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    apply(values, true);
  };
  const field = (id: string, fieldName: keyof GardenDetailsValues, label: string, input: Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name" | "value" | "onChange">, className = "field") => (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id} name={fieldName} required value={values[fieldName]}
        aria-invalid={Boolean(errors[fieldName])} aria-describedby={errors[fieldName] ? `${id}-error` : undefined}
        onChange={(event) => change(fieldName, event.target.value)}
      />
      {errors[fieldName] && <p className={styles.fieldError} id={`${id}-error`} role="alert">{errors[fieldName]}</p>}
    </div>
  );

  return <form className="plan-dimensions" noValidate ref={formRef} onSubmit={submit} onKeyDown={applyOnEnter}
    onBlur={(event) => { if (event.target instanceof HTMLInputElement) apply(); }}>
    {draft && Object.values(errors).some(Boolean) && <p className={styles.applyHint} role="status">Not applied yet: fix the highlighted values.</p>}
    {showName && field("plan-garden-name", "name", "Garden name", { autoFocus }, "field plan-name-field")}
    {field("plan-width", "width", "Garden width (m)", { autoFocus: autoFocus && !showName, min: "0.1", step: "0.1", type: "number", inputMode: "decimal" })}
    {field("plan-depth", "depth", "Garden length (m)", { min: "0.1", step: "0.1", type: "number", inputMode: "decimal" })}
    {children}
  </form>;
}
