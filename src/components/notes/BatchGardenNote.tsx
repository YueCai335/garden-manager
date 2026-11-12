"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { useConfirmation } from "@/components/ConfirmDialog";
import { FeedbackForm, FormField, InlineNotice } from "@/components/forms/FormFeedback";
import { Button, ButtonLink } from "@/components/ui/Button";
import { batchFieldId, batchRowsErrors, type CareDraftRow } from "@/lib/careNoteBatch";
import { AI_CARE_NOTE_MAX_LENGTH } from "@/lib/gardenWorkspaceApi";
import type { GardenWorkspace } from "@/lib/gardenWorkspace";
import styles from "./BatchGardenNote.module.css";
import dialogStyles from "./GardenNoteDialog.module.css";

export function BatchGardenNote({ onClose }: { onClose?: () => void }) {
  const sync = useWorkspace();
  const { careNoteBatch: batch, workspace } = sync;
  const { confirmation, requestConfirmation } = useConfirmation();
  const receipt = batch.receipt;
  const stage = receipt?.status === "applied" || receipt?.status === "saved" ? receipt.status : batch.rows.length ? "review" : "entry";
  const previousStage = useRef(stage);
  const stageFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (onClose && previousStage.current !== stage) stageFocus.current?.focus();
    previousStage.current = stage;
  }, [onClose, stage]);
  if (!workspace) return <section className="operations-content">{!onClose && <h2>AI Garden Note</h2>}<Link href="/gardens/new">Create a garden to start recording care</Link></section>;
  const recordCount = (count: number) => `${count} ${count === 1 ? "record" : "records"}`;
  const selected = batch.rows.filter((row) => row.included);
  const locations = selected.some((row) => row.targetScope === "all-gardens") ? " · Includes all-gardens care" : "";
  const gardenCount = new Set(selected.filter((row) => row.targetScope !== "all-gardens" && row.gardenId).map((row) => row.gardenId)).size;
  const noteLength = Array.from(batch.note.trim()).length;
  const tooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;
  const titleId = onClose ? "garden-note-title" : "batch-note-heading";
  const actionClass = onClose ? dialogStyles.footer : "form-actions";
  const generate = () => {
    const run = () => { void batch.generate(true); };
    if (batch.rows.length || batch.notices.length) requestConfirmation({ message: "Replace the current review drafts with a new extraction? Your original note stays available.", confirmLabel: "Replace drafts", fallbackFocusId: titleId, onConfirm: run });
    else run();
  };
  return <section className={`operations-content ${styles.review}`} aria-labelledby={titleId}>
    {confirmation}
    {!onClose && <h2 id={titleId} tabIndex={-1}>AI Garden Note</h2>}
    {receipt && receipt.status !== "discarded" ? <section aria-label="Batch result">
      <h3 tabIndex={-1} ref={(node) => { stageFocus.current = node; }}>{receipt.status === "saved" ? `Saved ${recordCount(receipt.rows.length)}` : `Added ${recordCount(receipt.rows.length)} to this workspace`}</h3>
      <p role="status">{receipt.status === "saved" ? "Your reviewed records are saved." : "Waiting for workspace sync. You can close this window while saving continues."}</p>
      <details><summary>Original note</summary><p className={styles.quote}>{receipt.note}</p>{receipt.sourceNote !== receipt.note && <><strong>Draft source note</strong><p className={styles.quote}>{receipt.sourceNote}</p></>}</details>
      {receipt.status === "saved" && <div className={actionClass}>
        <ButtonLink variant="text" href="/care?view=history">View records</ButtonLink>
        <Button onClick={() => batch.recordMore(Boolean(batch.rows.length))}>{batch.rows.length ? `Review remaining drafts (${batch.rows.length})` : "Record more"}</Button>
        {onClose && <Button variant="primary" onClick={() => { batch.recordMore(Boolean(batch.rows.length)); onClose(); }}>Done and close</Button>}
      </div>}
    </section> : <>
      <p>Write completed watering or fertilizing actions across your gardens. Review the drafts before saving.</p>
      <FeedbackForm id="batch-note-source" notice="" error={batch.error} validate={() => ({ "batch-original-note": tooLong ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer.` : undefined })} onSubmit={generate}>
        <FormField id="batch-original-note" label="Care note">
          <textarea id="batch-original-note" required rows={3} value={batch.note} onChange={(event) => batch.setText(event.target.value)}
            aria-describedby="batch-note-length" placeholder="Watered tomatoes in the front garden and fertilized the back bed today."
            ref={(node) => { if (stage === "entry") stageFocus.current = node; }} />
        </FormField>
        <p className={tooLong ? styles.needsReview : styles.noteLength} id="batch-note-length">{noteLength} / {AI_CARE_NOTE_MAX_LENGTH} characters{tooLong && " · Shorten the note before generating."}</p>
        {!sync.isSynced && <p>Your workspace needs to sync before generating drafts. You can still enter records manually.</p>}
      </FeedbackForm>
      {batch.stale && <InlineNotice tone="warning">Your note changed after these drafts were created. Review them against the original text below, or choose Generate again to replace them.<span className={styles.originalNote}>{batch.sourceNote}</span></InlineNotice>}
      {receipt?.status === "discarded" && <InlineNotice>Reloading removed some or all of this batch. No new records have been added. Check these drafts before saving again.</InlineNotice>}
      {batch.notices.length > 0 && <section aria-label="Notes needing attention"><h3>Notes needing attention</h3>{batch.notices.map((notice, index) => <div key={index}><p className={styles.quote}>{notice.sourceText}</p><p>{notice.message}</p></div>)}</section>}
      {batch.rows.length ? <FeedbackForm id="batch-note-review" notice="" error={batch.errors.batch} validate={() => batchRowsErrors(sync.getLatestWorkspace() ?? workspace, batch.rows)} onSubmit={batch.apply}>
        <h3 tabIndex={-1} ref={(node) => { stageFocus.current = node; }}>Review {recordCount(selected.length)}{gardenCount ? ` across ${gardenCount} ${gardenCount === 1 ? "garden" : "gardens"}` : ""}{locations}</h3>
        <p>Unchecked drafts are kept for later review.</p>
        {batch.rows.map((row, index) => <DraftRow key={row.draftId} row={row} index={index} workspace={workspace} errors={batch.errors} patch={(patch) => batch.patchRow(row.draftId, patch)} remove={() => requestConfirmation({ message: `Remove draft ${index + 1}? The original note stays available.`, confirmLabel: "Remove draft", fallbackFocusId: titleId, onConfirm: () => batch.removeRow(row.draftId) })} />)}
      </FeedbackForm> : batch.sourceNote && <p>No completed care records were extracted. Check any notes needing attention, revise your note, or add a record manually.</p>}
      {batch.rows.length >= 6 && <p>Up to 6 records per batch.</p>}
      <div className={actionClass}>
        {onClose && (batch.note || batch.rows.length > 0 || batch.notices.length > 0) && <Button variant="text" disabled={batch.loading} onClick={() => requestConfirmation({
          message: "Discard this note and all of its unsaved drafts?", confirmLabel: "Discard note", tone: "danger",
          fallbackFocusId: titleId, onConfirm: () => batch.recordMore(),
        })}>Discard note</Button>}
        <Button disabled={batch.rows.length >= 6} onClick={batch.addRow}>Add record</Button>
        <Button variant={batch.rows.length ? "secondary" : "primary"} type="submit" form="batch-note-source"
          disabled={!sync.isSynced || !noteLength || tooLong} loading={batch.loading} loadingLabel="Creating drafts…">{batch.rows.length ? "Generate again" : "Create drafts"}</Button>
        {batch.rows.length > 0 && <Button variant="primary" type="submit" form="batch-note-review" disabled={!selected.length || batch.loading}>Save {recordCount(selected.length)}</Button>}
      </div>
    </>}
  </section>;
}

function DraftRow({ row, index, workspace, patch, remove, errors }: {
  row: CareDraftRow; index: number; workspace: GardenWorkspace; patch: (patch: Partial<CareDraftRow>) => void; remove: () => void; errors: Record<string, string>;
}) {
  const id = (field: string) => batchFieldId(row, field);
  const garden = workspace.gardens.find((item) => item.id === row.gardenId);
  const target = row.targetScope === "planting-area" ? `planting-area:${row.growingAreaId}` : row.targetScope === "plant-group" ? `plant-group:${row.plantingRecordId}` : row.targetScope;
  const area = garden?.growingAreas.find((item) => item.id === row.growingAreaId);
  const plant = garden?.plantings.find((item) => item.id === row.plantingRecordId);
  const location = row.targetScope === "all-gardens" ? "All gardens" : [garden?.name, row.targetScope === "planting-area" ? area?.name : row.targetScope === "plant-group" ? plant?.commonName : undefined].filter(Boolean).join(" / ");
  const title = row.type === "watering" ? "Watering" : row.type === "fertilizing" ? "Fertilizing" : `Record ${index + 1}`;
  const rowProblems = Object.values(batchRowsErrors(workspace, [{ ...row, included: true }]));
  return <article className={styles.row} aria-label={`Draft ${index + 1}`}>
    <div className={styles.rowHeading}>
      <div className={styles.rowSummary}><h4>{title}</h4><p>{location || "Choose a location"} · {row.date || "Set a date"}</p></div>
      <label><input type="checkbox" checked={row.included} onChange={(event) => patch({ included: event.target.checked })} /> Include record {index + 1}</label>
      <Button variant="text" onClick={remove}>Remove draft</Button>
    </div>
    {row.included && rowProblems.length > 0 && <p className={styles.needsReview}>Needs attention: {rowProblems.join(" ")}</p>}
    <fieldset disabled={!row.included} className={styles.fields}>
      <legend className={styles.legend}>Details for record {index + 1}</legend>
      <FormField id={id("garden")} label="Garden" hint={errors[id("garden")]}>
        <select id={id("garden")} value={row.targetScope === "all-gardens" ? "all-gardens" : row.gardenId} onChange={(event) => patch({ gardenId: event.target.value === "all-gardens" ? "" : event.target.value, targetScope: event.target.value === "all-gardens" ? "all-gardens" : "", growingAreaId: "", plantingRecordId: "" })}>
          <option value="">Choose a garden</option><option value="all-gardens">All gardens (workspace-wide)</option>
          {row.gardenId && !garden && <option value={row.gardenId}>Unavailable garden</option>}
          {workspace.gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FormField>
      <FormField id={id("type")} label="Care type" hint={errors[id("type")]}><select id={id("type")} required value={row.type} onChange={(event) => patch({ type: event.target.value as CareDraftRow["type"] })}><option value="">Choose a care type</option><option value="watering">Watering</option><option value="fertilizing">Fertilizing</option></select></FormField>
      <FormField id={id("date")} label="Date"><input id={id("date")} required type="date" value={row.date} onChange={(event) => patch({ date: event.target.value })} /></FormField>
      <FormField id={id("target")} label="Target">
        <select id={id("target")} required value={target} onChange={(event) => {
          const value = event.target.value;
          patch({ targetScope: value.startsWith("planting-area:") ? "planting-area" : value.startsWith("plant-group:") ? "plant-group" : value as CareDraftRow["targetScope"], growingAreaId: value.startsWith("planting-area:") ? value.slice(14) : "", plantingRecordId: value.startsWith("plant-group:") ? value.slice(12) : "" });
        }}>
          <option value="">Choose a target</option>
          {row.targetScope === "all-gardens" ? <option value="all-gardens">All gardens</option> : garden && <><option value="garden">{garden.name} · Whole garden</option>{garden.growingAreas.map((area) => <option key={`area:${area.id}`} value={`planting-area:${area.id}`}>{garden.name} / {area.name}</option>)}{garden.plantings.map((plant) => <option key={`plant:${plant.id}`} value={`plant-group:${plant.id}`}>{garden.name} / {garden.growingAreas.find((area) => area.id === plant.growingAreaId)?.name ?? "Plants"} / {plant.commonName}</option>)}</>}
        </select>
      </FormField>
      {row.type === "fertilizing" && <details className={styles.fullWidth}>
        <summary>Fertilizer details</summary>
        <div className={styles.fields}>
          <FormField id={id("product")} label="Fertilizer product"><input id={id("product")} value={row.fertilizerProduct} onChange={(event) => patch({ fertilizerProduct: event.target.value })} /></FormField>
          <FormField id={id("amount")} label="Amount (optional)"><input id={id("amount")} inputMode="decimal" value={row.fertilizerAmount} onChange={(event) => patch({ fertilizerAmount: event.target.value })} /></FormField>
          <FormField id={id("unit")} label="Unit"><input id={id("unit")} value={row.fertilizerUnit} onChange={(event) => patch({ fertilizerUnit: event.target.value })} /></FormField>
        </div>
      </details>}
      <FormField id={id("note")} className={styles.fullWidth} label="Record note"><textarea id={id("note")} rows={2} value={row.note} onChange={(event) => patch({ note: event.target.value })} /></FormField>
    </fieldset>
    {row.sourceText && <div><strong>Original text</strong><p className={styles.quote}>{row.sourceText}</p></div>}
    {row.reviewNotes.length > 0 && <details><summary>Extraction review notes</summary><ul>{row.reviewNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
  </article>;
}
