"use client";

import type { RefObject } from "react";
import { FeedbackForm } from "@/components/forms/FormFeedback";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { AI_CARE_NOTE_MAX_LENGTH } from "@/lib/gardenWorkspaceApi";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

export function OverviewGardenNote({ primaryButton, expanded, onOpen }: {
  primaryButton: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  onOpen: (opener: HTMLButtonElement | null, batchAvailable: boolean) => void;
}) {
  const { careNoteBatch: batch, drafts, singleNoteReceipt, isSynced, workspace } = useWorkspace();
  const { config } = useRuntimeConfig();
  const batchAvailable = config?.careNoteBatchAvailable === true;
  const count = batch.rows.length || (drafts["note:draft"] ? 1 : 0);
  const hasResult = Boolean(batch.receipt || singleNoteReceipt);
  const editingInDialog = Boolean(count || hasResult || batch.loading || batch.sourceNote || drafts["note:isLoading"]);
  const canGenerate = batchAvailable && isSynced && Boolean(workspace?.gardens.length) && !editingInDialog;
  const noteLength = Array.from(batch.note.trim()).length;
  const tooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;
  const label = hasResult ? "View note status"
    : count ? `Continue note · ${count} ${count === 1 ? "draft" : "drafts"}`
      : editingInDialog || batch.note ? "Continue note" : "Open note editor";

  // ADR-0081: a ruled sheet of paper on the leaf-vein band. The paper is the note's textarea.
  return <section className={`${styles.band} ${styles.veins} ${styles.noteBlock}`} aria-labelledby="overview-note-heading">
    <div className={styles.noteHead}>
      <span className={styles.noteIcon} aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" /><path d="M14.5 6.5l3 3" /></svg>
      </span>
      <h2 id="overview-note-heading" className={styles.noteTitle}>AI Garden Notes</h2>
      <span className={styles.noteHint}>Becomes care records</span>
    </div>
    <FeedbackForm className={styles.noteForm} notice="" onSubmit={() => {
      if (!canGenerate || !noteLength || tooLong) return;
      onOpen(primaryButton.current, true);
      void batch.generate(true);
    }}>
      <div className={styles.paper}>
        <textarea id="overview-note-text" className={styles.ruled} aria-label="Quick garden note" rows={4} value={batch.note}
          aria-invalid={tooLong} aria-describedby={tooLong ? "overview-note-text-hint" : undefined}
          readOnly={editingInDialog} onChange={(event) => batch.setText(event.target.value)}
          placeholder="Watered the front beds and fertilized the back garden." />
      </div>
      {tooLong && <p id="overview-note-text-hint" className={styles.noteError}>Shorten your note to {AI_CARE_NOTE_MAX_LENGTH} characters or fewer.</p>}
      <div className={styles.noteFoot}>
        <span className={styles.noteFootHint}>Write it your way. You review before anything is saved.</span>
        <span className={styles.noteActions}>
          {canGenerate && <button type="button" className={styles.noteTextButton} aria-haspopup="dialog" aria-expanded={expanded}
            onClick={(event) => onOpen(event.currentTarget, batchAvailable)}>Open note editor</button>}
          <button ref={primaryButton} className={styles.buttonWhite} aria-haspopup="dialog" aria-expanded={expanded}
            type={canGenerate ? "submit" : "button"} disabled={canGenerate && (!noteLength || tooLong)}
            onClick={canGenerate ? undefined : (event) => onOpen(event.currentTarget, batchAvailable)}>
            {canGenerate ? "Generate draft" : label}
          </button>
        </span>
      </div>
    </FeedbackForm>
  </section>;
}
