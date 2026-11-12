"use client";

import type { RefObject } from "react";
import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { Button } from "@/components/ui/Button";
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

  return <section className={styles.tasks} aria-labelledby="overview-note-heading">
    <h2 id="overview-note-heading">AI Garden Notes</h2>
    <p className={styles.hint}>Turn a quick note into care records you can review.</p>
    <FeedbackForm className={styles.overviewNoteForm} notice="" onSubmit={() => {
      if (!canGenerate || !noteLength || tooLong) return;
      onOpen(primaryButton.current, true);
      void batch.generate(true);
    }}>
      <FormField id="overview-note-text" className={styles.noteField} hint={tooLong ? `Shorten your note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer.` : undefined}>
        <textarea id="overview-note-text" aria-label="Quick garden note" rows={3} value={batch.note}
          aria-invalid={tooLong} readOnly={editingInDialog} onChange={(event) => batch.setText(event.target.value)}
          placeholder="Watered the front beds and fertilized the back garden." />
      </FormField>
      <Button ref={primaryButton} variant="primary" aria-haspopup="dialog" aria-expanded={expanded}
        type={canGenerate ? "submit" : "button"} disabled={canGenerate && (!noteLength || tooLong)}
        onClick={canGenerate ? undefined : (event) => onOpen(event.currentTarget, batchAvailable)}>
        {canGenerate ? "Generate draft" : label}
      </Button>
      {canGenerate && <Button variant="text" aria-haspopup="dialog" aria-expanded={expanded}
        onClick={(event) => onOpen(event.currentTarget, batchAvailable)}>Open note editor</Button>}
    </FeedbackForm>
  </section>;
}
