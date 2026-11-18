"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { lockBodyScroll } from "@/lib/modalScrollLock";
import styles from "./Care.module.css";

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
