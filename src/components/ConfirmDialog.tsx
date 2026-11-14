"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/Button";
import styles from "./ConfirmDialog.module.css";
import { lockBodyScroll } from "@/lib/modalScrollLock";

export type ConfirmDialogProps = {
  title?: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  fallbackFocusId?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", tone = "default", fallbackFocusId, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    const element = dialog.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockBodyScroll();
    element.showModal();
    cancel.current?.focus();
    return () => {
      element.close();
      unlock();
      const fallback = (fallbackFocusId ? document.getElementById(fallbackFocusId) : null) ?? document.querySelector<HTMLElement>("main h1");
      // Capture the destination now so a later screen cannot inherit stale focus work.
      requestAnimationFrame(() => {
        if (element.open || document.querySelector('dialog[open][role="alertdialog"]')) return;
        const target = trigger?.isConnected && !trigger.matches(":disabled") ? trigger
          : fallback;
        if (target?.isConnected) target.focus();
      });
    };
  }, [fallbackFocusId]);
  return createPortal(<dialog ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className={styles.dialog}
    onKeyDown={(event) => {
      if (event.key !== "Tab" || event.defaultPrevented) return;
      const first = cancel.current;
      const last = confirm.current;
      const next = event.shiftKey && event.target === first ? last : !event.shiftKey && event.target === last ? first : null;
      if (!next || next.disabled) return;
      event.preventDefault();
      next.focus();
    }}
    onCancel={(event) => { event.preventDefault(); if (!submitting.current) onCancel(); }}>
    <div className={styles.content}>
      <h2 id={`${id}-title`}>{title ?? confirmLabel}</h2>
      <p id={`${id}-description`}>{message}</p>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
    <div className={styles.actions}>
      <Button ref={cancel} disabled={busy} onClick={onCancel}>{cancelLabel}</Button>
      <Button ref={confirm} variant={tone === "danger" ? "danger" : "primary"} loading={busy} loadingLabel="Working…" onClick={async () => {
        if (submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError("");
        try { await onConfirm(); }
        catch (reason) {
          setError(reason instanceof Error ? reason.message : "This action could not be completed. Your changes are still here. Try again.");
          submitting.current = false;
          setBusy(false);
          cancel.current?.focus();
        }
      }}>{confirmLabel}</Button>
    </div>
  </dialog>, document.body);
}

/** All callers use the same modal and only close it after a successful action. */
export function useConfirmation() {
  const [pending, setPending] = useState<Omit<ConfirmDialogProps, "onCancel">>();
  const confirmation = pending ? <ConfirmDialog {...pending} onCancel={() => setPending(undefined)} onConfirm={async () => {
    await pending.onConfirm();
    setPending(undefined);
  }} /> : null;
  const confirmDiscard = (dirty: boolean, action: () => void, fallbackFocusId?: string) => {
    if (!dirty) { action(); return; }
    setPending({ title: "Discard unsaved changes?", message: "Your changes to this form have not been submitted. Discard them or keep editing.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", fallbackFocusId, onConfirm: action });
  };
  return { requestConfirmation: setPending, confirmation, confirmDiscard };
}
