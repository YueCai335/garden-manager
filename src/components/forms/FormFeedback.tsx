"use client";

import { Children, cloneElement, createContext, isValidElement, useContext, useState, type FormHTMLAttributes, type ReactNode } from "react";
import styles from "./FormFeedback.module.css";

type FieldErrors = Record<string, string | undefined>;
const ErrorsContext = createContext<FieldErrors>({});

export function InlineNotice({ children, tone = "error" }: { children?: ReactNode; tone?: "error" | "status" | "info" | "success" | "warning" }) {
  if (!children) return null;
  return <p className={`${styles.notice} ${styles[tone]}`} role={tone === "error" ? "alert" : "status"}>{children}</p>;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
function controls(form: HTMLFormElement): Control[] {
  return Array.from(form.elements).filter((element): element is Control => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement);
}
function constraintError(field: Control) {
  if (field.disabled || !field.willValidate) return;
  const label = field.labels?.[0]?.textContent?.trim() || "this field";
  if (field.validity.badInput) return "Enter a valid number.";
  if (field.required && !field.value.trim()) return field instanceof HTMLSelectElement ? `Choose ${label.toLowerCase()}.` : `Enter ${label.toLowerCase()}.`;
  if (field instanceof HTMLInputElement) {
    if (field.validity.rangeUnderflow) return `Enter a value of at least ${field.min}.`;
    if (field.validity.rangeOverflow) return `Enter a value no greater than ${field.max}.`;
    if (field.validity.stepMismatch) return field.step === "1" ? "Enter a whole number." : `Use increments of ${field.step}.`;
  }
  if (!field.validity.valid) return "Check this value and try again.";
}

/** Collect native constraints and domain errors before allowing a business action. */
export function FeedbackForm({ children, validate, error, notice, onSubmit, onChange, ...props }: Omit<FormHTMLAttributes<HTMLFormElement>, "noValidate"> & {
  validate?: () => FieldErrors;
  error?: string;
  notice?: string;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [changed, setChanged] = useState(false);
  return <ErrorsContext.Provider value={errors}>
    <form {...props} noValidate onChange={(event) => {
      const target = event.target;
      setChanged(true);
      // A choice can hide dependent fields (for example fertilizer amount).
      if (target instanceof HTMLSelectElement) setErrors({});
      else if (target instanceof HTMLElement && target.id) setErrors((current) => ({ ...current, [target.id]: undefined }));
      onChange?.(event);
    }} onSubmit={(event) => {
      event.preventDefault();
      const fields = controls(event.currentTarget);
      const next: FieldErrors = Object.fromEntries(fields.filter((field) => field.id).map((field) => [field.id, constraintError(field)]));
      for (const [id, message] of Object.entries(validate?.() ?? {})) {
        if (message) next[id] = message;
      }
      setErrors(next);
      const first = fields.find((field) => next[field.id]);
      if (first) {
        const disclosure = first.closest("details");
        if (disclosure) disclosure.open = true;
        first.focus();
        return;
      }
      if (Object.values(next).some(Boolean)) return;
      onSubmit?.(event);
    }}>
      <InlineNotice>{error}</InlineNotice>
      <InlineNotice tone="status">{notice ?? (changed ? "Unsaved changes" : undefined)}</InlineNotice>
      {Object.values(errors).some(Boolean) && <InlineNotice>Check the highlighted fields before continuing.</InlineNotice>}
      {children}
    </form>
  </ErrorsContext.Provider>;
}

/** Keep field labels/layout intact while adding the same accessible error treatment. */
export function FormField({ id, children, label, hint, className = "field" }: { id: string; children: ReactNode; label?: string; hint?: string; className?: string }) {
  const error = useContext(ErrorsContext)[id];
  return <div className={`${className} ${styles.field}`}>
    {label && <label htmlFor={id}>{label}</label>}
    {Children.map(children, (child) => {
      if (!isValidElement<{ id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string }>(child) || child.props.id !== id) return child;
      const description = [child.props["aria-describedby"], hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(" ");
      return cloneElement(child, { "aria-invalid": Boolean(error) || child.props["aria-invalid"], "aria-describedby": description || undefined });
    })}
    {hint && <p className={styles.hint} id={`${id}-hint`}>{hint}</p>}
    {error && <p className={styles.error} id={`${id}-error`}>{error}</p>}
  </div>;
}
