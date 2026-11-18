"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { lockBodyScroll } from "@/lib/modalScrollLock";
import type { CareEventType } from "@/lib/gardenWorkspace";
import styles from "./Care.module.css";

export function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
}

/** Watering is a drop, fertilizing a sprout: the shape tells them apart, not only the colour. */
export function CareIcon({ type }: { type: CareEventType }) {
  return <span className={styles.careIcon} data-type={type} aria-hidden="true">
    {type === "watering"
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5c3 3.6 5.5 6.3 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6 5.5-9.6z" /></svg>
      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-8" /><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5z" /><path d="M12 14.5c0-2.5 2-4.5 6-4.5 0 2.5-2 4.5-6 4.5z" /></svg>}
  </span>;
}

/**
 * The tick circle. An open task or a tick from this visit is a checkbox button; a record from
 * elsewhere shows as done but is corrected in History.
 */
export function Tick({ rowKey, label, done, onToggle }: { rowKey: string; label: string; done: boolean; onToggle?: () => void }) {
  const circle = <span className={styles.tickCircle} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" /></svg>
  </span>;
  return onToggle
    ? <button type="button" role="checkbox" aria-checked={done} aria-label={label} className={styles.tick} data-row-key={rowKey} onClick={onToggle}>{circle}</button>
    : <span className={styles.tick} role="img" aria-label={`${label}, done`}>{circle}</span>;
}

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

/** The "⋯" row menu: arrow keys move, Escape and outside clicks close it and return to the button. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuItems = () => [...wrap.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []];
  const close = () => { setOpen(false); button.current?.focus(); };
  // The band clips its content: when the menu does not fit below, open it on the side with more room.
  useLayoutEffect(() => {
    const menu = wrap.current?.querySelector<HTMLElement>("[role=menu]");
    if (!menu || !button.current) return;
    let clip = wrap.current!.parentElement;
    while (clip && getComputedStyle(clip).overflow === "visible") clip = clip.parentElement;
    if (!clip) return;
    const box = clip.getBoundingClientRect();
    const anchor = button.current.getBoundingClientRect();
    const below = box.bottom - anchor.bottom;
    const above = anchor.top - box.top;
    if (menu.getBoundingClientRect().height + 4 > below && above > below) menu.dataset.up = "true";
  }, [open]);
  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
    const outside = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <div ref={wrap} className={styles.menuWrap}>
    <button ref={button} type="button" className={styles.more} aria-label={label} aria-haspopup="menu" aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => { if (event.key === "ArrowDown" && !open) { event.preventDefault(); setOpen(true); } }}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="9" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="14.5" cy="9" r="1.5" /></svg>
    </button>
    {open && <div role="menu" aria-label={label} className={styles.menu}
      onBlur={(event) => { if (!wrap.current?.contains(event.relatedTarget as Node)) setOpen(false); }}
      onKeyDown={(event) => {
        const list = menuItems();
        const index = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (index + 1) % list.length : event.key === "ArrowUp" ? (index - 1 + list.length) % list.length
          : event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); list[next]?.focus(); return; }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
        if (event.key === "Tab") setOpen(false);
      }}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" tabIndex={-1} className={styles.menuItem} data-danger={item.danger || undefined}
        onClick={() => { close(); item.onSelect(); }}>{item.label}</button>)}
    </div>}
  </div>;
}

/**
 * When one Care dialog replaces another in the same render (Edit task → Complete on another date),
 * the closing dialog hands its opener to the next one, so focus still returns to the row.
 */
let handoffTrigger: HTMLElement | null = null;

/**
 * A form dialog, written like the Garden Note dialog: a native <dialog> opened with showModal().
 * Escape asks `onClose`, which decides whether unsaved changes need a confirmation.
 */
export function CareDialog({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    const active = document.activeElement;
    const trigger = active instanceof HTMLElement && active !== document.body && !active.closest("dialog") ? active : handoffTrigger;
    const unlock = lockBodyScroll();
    node.showModal();
    // The form's first field (marked data-autofocus) takes focus; otherwise the title does.
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? heading.current)?.focus();
    return () => {
      node.close();
      unlock();
      handoffTrigger = trigger;
      requestAnimationFrame(() => {
        handoffTrigger = null;
        // Leave focus alone if another dialog is open or the user has already moved on.
        if (document.querySelector("dialog[open]") || (document.activeElement && document.activeElement !== document.body)) return;
        const target = trigger?.isConnected && !trigger.matches(":disabled") ? trigger : document.querySelector<HTMLElement>("main h1");
        target?.focus();
      });
    };
  }, []);
  return createPortal(
    <dialog id={id} ref={dialog} className={styles.dialog} aria-modal="true" aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}>
      <header className={styles.dialogHeader}>
        <h2 ref={heading} id={`${id}-title`} tabIndex={-1}>{title}</h2>
        <Button variant="text" onClick={onClose}>Close</Button>
      </header>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>, document.body,
  );
}
