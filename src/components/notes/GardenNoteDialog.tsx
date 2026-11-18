"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { SyncStatus } from "@/components/workspace/SyncStatus";
import { openModalDialog } from "@/lib/modalDialog";
import { WorkspaceGardenNote } from "./WorkspaceGardenNote";
import styles from "./GardenNoteDialog.module.css";

export function GardenNoteDialog({ onClose, opener, fallbackOpener, batchAvailable, initialGardenId }: {
  onClose: () => void;
  /** Preselects this garden in the single-note form. */
  initialGardenId?: string;
  opener: RefObject<HTMLButtonElement | null>;
  fallbackOpener: RefObject<HTMLButtonElement | null>;
  batchAvailable: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
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
    const fallback = fallbackOpener.current;
    const close = openModalDialog(node, () => (trigger?.isConnected && !trigger.disabled ? trigger : fallback));
    heading.current?.focus();
    return () => {
      close();
      viewport?.removeEventListener("resize", fitViewport);
      viewport?.removeEventListener("scroll", fitViewport);
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
        <WorkspaceGardenNote onClose={onClose} batchAvailable={batchAvailable} initialGardenId={initialGardenId} />
      </div>
    </dialog>, document.body,
  );
}
