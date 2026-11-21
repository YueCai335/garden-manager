"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { useConfirmation } from "@/components/ConfirmDialog";
import { FeedbackForm, FormField, InlineNotice } from "@/components/forms/FormFeedback";
import { batchFieldId, batchRowsErrors, rowTaskMatches, taskFromSuggestion, type CareDraftRow } from "@/lib/careNoteBatch";
import { calendarLabel, careTitle, careTypeDoneVerb, careTypeName } from "@/lib/careLabels";
import { careDetailsFromForm, careDetailsText } from "@/lib/careRecords";
import { workspaceCareGarden } from "@/lib/careViews";
import { AI_CARE_NOTE_MAX_LENGTH, CARE_NOTE_BATCH_LIMIT, type CareNoteBatchDraftResponse } from "@/lib/gardenWorkspaceApi";
import { careDetailFields, careEventTypes, plantDisplayName, todayDate, type CareDetailField, type Garden, type GardenWorkspace } from "@/lib/gardenWorkspace";
import { noteGroups, noteSegments, type NoteGroup } from "@/lib/noteFragments";
import type { TaskRef } from "@/lib/noteTaskMatch";
import { gardenPath } from "@/lib/workspaceRoutes";
import { NoteFan } from "./NoteFan";
import styles from "./NoteFlow.module.css";

/**
 * AI Garden Note (ADR-0085): one layout through five screens. A short green strip holds the
 * heading and the note; on Reading, Review, and Saved, lime branches split the note into one card
 * per garden. The footer is a green band with a white primary button on every screen.
 */

type Screen = "write" | "reading" | "review" | "saved" | "failed" | "too-much" | "nothing";
type Notice = CareNoteBatchDraftResponse["notices"][number];
type Batch = ReturnType<typeof useWorkspace>["careNoteBatch"];

const SPLIT_MESSAGE = `This note has too many events. Split it into notes with at most ${CARE_NOTE_BATCH_LIMIT} completed care records.`;
const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;
const shortDate = (date: string) => calendarLabel(date, { month: "short", day: "numeric" });

const DETAIL_ID: Record<CareDetailField, string> = {
  fertilizerProduct: "product", fertilizerAmount: "amount", fertilizerUnit: "unit",
  plantName: "plant", plantCount: "count", pruneDetail: "prune", pestProblem: "problem", pestTreatment: "treatment",
};
const DETAIL_LABEL: Record<CareDetailField, string> = {
  fertilizerProduct: "Fertilizer product", fertilizerAmount: "Amount (optional)", fertilizerUnit: "Unit",
  plantName: "Plant (optional)", plantCount: "How many plants (optional)", pruneDetail: "What was cut (optional)",
  pestProblem: "Problem (optional)", pestTreatment: "Treatment used (optional)",
};
/** Which field a problem belongs to, and the short label its chip shows. */
const PROBLEM_CHIPS: [string, string][] = [["type", "Choose a type"], ["date", "Set a date"], ["garden", "Choose a garden"], ["target", "Choose a target"]];

function taskGarden(workspace: GardenWorkspace, ref: Pick<TaskRef, "owner">): Garden | undefined {
  return ref.owner.ownerScope === "workspace" ? workspaceCareGarden(workspace) : workspace.gardens.find((garden) => ref.owner.ownerScope === "garden" && garden.id === ref.owner.gardenId);
}
const taskTitle = (workspace: GardenWorkspace, ref: TaskRef) => { const garden = taskGarden(workspace, ref); return garden ? careTitle(ref.task, garden) : ref.task.note || "Care task"; };

/** Open tasks due today or earlier, for the Write screen's "Due today" row. */
function dueTasks(workspace: GardenWorkspace, today: string): TaskRef[] {
  const refs: TaskRef[] = [
    ...workspace.careTasks.map((task) => ({ key: `all-gardens:${task.id}`, owner: { ownerScope: "workspace" as const }, task })),
    ...workspace.gardens.flatMap((garden) => garden.careTasks.map((task) => ({ key: `${garden.id}:${task.id}`, owner: { ownerScope: "garden" as const, gardenId: garden.id }, task }))),
  ];
  return refs.filter((ref) => ref.task.dueDate <= today).sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
}

