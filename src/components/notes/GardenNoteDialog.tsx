"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { SyncStatus } from "@/components/workspace/SyncStatus";
import { lockBodyScroll } from "@/lib/modalScrollLock";
import { WorkspaceGardenNote } from "./WorkspaceGardenNote";
import styles from "./GardenNoteDialog.module.css";

export function GardenNoteDialog({ onClose, opener, fallbackOpener, batchAvailable }: {
  onClose: () => void;
  opener: RefObject<HTMLButtonElement | null>;
  fallbackOpener: RefObject<HTMLButtonElement | null>;
  batchAvailable: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    const unlock = lockBodyScroll();
    const trigger = opener.current;
    const viewport = window.visualViewport;
    const fitViewport = () => {
      if (!viewport) return;
      node.style.setProperty("--note-viewport-height", `${viewport.height}px`);
      node.style.setProperty("--note-viewport-top", `${viewport.offsetTop}px`);
    };
    fitViewport();
    viewport?.addEventListener("resize", fitViewport);
    viewport?.addEventListener("scroll", fitViewport);
    node.showModal();
    heading.current?.focus();
    return () => {
      node.close();
      unlock();
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
      requestAnimationFrame(() => {
        const returnTo = trigger?.isConnected && !trigger.disabled ? trigger : fallbackOpener.current;
        if (returnTo?.isConnected && !document.querySelector("dialog[open]")) returnTo.focus();
      });
    };
  }, [opener, fallbackOpener]);

  return createPortal(
    <dialog id="garden-note-dialog" ref={dialog} className={styles.dialog} aria-modal="true" aria-labelledby="garden-note-title"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}>
      <header className={styles.header}>
        <h2 ref={heading} id="garden-note-title" tabIndex={-1}>Garden Note</h2>
        <Button variant="text" onClick={onClose}>Close</Button>
      </header>
      <div className={styles.body}>
        <SyncStatus recoveryOnly />
        <WorkspaceGardenNote onClose={onClose} batchAvailable={batchAvailable} />
      </div>
    </dialog>, document.body,
  );
}
