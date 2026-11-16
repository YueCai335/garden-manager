"use client";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { lockBodyScroll } from "@/lib/modalScrollLock";
import { Button } from "../ui/Button";
import type { EditorMode } from "./EditorWorkbench";
import styles from "./Editor.module.css";

export function EditorPanel({ mode, title, context, headingId, returnFocusId, onClose, children }: {
  mode: EditorMode; title: string; context?: string; headingId: string;
  returnFocusId: string; onClose: () => void; children: ReactNode;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedControl = useRef<HTMLElement | null>(null);
  const [activeMode, setActiveMode] = useState(mode);
  useEffect(() => {
    const update = () => {
      if (document.querySelector('dialog[open][role="alertdialog"]')) return false;
      setActiveMode(mode);
      return true;
    };
    if (update()) return;
    // Do not put a resized editor above its pending confirmation in the top layer.
    const observer = new MutationObserver(() => { if (update()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mode]);
  useEffect(() => {
    const node = panel.current!;
    node.close();
    const unlock = activeMode === "overlay" ? lockBodyScroll() : undefined;
    if (activeMode === "overlay") node.showModal(); else node.setAttribute("open", "");
    // A nested discard dialog keeps focus until its own action completes.
    if (!document.querySelector('dialog[open][role="alertdialog"]')) {
      const target = focusedControl.current && node.contains(focusedControl.current) ? focusedControl.current : heading.current;
      target?.focus({ preventScroll: activeMode !== "mobile" });
      if (activeMode === "mobile") target?.scrollIntoView?.({ block: "nearest" });
    }
    return () => {
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && node.contains(focused)) focusedControl.current = focused;
      node.close();
      unlock?.();
    };
  }, [activeMode]);
  useEffect(() => () => {
    requestAnimationFrame(() => {
      if (document.querySelector('dialog[open]')) return;
      const target = document.getElementById(returnFocusId) ?? document.getElementById("garden-plan-heading");
      target?.focus();
    });
  }, [returnFocusId]);

  const wrapTabFocus = (event: KeyboardEvent<HTMLDialogElement>) => {
    const dialog = event.currentTarget;
    const focused = document.activeElement;
    if (activeMode !== "overlay" || event.key !== "Tab" || !dialog.contains(focused) || event.defaultPrevented) return;
    const controls = [...dialog.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")].filter((control) =>
      control.tabIndex >= 0 && !control.matches(":disabled") && !control.closest("[inert]") &&
      control.getClientRects().length > 0 && getComputedStyle(control).visibility === "visible",
    );
    const first = controls[0];
    const last = controls.at(-1);
    const next = event.shiftKey && (focused === first || focused === heading.current) ? last
      : !event.shiftKey && focused === last ? first : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
  };

  return <dialog ref={panel} role={activeMode === "overlay" ? "dialog" : "region"} aria-modal={activeMode === "overlay" ? true : undefined}
    aria-labelledby={headingId} className={styles.panel} data-mode={activeMode}
    onKeyDown={wrapTabFocus}
    onCancel={(event) => { if (event.target === event.currentTarget) { event.preventDefault(); onClose(); } }}>
    <header className={styles.panelHeader}>
      {context && <p>{context}</p>}
      <h2 id={headingId} ref={heading} tabIndex={-1}>{title}</h2>
      {/* Edits apply as they are made, so leaving the panel means the edit is done. */}
      <Button onClick={onClose}>Done</Button>
    </header>
    <div className={styles.panelBody}>{children}</div>
  </dialog>;
}