/** The words a row's title shows: its target, the plant for a planting, then the details. */
function rowTitle(workspace: GardenWorkspace, row: CareDraftRow) {
  const garden = workspace.gardens.find((item) => item.id === row.gardenId);
  const plant = garden?.plantings.find((item) => item.id === row.plantingRecordId);
  const target = row.targetScope === "all-gardens" ? "All gardens" : row.targetScope === "garden" ? "Whole garden"
    : row.targetScope === "planting-area" ? garden?.growingAreas.find((item) => item.id === row.growingAreaId)?.name
      : row.targetScope === "plant-group" && plant ? plantDisplayName({ plantType: plant.plantType, variety: plant.variety, fallback: plant.commonName }) : undefined;
  const parsed = row.type ? careDetailsFromForm(row.type, row) : undefined;
  const details = row.type && parsed && "details" in parsed ? careDetailsText({ type: row.type, ...parsed.details }) : "";
  return { target, extra: [row.type === "planting" ? row.plantName.trim() : "", details].filter(Boolean).join(" · ") };
}

/** "Basil isn't on the Front Yard plan yet": a planting whose plant has no plant group in that garden. */
function notOnPlan(workspace: GardenWorkspace, row: CareDraftRow) {
  if (row.type !== "planting" || !row.plantName.trim() || row.targetScope === "all-gardens") return undefined;
  const garden = workspace.gardens.find((item) => item.id === row.gardenId);
  if (!garden) return undefined;
  const name = row.plantName.trim().toLocaleLowerCase();
  const known = garden.plantings.some((plant) => [plant.commonName, plant.plantType].some((value) => value?.toLocaleLowerCase() === name));
  return known ? undefined : garden;
}

