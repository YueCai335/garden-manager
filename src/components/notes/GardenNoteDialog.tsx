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

  // ADR-0085: the batch note draws its own green strip, so its heading and Close sit on it and scroll with it.
  const title = <h2 ref={heading} id="garden-note-title" tabIndex={-1}>Garden Note</h2>;
  return createPortal(
    <dialog id="garden-note-dialog" ref={dialog} className={`${styles.dialog} ${batchAvailable ? styles.flowDialog : ""}`} aria-modal="true" aria-labelledby="garden-note-title"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}>
      {batchAvailable ? <div className={styles.flowScroll}>
        <WorkspaceGardenNote onClose={onClose} batchAvailable initialGardenId={initialGardenId} status={<SyncStatus recoveryOnly />}
          header={<header className={styles.flowHeader}>{title}<button type="button" className={styles.flowClose} onClick={onClose}>Close</button></header>} />
      </div> : <>
        <header className={styles.header}>
          {title}
          <Button variant="text" onClick={onClose}>Close</Button>
        </header>
        <div className={styles.body}>
          <SyncStatus recoveryOnly />
          <WorkspaceGardenNote onClose={onClose} batchAvailable={batchAvailable} initialGardenId={initialGardenId} />
        </div>
      </>}
    </dialog>, document.body,
  );
}
