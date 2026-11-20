"use client";

import Link from "next/link";
import type { ReactNode, RefObject } from "react";
import { useConfirmation } from "@/components/ConfirmDialog";
import { FeedbackForm } from "@/components/forms/FormFeedback";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { batchRowsErrors, rowTaskMatches, type CareDraftRow } from "@/lib/careNoteBatch";
import { careTypeName } from "@/lib/careLabels";
import { AI_CARE_NOTE_MAX_LENGTH } from "@/lib/gardenWorkspaceApi";
import type { GardenWorkspace } from "@/lib/gardenWorkspace";
import { noteGroups } from "@/lib/noteFragments";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

/** One pill per garden with a dot per record's type, as the note dialog's garden cards show them. */
function GardenPills({ workspace, rows, done }: { workspace: GardenWorkspace; rows: CareDraftRow[]; done?: boolean }) {
  return <ul className={styles.notePills}>{noteGroups(workspace, rows).map((group) => <li key={group.key}>
    {done && <span className={styles.notePillTick} aria-hidden="true">✓</span>}{group.name}
    <span className={styles.notePillDots}>{group.rows.map((row) => <i key={row.draftId} data-type={row.type || undefined} title={row.type ? careTypeName[row.type] : undefined} />)}</span>
  </li>)}</ul>;
}