export function BatchGardenNote({ onClose, header, status }: { onClose?: () => void; header?: ReactNode; status?: ReactNode }) {
  const sync = useWorkspace();
  const { careNoteBatch: batch, workspace } = sync;
  const { confirmation, requestConfirmation } = useConfirmation();
  // The public demo drafts against the showcase gardens on OpenAI (ADR-0086).
  const isPublicDemo = useRuntimeConfig().config?.portfolioDemo === true;
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ draftIds: string[]; group?: string }>();
  const root = useRef<HTMLDivElement>(null);
  const stageFocus = useRef<HTMLElement | null>(null);

  const receipt = batch.receipt;
  // Read only after the guard below, where a workspace is known to exist.
  const latest = (sync.getLatestWorkspace() ?? workspace) as GardenWorkspace;
  const screen: Screen = receipt && (receipt.status === "applied" || receipt.status === "saved") ? "saved"
    : batch.loading ? "reading"
      : editing ? "write"
        : batch.rows.length ? "review"
          : batch.error ? (batch.error === SPLIT_MESSAGE ? "too-much" : "failed")
            : batch.sourceNote && batch.notices.length ? "nothing" : "write";

  const previous = useRef(screen);
  useEffect(() => {
    if (onClose && previous.current !== screen) stageFocus.current?.focus();
    previous.current = screen;
  }, [onClose, screen]);

  // The strip ends halfway down the garden cards, or partway down the note card when there are none.
  const fitStrip = useCallback(() => {
    const node = root.current;
    if (!node) return;
    const top = node.getBoundingClientRect().top;
    const card = node.querySelector<HTMLElement>("[data-fan-card]");
    const note = node.querySelector<HTMLElement>("[data-note-card]");
    const height = card ? card.getBoundingClientRect().top - top + card.offsetHeight / 2
      : note ? note.getBoundingClientRect().top - top + Math.min(note.offsetHeight * 0.4, 96) : 200;
    node.style.setProperty("--strip-height", `${Math.round(height)}px`);
    // The footer is sticky, so a field focused by Tab must scroll clear of it (see .flow scroll-margin).
    const foot = node.querySelector<HTMLElement>("[data-note-foot]");
    if (foot) node.style.setProperty("--foot-height", `${foot.offsetHeight}px`);
  }, []);
  useLayoutEffect(() => {
    fitStrip();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fitStrip);
    if (root.current) observer?.observe(root.current);
    return () => observer?.disconnect();
  }, [fitStrip, screen]);

  // A dialog passes its own heading; the /notes page shows this one. A dialog without one keeps its usual header.
  const head = header ?? (onClose ? null : <header className={styles.pageHead}><h2 id="batch-note-heading" tabIndex={-1}>AI Garden Note</h2></header>);
  const rootClass = `${styles.flow} ${onClose ? "" : styles.page}`;
  if (!workspace) return <div ref={root} className={rootClass}><div className={styles.strip} aria-hidden="true" />{head}
    <div className={styles.headText}><h3 className={styles.headline}>Start with a garden</h3></div>
    <div className={styles.body}><Link className={styles.textLink} href="/gardens/new">Create a garden to start recording care</Link></div></div>;

  const focusRef = (node: HTMLElement | null) => { stageFocus.current = node; };
  const discard = () => requestConfirmation({ message: "Discard this note and all of its unsaved drafts?", confirmLabel: "Discard note", tone: "danger", fallbackFocusId: "batch-original-note", onConfirm: () => { setEditing(false); batch.recordMore(); } });
  const split = () => {
    const run = () => { setEditing(false); void batch.generate(true); };
    if (batch.rows.length || batch.notices.length) requestConfirmation({ message: "Replace the current review drafts with a new extraction? Your original note stays available.", confirmLabel: "Replace drafts", fallbackFocusId: "batch-original-note", onConfirm: run });
    else run();
  };
  const addManual = () => { const index = batch.rows.length; setEditing(false); batch.addRow(); setOpen((old) => new Set(old).add(`new-${index}`)); };
  const toggleRow = (id: string) => setOpen((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  const frame = (top: ReactNode, body: ReactNode, foot: ReactNode, fan?: ReactNode) => <div ref={root} className={rootClass} data-screen={screen}>
    {confirmation}
    <div className={styles.strip} aria-hidden="true" />
    {head}
    {top}
    {fan}
    <div className={styles.body}>{status}{isPublicDemo && batch.requestId ? <p className={styles.requestId}>Request ID: {batch.requestId}</p> : null}{body}</div>
    <div className={styles.foot} data-note-foot="">{foot}</div>
  </div>;
  const headText = (title: string, sub?: ReactNode) => <div className={styles.headText}>
    <h3 className={styles.headline} tabIndex={-1} ref={focusRef}>{title}</h3>
    {sub && <div className={styles.sub}>{sub}</div>}
  </div>;

  // ---------- Write ----------
  if (screen === "write") {
    const noteLength = Array.from(batch.note.trim()).length;
    const tooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;
    const due = dueTasks(latest, todayDate());
    const hasContent = Boolean(batch.note || batch.rows.length || batch.notices.length);
    return frame(
      <>
        {headText("What did you do in the garden?", <span>Several gardens and jobs in one go. You review everything before it&apos;s saved.</span>)}
        <div className={styles.noteWrap}>
          <FeedbackForm id="batch-note-source" className={`${styles.noteCard} ${styles.inputCard}`} data-note-card="" notice="" error={batch.error && batch.error !== SPLIT_MESSAGE ? batch.error : undefined}
            validate={() => ({ "batch-original-note": tooLong ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer.` : undefined })} onSubmit={split}>
            <FormField id="batch-original-note">
              <label className={styles.visuallyHidden} htmlFor="batch-original-note">Care note</label>
              <textarea id="batch-original-note" className={styles.textarea} required rows={6} value={batch.note} onChange={(event) => batch.setText(event.target.value)}
                aria-describedby="batch-note-length" placeholder="Write it your way, e.g. 今天给 Backyard 浇了水，番茄施了鱼乳肥 50ml，剪了辣椒的侧枝。"
                ref={(node) => { if (!onClose || screen === "write") stageFocus.current = node; }} />
            </FormField>
            <div className={styles.inputMeta}>
              {due.length > 0 ? <div className={styles.due}><span className={styles.dueLabel}>Due today</span>
                {due.slice(0, 3).map((ref) => <span key={ref.key} className={styles.dueChip} data-type={ref.task.type} data-late={ref.task.dueDate < todayDate() || undefined}>
                  <i />{taskTitle(latest, ref)}{ref.task.dueDate < todayDate() ? ` · due ${shortDate(ref.task.dueDate)}` : ""}</span>)}
                {due.length > 3 && <span className={styles.dueMore}>+{due.length - 3} more</span>}
              </div> : <span />}
              <span className={tooLong ? styles.lengthError : styles.length} id="batch-note-length">{noteLength} / {AI_CARE_NOTE_MAX_LENGTH}{tooLong && " · Shorten the note"}</span>
              <span className={styles.mic}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>Use your keyboard&apos;s mic to dictate</span>
            </div>
            {isPublicDemo && <p className={styles.publicHint}>Notes work best in English. Splitting sends your note and the demo gardens to OpenAI, so keep it to everyday gardening.</p>}
            {!sync.isSynced && <p className={styles.syncHint}>Your workspace needs to sync before the note can be split. You can still add records manually.</p>}
          </FeedbackForm>
        </div>
      </>,
      null,
      <>
        {hasContent && <button type="button" className={styles.footText} onClick={discard}>Discard note</button>}
        {editing ? <button type="button" className={styles.footText} onClick={() => setEditing(false)}>Back to review</button>
          : <button type="button" className={styles.footText} onClick={addManual} disabled={batch.rows.length >= CARE_NOTE_BATCH_LIMIT}>Add a record manually</button>}
        <span className={styles.spacer} />
        <button type="submit" form="batch-note-source" className={styles.white} disabled={!sync.isSynced || !noteLength || tooLong}>
          {batch.rows.length ? "Split again" : "Split into records"}
        </button>
      </>,
    );
  }

  // ---------- Reading ----------
  if (screen === "reading") {
    return frame(
      <>
        {headText("Reading your note", <span>Splitting it into records for each garden and matching today&apos;s tasks.</span>)}
        <div className={styles.noteWrap}>
          <div className={`${styles.noteCard} ${styles.reading}`} data-note-card="">
            <div className={styles.noteHead}><span>Your note</span><span role="status">Usually a few seconds</span></div>
            <p className={styles.noteText}>{batch.note}</p>
          </div>
        </div>
      </>,
      null,
      <>
        <button type="button" className={styles.footText} onClick={batch.cancel}>Cancel</button>
        <span className={styles.spacer} />
        <button type="button" className={styles.white} disabled aria-busy="true">Splitting…</button>
      </>,
      <NoteFan mode="flow" highlighted={new Set()} onLayout={fitStrip}
        items={workspace.gardens.slice(0, 4).map((garden) => ({ key: garden.id, node: <div className={styles.fanCard} data-fan-card="" data-reading=""><span className={styles.fanName}>{garden.name}</span><span className={styles.fanSub}>Reading…</span></div> }))} />,
    );
  }

  // ---------- Saved ----------
  if (screen === "saved" && receipt) {
    const saved = receipt.status === "saved";
    const groups = noteGroups(latest, receipt.rows);
    const remaining = batch.rows.length;
    return frame(
      <>
        {headText(saved ? `Saved ${count(receipt.rows.length, "record")}` : `Added ${count(receipt.rows.length, "record")} to this workspace`,
          <>
            {receipt.tasksCompleted > 0 && <b>Ticked off {count(receipt.tasksCompleted, "task")}</b>}
            {receipt.tasksAdded > 0 && <span>Added {count(receipt.tasksAdded, "task")}</span>}
            <span role="status">{saved ? "Your reviewed records are saved." : "Waiting for workspace sync. You can close this window while saving continues."}</span>
          </>)}
        <div className={styles.noteWrap}>
          <div className={styles.noteCard} data-note-card="">
            <div className={styles.noteHead}><span>Your note</span></div>
            <p className={`${styles.noteText} ${styles.muted}`}>{receipt.sourceNote || receipt.note}</p>
          </div>
        </div>
      </>,
      (receipt.completedTasks.length > 0 || receipt.addedTasks.length > 0) && <section className={styles.result} aria-label="Care tasks">
        <h4>Care tasks</h4>
        <ul>
          {receipt.completedTasks.map((ref) => <li key={ref.key}><span className={styles.tick} aria-hidden="true">✓</span><s>{taskTitle(latest, ref)}</s><span className={styles.when}>was due {shortDate(ref.task.dueDate)}</span></li>)}
          {receipt.addedTasks.map((ref) => <li key={ref.key}><span className={styles.plus} aria-hidden="true">+</span>{taskTitle(latest, ref)}<span className={styles.when}>new · due {shortDate(ref.task.dueDate)}</span></li>)}
        </ul>
      </section>,
      saved ? <>
        <Link className={styles.footText} href="/care?view=history">View in Care history</Link>
        <span className={styles.spacer} />
        <button type="button" className={styles.ghost} onClick={() => batch.recordMore(Boolean(remaining))}>{remaining ? `Review remaining drafts (${remaining})` : "Write another note"}</button>
        {onClose && <button type="button" className={styles.white} onClick={() => { batch.recordMore(Boolean(remaining)); onClose(); }}>Done</button>}
      </> : <span className={styles.footHint}>Saving…</span>,
      groups.length > 0 && <NoteFan mode="grow" highlighted={new Set()} onLayout={fitStrip}
        items={groups.map((group) => ({ key: group.key, node: <div className={styles.fanCard} data-fan-card="" data-done="">
          <span className={styles.fanTop}><span className={styles.fanName}>{group.name}</span><span className={styles.fanDone}>{group.rows.length} saved</span></span>
          <TypeDots rows={group.rows} />
        </div> }))} />,
    );
  }

  // ---------- Problems before any draft ----------
  if (screen === "failed" || screen === "too-much") {
    const failed = screen === "failed";
    return frame(
      <>
        {headText(failed ? "Couldn't read your note" : "That's a lot for one note", <span>Nothing was saved. Your note is still here.</span>)}
        <div className={styles.noteWrap}>
          <div className={styles.noteCard} data-note-card="">
            <div className={styles.problem} data-tone={failed ? "error" : "warning"}>
              <span className={styles.mark} aria-hidden="true">!</span>
              <b>{failed ? "The note could not be split" : `More than ${CARE_NOTE_BATCH_LIMIT} jobs in one note`}</b>
              <p>{failed ? batch.error : "Split it into two notes and send each part. Shorter notes also come back faster."}</p>
            </div>
            <div className={styles.noteHead}><span>Your note</span><button type="button" className={styles.inlineButton} onClick={() => setEditing(true)}>Edit</button></div>
            <p className={styles.noteText}>{batch.note}</p>
          </div>
        </div>
      </>,
      null,
      <>
        <button type="button" className={styles.footText} onClick={addManual}>Add a record manually</button>
        <span className={styles.spacer} />
        {failed ? <button type="button" className={styles.white} onClick={() => void batch.generate(true)} disabled={!sync.isSynced}>Try again</button>
          : <button type="button" className={styles.white} onClick={() => setEditing(true)}>Edit note</button>}
      </>,
    );
  }

  // ---------- Nothing finished ----------
  if (screen === "nothing") {
    return frame(
      <>
        {headText("No finished jobs found", <span>Notes become records only for work you&apos;ve already done.</span>)}
        <div className={styles.noteWrap}>
          <div className={styles.noteCard} data-note-card="">
            <div className={styles.problem} data-tone="info">
              <span className={styles.mark} aria-hidden="true">i</span>
              <b>Nothing here is done yet</b>
              <p>No completed care records were extracted. Add a planned job as a task, revise the note, or add a record manually.</p>
            </div>
            <Notices batch={batch} workspace={latest} />
          </div>
        </div>
      </>,
      null,
      <>
        <button type="button" className={styles.footText} onClick={addManual}>Add a record manually</button>
        <span className={styles.spacer} />
        <button type="button" className={styles.ghost} onClick={() => setEditing(true)}>Edit note</button>
        {batch.taskDrafts.length > 0 ? <button type="button" className={styles.white} onClick={batch.apply}>Add {count(batch.taskDrafts.length, "task")}</button>
          : onClose && <button type="button" className={styles.white} onClick={onClose}>Done</button>}
      </>,
    );
  }

  // ---------- Review ----------
  const matches = rowTaskMatches(latest, batch.rows);
  const groups = noteGroups(latest, batch.rows);
  const selected = batch.rows.filter((row) => row.included);
  const gardenCount = new Set(selected.filter((row) => row.targetScope !== "all-gardens" && row.gardenId).map((row) => row.gardenId)).size;
  const ticking = selected.reduce((sum, row) => sum + (matches.get(row.draftId) ?? []).filter((ref) => !row.skippedTaskKeys?.includes(ref.key)).length, 0);
  const needing = selected.filter((row) => Object.keys(batchRowsErrors(latest, [{ ...row, included: true }])).length).length;
  const segments = noteSegments(batch.sourceNote || batch.note, batch.rows, batch.notices);
  const lit = new Set(focus?.draftIds ?? []);
  const litGroups = new Set([...(focus?.group ? [focus.group] : []), ...groups.filter((group) => group.rows.some((row) => lit.has(row.draftId))).map((group) => group.key)]);
  const dim = Boolean(focus);
  const clear = () => setFocus(undefined);
  const title = selected.length ? `${count(selected.length, "record")}${gardenCount ? ` across ${count(gardenCount, "garden")}` : ""}` : "No records selected";

  return frame(
    <>
      {headText(title, <>
        {ticking > 0 && <b>Completes {count(ticking, "task")}</b>}
        {needing > 0 && <span className={styles.needs}>{needing} {needing === 1 ? "needs" : "need"} your input</span>}
      </>)}
      <div className={styles.noteWrap}>
        <div className={styles.noteCard} data-note-card="" data-dim={dim || undefined}>
          <div className={styles.noteHead}><span>Your note</span><button type="button" className={styles.inlineButton} onClick={() => setEditing(true)}>Edit and redo</button></div>
          <p className={styles.noteText}>{segments.map((segment, index) => segment.kind ? <span key={index} className={styles.frag} data-kind={segment.kind}
            data-on={segment.draftIds.some((id) => lit.has(id)) || undefined} data-type={batch.rows.find((row) => row.draftId === segment.draftIds[0])?.type || undefined}
            onMouseEnter={segment.draftIds.length ? () => setFocus({ draftIds: segment.draftIds }) : undefined} onMouseLeave={clear}>{segment.text}</span>
            : <span key={index}>{segment.text}</span>)}</p>
        </div>
      </div>
    </>,
    <>
      {batch.stale && <InlineNotice tone="warning">Your note changed after these drafts were made. Choose Edit and redo, then Split again to replace them.</InlineNotice>}
      {receipt?.status === "discarded" && <InlineNotice>Not saved yet. Your gardens changed after this batch was added, so it was taken back out. Check these drafts before saving again.</InlineNotice>}
      <FeedbackForm id="batch-note-review" className={styles.review} notice="" error={batch.error || batch.errors.batch} validate={() => batchRowsErrors(latest, batch.rows)} onSubmit={batch.apply}>
        {groups.map((group) => <GardenCard key={group.key} group={group} rows={batch.rows} workspace={latest} matches={matches} errors={batch.errors} open={open} lit={litGroups.has(group.key)}
          onToggle={toggleRow} onFocusRow={(id) => setFocus({ draftIds: [id] })} onBlur={clear}
          patch={batch.patchRow} remove={(row, index) => requestConfirmation({ message: `Remove draft ${index + 1}? The original note stays available.`, confirmLabel: "Remove draft", fallbackFocusId: "batch-note-review", onConfirm: () => batch.removeRow(row.draftId) })} />)}
      </FeedbackForm>
      {batch.notices.length > 0 && <section className={styles.skipped} aria-label="Not recorded">
        <h4>Not recorded</h4>
        <Notices batch={batch} workspace={latest} />
      </section>}
      {batch.rows.length >= CARE_NOTE_BATCH_LIMIT && <p className={styles.limit}>Up to {CARE_NOTE_BATCH_LIMIT} records per note.</p>}
    </>,
    <>
      <button type="button" className={styles.footText} disabled={batch.loading} onClick={discard}>Discard note</button>
      <span className={styles.spacer} />
      <button type="button" className={styles.ghost} disabled={batch.rows.length >= CARE_NOTE_BATCH_LIMIT} onClick={() => { const before = batch.rows.length; batch.addRow(); setOpen((old) => new Set(old).add(`new-${before}`)); }}>Add record</button>
      <button type="submit" form="batch-note-review" className={styles.white} disabled={(!selected.length && !batch.taskDrafts.length) || batch.loading}>
        {selected.length ? `Save ${count(selected.length, "record")}` : `Add ${count(batch.taskDrafts.length, "task")}`}
      </button>
    </>,
    <NoteFan mode="grow" highlighted={litGroups} onLayout={fitStrip}
      items={groups.map((group) => ({ key: group.key, node: <button type="button" className={styles.fanCard} data-fan-card="" data-on={litGroups.has(group.key) || undefined}
        onMouseEnter={() => setFocus({ draftIds: group.rows.map((row) => row.draftId), group: group.key })} onMouseLeave={clear}
        onFocus={() => setFocus({ draftIds: group.rows.map((row) => row.draftId), group: group.key })} onBlur={clear}
        onClick={() => root.current?.querySelector(`[data-group="${group.key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>
        <span className={styles.fanTop}><span className={styles.fanName}>{group.name}</span><span className={styles.fanCount}>{group.rows.length}</span></span>
        <TypeDots rows={group.rows} />
        {group.rows.some((row) => row.included && Object.keys(batchRowsErrors(latest, [{ ...row, included: true }])).length) && <span className={styles.fanFlag}>Needs input</span>}
      </button> }))} />,
  );
}

function TypeDots({ rows }: { rows: CareDraftRow[] }) {
  return <span className={styles.dots}>{rows.map((row) => <span key={row.draftId} className={styles.dot} data-type={row.type || undefined}>
    <i />{row.type ? careTypeName[row.type] : "Type?"}</span>)}</span>;
}

function Notices({ batch, workspace }: { batch: Batch; workspace: GardenWorkspace }) {
  return <ul className={styles.notices}>{batch.notices.map((notice: Notice, index: number) => {
    const suggested = notice.task ? taskFromSuggestion(workspace, { taskId: "check", sourceText: notice.sourceText, suggestion: notice.task }) : undefined;
    const chosen = batch.taskDrafts.some((item) => item.noticeIndex === index);
    return <li key={index}>
      <div><q>{notice.sourceText}</q><small>{notice.message}</small></div>
      {suggested && <button type="button" className={styles.pill} aria-pressed={chosen} onClick={() => batch.toggleTask(index)}>
        {chosen ? "Task will be added · Undo" : `Add as a task for ${shortDate(suggested.task.dueDate)}`}</button>}
      {notice.reason === "question" && <Link className={styles.pill} href="/doctor">Ask Plant Doctor →</Link>}
      {notice.task && !suggested && <small>Add it in Care to set a reminder; the note did not say enough for a task.</small>}
    </li>;
  })}</ul>;
}

function GardenCard({ group, rows, workspace, matches, errors, open, lit, onToggle, onFocusRow, onBlur, patch, remove }: {
  group: NoteGroup; rows: CareDraftRow[]; workspace: GardenWorkspace; matches: Map<string, TaskRef[]>; errors: Record<string, string>;
  open: Set<string>; lit: boolean; onToggle: (id: string) => void; onFocusRow: (id: string) => void; onBlur: () => void;
  patch: (id: string, patch: Partial<CareDraftRow>) => void; remove: (row: CareDraftRow, index: number) => void;
}) {
  return <section className={styles.garden} data-group={group.key} data-on={lit || undefined} aria-label={group.name}>
    <header className={styles.gardenHead}>
      <span className={styles.gardenName}><span className={styles.gardenMark} aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c-4.2-2.2-6.5-5.6-6.5-9.6C5.5 7.2 8.2 4.3 12 3c3.8 1.3 6.5 4.2 6.5 8.4 0 4-2.3 7.4-6.5 9.6z" /><path d="M12 21V9" /></svg></span>{group.name}</span>
      <span className={styles.gardenCount}>{count(group.rows.length, "record")}</span>
    </header>
    {group.rows.map((row) => {
      const index = rows.indexOf(row);
      return <DraftRow key={row.draftId} row={row} index={index} workspace={workspace} tasks={matches.get(row.draftId) ?? []} errors={errors}
        expanded={open.has(row.draftId) || open.has(`new-${index}`) || Object.keys(errors).some((key) => key.startsWith(`batch-${row.draftId}-`))}
        onToggle={() => onToggle(row.draftId)} onFocus={() => onFocusRow(row.draftId)} onBlur={onBlur}
        patch={(change) => patch(row.draftId, change)} remove={() => remove(row, index)} />;
    })}
  </section>;
}

function DraftRow({ row, index, workspace, tasks, errors, expanded, onToggle, onFocus, onBlur, patch, remove }: {
  row: CareDraftRow; index: number; workspace: GardenWorkspace; tasks: TaskRef[]; errors: Record<string, string>; expanded: boolean;
  onToggle: () => void; onFocus: () => void; onBlur: () => void; patch: (patch: Partial<CareDraftRow>) => void; remove: () => void;
}) {
  const id = (field: string) => batchFieldId(row, field);
  const editId = id("editor");
  const garden = workspace.gardens.find((item) => item.id === row.gardenId);
  const target = row.targetScope === "planting-area" ? `planting-area:${row.growingAreaId}` : row.targetScope === "plant-group" ? `plant-group:${row.plantingRecordId}` : row.targetScope;
  const problems = Object.keys(batchRowsErrors(workspace, [{ ...row, included: true }])).map((key) => key.slice(`batch-${row.draftId}-`.length));
  const { target: where, extra } = rowTitle(workspace, row);
  const skipped = row.skippedTaskKeys ?? [];
  const away = notOnPlan(workspace, row);
  const label = row.type ? careTypeDoneVerb[row.type] : `Record ${index + 1}`;
  const openField = (field: string) => { if (!expanded) onToggle(); setTimeout(() => document.getElementById(id(field))?.focus()); };
  return <article className={styles.row} aria-label={`Draft ${index + 1}`} data-excluded={!row.included || undefined} onMouseEnter={onFocus} onMouseLeave={onBlur}>
    <input type="checkbox" className={styles.include} checked={row.included} aria-label={`Include record ${index + 1}`} onChange={(event) => patch({ included: event.target.checked })} />
    <span className={styles.type} data-type={row.type || undefined}><i aria-hidden="true" />{label}</span>
    {/* A real disclosure, so a save can open a collapsed row and focus its invalid field (FeedbackForm). */}
    <details className={styles.disclosure} open={expanded} onToggle={(event) => { if (event.currentTarget.open !== expanded) onToggle(); }}>
      <summary className={styles.rowMain} onFocus={onFocus} onBlur={onBlur}>
        <span className={styles.rowTitle}>{where ?? <span className={styles.placeholder}>No target yet</span>}{extra && <small> · {extra}</small>}</span>
        <span className={styles.rowDate}>{row.date ? (row.date === todayDate() ? "Today" : shortDate(row.date)) : ""}</span>
      </summary>
      <fieldset id={editId} className={styles.editor} disabled={!row.included}>
      <legend className={styles.visuallyHidden}>Details for record {index + 1}</legend>
      <FormField id={id("garden")} label="Garden" hint={errors[id("garden")]}>
        <select id={id("garden")} value={row.targetScope === "all-gardens" ? "all-gardens" : row.gardenId} onChange={(event) => patch({ gardenId: event.target.value === "all-gardens" ? "" : event.target.value, targetScope: event.target.value === "all-gardens" ? "all-gardens" : "", growingAreaId: "", plantingRecordId: "" })}>
          <option value="">Choose a garden</option><option value="all-gardens">All gardens (workspace-wide)</option>
          {row.gardenId && !garden && <option value={row.gardenId}>Unavailable garden</option>}
          {workspace.gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FormField>
      <FormField id={id("type")} label="Care type" hint={errors[id("type")]}>
        <select id={id("type")} required value={row.type} onChange={(event) => patch({ type: event.target.value as CareDraftRow["type"] })}>
          <option value="">Choose a care type</option>{careEventTypes.map((type) => <option key={type} value={type}>{careTypeName[type]}</option>)}
        </select>
      </FormField>
      <FormField id={id("date")} label="Date" hint={errors[id("date")]}><input id={id("date")} required type="date" value={row.date} onChange={(event) => patch({ date: event.target.value })} /></FormField>
      <FormField id={id("target")} label="Target" hint={errors[id("target")]}>
        <select id={id("target")} required value={target} onChange={(event) => {
          const value = event.target.value;
          patch({ targetScope: value.startsWith("planting-area:") ? "planting-area" : value.startsWith("plant-group:") ? "plant-group" : value as CareDraftRow["targetScope"], growingAreaId: value.startsWith("planting-area:") ? value.slice(14) : "", plantingRecordId: value.startsWith("plant-group:") ? value.slice(12) : "" });
        }}>
          <option value="">Choose a target</option>
          {row.targetScope === "all-gardens" ? <option value="all-gardens">All gardens</option> : garden && <><option value="garden">{garden.name} · Whole garden</option>{garden.growingAreas.map((area) => <option key={`area:${area.id}`} value={`planting-area:${area.id}`}>{garden.name} / {area.name}</option>)}{garden.plantings.map((plant) => <option key={`plant:${plant.id}`} value={`plant-group:${plant.id}`}>{garden.name} / {garden.growingAreas.find((area) => area.id === plant.growingAreaId)?.name ?? "Plants"} / {plant.commonName}</option>)}</>}
        </select>
      </FormField>
      {row.type && careDetailFields[row.type].map((field) => <FormField key={field} id={id(DETAIL_ID[field])} label={DETAIL_LABEL[field]} hint={errors[id(DETAIL_ID[field])]}>
        <input id={id(DETAIL_ID[field])} inputMode={field === "fertilizerAmount" ? "decimal" : field === "plantCount" ? "numeric" : undefined} value={row[field]} onChange={(event) => patch({ [field]: event.target.value })} />
      </FormField>)}
      <FormField id={id("note")} className={`field ${styles.wide}`} label="Record note" hint={errors[id("note")]}><textarea id={id("note")} rows={2} value={row.note} onChange={(event) => patch({ note: event.target.value })} /></FormField>
      {row.sourceText && <p className={styles.wide}><span className={styles.label}>Original text</span> <q>{row.sourceText}</q></p>}
      {row.reviewNotes.length > 0 && <ul className={`${styles.wide} ${styles.reviewNotes}`}>{row.reviewNotes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}</ul>}
      <div className={styles.wide}><button type="button" className={styles.remove} onClick={remove}>Remove draft</button></div>
      </fieldset>
    </details>
    {(row.included && (problems.length > 0 || tasks.length > 0 || away)) && <div className={styles.rowExtras}>
      {PROBLEM_CHIPS.filter(([field]) => problems.includes(field)).map(([field, text]) => <button type="button" key={field} className={styles.missing} onClick={() => openField(field)}>{text}</button>)}
      {problems.some((field) => !PROBLEM_CHIPS.some(([known]) => known === field)) && <button type="button" className={styles.missing} onClick={onToggle}>Check the details</button>}
      {tasks.map((ref) => <label key={ref.key} className={styles.task}><input type="checkbox" checked={!skipped.includes(ref.key)}
        onChange={(event) => patch({ skippedTaskKeys: event.target.checked ? skipped.filter((key) => key !== ref.key) : [...skipped, ref.key] })} />
        {` Completes “${taskTitle(workspace, ref)}” · due ${shortDate(ref.task.dueDate)}`}</label>)}
      {away && <p className={styles.hint}>{row.plantName.trim()} isn&apos;t on the {away.name} plan yet · <Link href={gardenPath(away.id)}>Add on plan →</Link></p>}
    </div>}
  </article>;
}
