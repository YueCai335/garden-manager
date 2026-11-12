"use client";
import { useRouter } from "next/navigation";
import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useGardenNoteDraft } from "@/hooks/useGardenNoteDraft";
import type { Garden } from "@/lib/gardenWorkspace";
import { AI_CARE_NOTE_MAX_LENGTH } from "@/lib/gardenWorkspaceApi";
import styles from "./WorkspaceHome.module.css";

export function WorkspaceNoteEntry({ gardens = [], workspaceId, isServerBacked = false }: { gardens?: Garden[]; workspaceId?: string; isServerBacked?: boolean }) {
  const router = useRouter();
  const { note, setNote, draft, discardDraft, runtimeConfig, runtimeConfigFailed, retryRuntimeConfig, isPortfolioDemo, isPublicDemo, gardenId, setGardenId, gardenChoices, garden, noteLength, isNoteTooLong, isLoading, createDraft } = useGardenNoteDraft(gardens, "", workspaceId, isServerBacked);
  const preview = isPortfolioDemo && !isPublicDemo;
  const ready = Boolean(runtimeConfig && !runtimeConfigFailed && !preview && isServerBacked && workspaceId && gardens.length);
  const mode = runtimeConfigFailed ? "Connection unavailable. Your note stays here; retry or add care manually."
    : !runtimeConfig ? "Checking AI availability…"
    : preview ? "Demo example only. Live drafting is not enabled in this public demo."
    : !gardens.length ? "Create a garden before generating or saving a care record."
    : !isServerBacked || !workspaceId ? "Connect your workspace before generating a draft. You can still add care manually."
    : isPublicDemo ? "Live demo · Demo Garden only. Your note is sent to OpenAI; use a generic example. Shared limits apply."
    : "Live assistance · Review the draft before saving.";
  return <section aria-label="Start a garden note" className={styles.note}>
    <h2>AI Garden Note</h2>
    <FeedbackForm notice="" onSubmit={() => { if (draft) router.push("/notes"); else if (ready && garden) { void createDraft(); router.push("/notes"); } }} validate={() => ({
      "quick-garden-note": isNoteTooLong ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer.` : undefined,
    })}>
      <FormField id="quick-garden-note" className={styles.noteField}>
        <label htmlFor="quick-garden-note">What did you do in your gardens?</label>
        <textarea id="quick-garden-note" rows={3} required value={note} aria-describedby="quick-note-help quick-note-count" onChange={(event) => { discardDraft(); setNote(event.target.value); }} placeholder="Watered the tomatoes in the back garden today." />
        <span id="quick-note-count" className={styles.count}>{noteLength} / {AI_CARE_NOTE_MAX_LENGTH} characters</span>
      </FormField>
      <p id="quick-note-help" className={styles.hint}>Draft one watering or fertilizing record at a time. Choose a garden for this record; you can switch gardens for your next note.</p>
      {ready && <FormField id="quick-note-garden" className={styles.noteField}>
        <label htmlFor="quick-note-garden">Garden for this record</label>
        <select id="quick-note-garden" required value={garden ? gardenId : ""} onChange={(event) => { discardDraft(); setGardenId(event.target.value); }}>
          <option value="">Choose a garden</option>
          {gardenChoices.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FormField>}
      <div className={styles.actions}>
        {preview ? <ButtonLink variant="primary" href="/notes">View example</ButtonLink> : <Button variant="primary" type="submit" disabled={!ready && !draft} loading={isLoading} loadingLabel="Creating draft…">Review draft</Button>}
        <ButtonLink href={gardens.length ? "/care?view=history" : "/gardens/new"}>Add manually</ButtonLink>
        {runtimeConfigFailed && <Button onClick={retryRuntimeConfig}>Retry connection</Button>}
      </div>
      <p className={styles.mode}>{mode}</p>
    </FeedbackForm>
  </section>;
}