export function OverviewGardenNote({ primaryButton, expanded, onOpen }: {
  primaryButton: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  onOpen: (opener: HTMLButtonElement | null, batchAvailable: boolean) => void;
}) {
  const sync = useWorkspace();
  const { careNoteBatch: batch, drafts, singleNoteReceipt, isSynced, workspace } = sync;
  const { config } = useRuntimeConfig();
  const { confirmation, requestConfirmation } = useConfirmation();
  const batchAvailable = config?.careNoteBatchAvailable === true;
  const count1 = batch.rows.length || (drafts["note:draft"] ? 1 : 0);
  const hasResult = Boolean(batch.receipt || singleNoteReceipt);
  const editingInDialog = Boolean(count1 || hasResult || batch.loading || batch.sourceNote || drafts["note:isLoading"]);
  const canGenerate = batchAvailable && isSynced && Boolean(workspace?.gardens.length) && !editingInDialog;
  const noteLength = Array.from(batch.note.trim()).length;
  const tooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;
  const open = (event: { currentTarget: HTMLButtonElement }) => onOpen(event.currentTarget, batchAvailable);

  const card = (hint: string, body: ReactNode, foot: ReactNode) => <section className={`${styles.band} ${styles.veins} ${styles.noteBlock}`} aria-labelledby="overview-note-heading">
    {confirmation}
    <div className={styles.noteHead}>
      <span className={styles.noteIcon} aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" /><path d="M14.5 6.5l3 3" /></svg>
      </span>
      <h2 id="overview-note-heading" className={styles.noteTitle}>AI Garden Notes</h2>
      <span className={styles.noteHint}>{hint}</span>
    </div>
    {body}
    {foot}
  </section>;
  const primary = (text: string, onClick?: (event: { currentTarget: HTMLButtonElement }) => void) =>
    // A key per label, so React never reuses one state's button as another's: the dialog returns focus
    // to the button that opened it only while that button still exists.
    <button key={text} ref={primaryButton} type="button" className={styles.buttonWhite} aria-haspopup="dialog" aria-expanded={expanded} onClick={onClick ?? open}>{text}</button>;

  // ADR-0085: in the local app the card follows the note's draft, so an unfinished review is never forgotten.
  if (batchAvailable && workspace) {
    const latest = sync.getLatestWorkspace() ?? workspace;
    const receipt = batch.receipt;
    if (receipt && (receipt.status === "applied" || receipt.status === "saved")) {
      const saved = receipt.status === "saved";
      const tasks = [receipt.tasksCompleted && `Ticked off ${count(receipt.tasksCompleted, "task")}`, receipt.tasksAdded && `Added ${count(receipt.tasksAdded, "task")}`].filter(Boolean).join(" · ");
      return card(saved ? "Saved just now" : "Saving…",
        <div className={styles.noteSummary}>
          <p className={styles.noteSummaryTitle}>{saved ? `Saved ${count(receipt.rows.length, "record")}` : `Saving ${count(receipt.rows.length, "record")}…`}</p>
          <GardenPills workspace={latest} rows={receipt.rows} done={saved} />
          {tasks && <p className={styles.noteSummaryLine}><b>{tasks}</b></p>}
        </div>,
        <div className={styles.noteFoot}>
          <span className={styles.noteFootHint}>{saved ? "Find them in Care history." : "The note dialog shows any problem with saving."}</span>
          <span className={styles.noteActions}>
            {saved && <Link className={styles.noteTextButton} href="/care?view=history">View records</Link>}
            {saved ? primary("Write another note", () => batch.recordMore(Boolean(batch.rows.length))) : primary("View status")}
          </span>
        </div>);
    }
    if (batch.loading) return card("Reading your note",
      <div className={styles.noteSummary}><p className={styles.noteSummaryTitle}>Reading your note…</p><p className={styles.noteQuote}>{batch.note}</p></div>,
      <div className={styles.noteFoot}><span className={styles.noteFootHint}>Splitting it into records for each garden.</span><span className={styles.noteActions}>{primary("Continue")}</span></div>);
    if (batch.rows.length || batch.sourceNote) {
      const included = batch.rows.filter((row) => row.included);
      const matches = rowTaskMatches(latest, batch.rows);
      const ticking = included.reduce((sum, row) => sum + (matches.get(row.draftId) ?? []).filter((ref) => !row.skippedTaskKeys?.includes(ref.key)).length, 0);
      const needing = included.filter((row) => Object.keys(batchRowsErrors(latest, [{ ...row, included: true }])).length).length;
      return card("Draft in progress",
        <div className={styles.noteSummary}>
          <p className={styles.noteSummaryTitle}>{batch.rows.length ? `${count(batch.rows.length, "record")} waiting for review` : "Your note needs a look"}</p>
          {batch.rows.length > 0 && <GardenPills workspace={latest} rows={batch.rows} />}
          {(ticking > 0 || needing > 0) && <p className={styles.noteSummaryLine}>
            {ticking > 0 && <b>Completes {count(ticking, "task")}</b>}{ticking > 0 && needing > 0 && " · "}
            {needing > 0 && <span className={styles.noteNeeds}>{needing} {needing === 1 ? "needs" : "need"} your input</span>}
          </p>}
          <p className={styles.noteQuote}>{batch.sourceNote || batch.note}</p>
        </div>,
        <div className={styles.noteFoot}>
          <span className={styles.noteFootHint}>Nothing is saved until you review it.</span>
          <span className={styles.noteActions}>
            <button key="discard" type="button" className={styles.noteTextButton} onClick={() => requestConfirmation({ message: "Discard this note and all of its unsaved drafts?", confirmLabel: "Discard note", tone: "danger", fallbackFocusId: "overview-note-heading", onConfirm: () => batch.recordMore() })}>Discard</button>
            {primary("Continue review")}
          </span>
        </div>);
    }
  }

  // ADR-0081: a ruled sheet of paper on the leaf-vein band. The paper is the note's textarea.
  // Without batch drafting (the public demo), the primary button opens the single-record note.
  const label = hasResult ? "View note status"
    : count1 ? `Continue note · ${count1} ${count1 === 1 ? "draft" : "drafts"}`
      : editingInDialog || batch.note ? "Continue note" : "Open note editor";
  return card("Becomes care records",
    <FeedbackForm id="overview-note-form" className={styles.noteForm} notice="" onSubmit={() => {
      if (!canGenerate || !noteLength || tooLong) return;
      onOpen(primaryButton.current, true);
      void batch.generate(true);
    }}>
      <div className={styles.paper}>
        <textarea id="overview-note-text" className={styles.ruled} aria-label="Quick garden note" rows={4} value={batch.note}
          aria-invalid={tooLong} aria-describedby={tooLong ? "overview-note-text-hint" : undefined}
          readOnly={editingInDialog} onChange={(event) => batch.setText(event.target.value)}
          placeholder={batchAvailable ? "Write it your way, e.g. 今天给 Backyard 浇了水，番茄施了鱼乳肥。" : "Watered the front beds and fertilized the back garden."} />
      </div>
      {tooLong && <p id="overview-note-text-hint" className={styles.noteError}>Shorten your note to {AI_CARE_NOTE_MAX_LENGTH} characters or fewer.</p>}
    </FeedbackForm>,
    <div className={styles.noteFoot}>
      <span className={styles.noteFootHint}>{batchAvailable ? "Several gardens and jobs in one go. You review before anything is saved." : "Write it your way. You review before anything is saved."}</span>
      <span className={styles.noteActions}>
        {batchAvailable ? <button key="split" ref={primaryButton} form="overview-note-form" className={styles.buttonWhite} aria-haspopup="dialog" aria-expanded={expanded}
          type="submit" disabled={!canGenerate || !noteLength || tooLong}>Split into records</button>
          : <button ref={primaryButton} type="button" className={styles.buttonWhite} aria-haspopup="dialog" aria-expanded={expanded} onClick={open}>{label}</button>}
      </span>
    </div>);
}
