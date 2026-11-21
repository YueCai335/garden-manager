"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { useGardenNoteDraft, targetValue } from "@/hooks/useGardenNoteDraft";

import { isCalendarDate } from "@/lib/careRecords";

import { WorkspaceNoteEntry } from "@/components/workspace/WorkspaceNoteEntry";
import { createSampleGardenWorkspace, type CareEventTargetScope, type CareEventType, type Garden } from "@/lib/gardenWorkspace";
import { AI_CARE_NOTE_MAX_LENGTH, type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview } from "@/components/PortfolioFeaturePreview";
import { batchNoteAvailable } from "@/lib/publicNoteBatch";
import { BatchGardenNote } from "@/components/notes/BatchGardenNote";
import { useConfirmation } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import dialogStyles from "@/components/notes/GardenNoteDialog.module.css";

export { isCareNoteLiveEntryBuild } from "@/hooks/useGardenNoteDraft";

export function AiGardenNote({
  gardens,
  initialGardenId,
  isServerBacked,
  onSave,
  workspaceId,
  onClose,
}: {
  gardens: Garden[];
  initialGardenId: string;
  isServerBacked: boolean;
  onSave: (gardenId: string, draft: AiCareNoteDraft) => boolean | void;
  workspaceId?: string;
  onClose?: () => void;
}) {
  const { runtimeConfig, runtimeConfigFailed, retryRuntimeConfig, isPortfolioDemo, isPublicDemo, gardenId, garden, gardenChoices, canGenerate, noteLength, isNoteTooLong, note, setNote, draft, setDraft, saveError, setSaveError, error, setError, notice, isManual, setIsManual, proposedTarget, setProposedTarget, requestId, isLoading, setGardenId, discardDraft, createDraft } = useGardenNoteDraft(gardens, initialGardenId, workspaceId, isServerBacked);
  const { confirmation, requestConfirmation } = useConfirmation();

  const startManualRecord = () => {
    discardDraft();
    setError("");
    setIsManual(true);
    setDraft(manualDraft(note.trim()));
  };

  const selectTarget = (value: string) => {
    if (!draft || !garden) return;
    // Any target change is the gardener's own choice, made while seeing current names.
    setProposedTarget("");
    if (!value) {
      setDraft({ ...draft, targetScope: null, growingAreaId: null, growingAreaName: null, plantingRecordId: null, plantingRecordName: null });
      return;
    }
    const [targetScope, targetId] = value.split(":");
    const area = garden.growingAreas.find((candidate) => candidate.id === targetId);
    const planting = garden.plantings.find((candidate) => candidate.id === targetId);
    setDraft({
      ...draft,
      targetScope: targetScope as CareEventTargetScope,
      growingAreaId: area?.id ?? null,
      growingAreaName: area?.name ?? null,
      plantingRecordId: planting?.id ?? null,
      plantingRecordName: planting ? plantGroupName(planting.commonName, planting.growingAreaId, garden) : null,
    });
  };

  // Until the server's settings are known, the screen cannot tell the local app
  // from the public demo, so it never offers generation without them.
  if (runtimeConfigFailed) {
    return (
      <section className="operations-content season-planner" aria-labelledby="ai-garden-note-heading">
        <p className="section-eyebrow">AI Garden Note</p>
        <WorkspaceNoteEntry gardens={gardens} /><h2 id="ai-garden-note-heading">AI Garden Note settings could not load</h2>
        <p className="workspace-message" role="alert">The garden server did not answer. Try again in a moment.</p>
        <p className="section-context">Care records can still be added by hand from Care records.</p>
        <div className="form-actions">
          <button className="secondary-button" onClick={retryRuntimeConfig} type="button">Try again</button>
        </div>
      </section>
    );
  }
  if (!runtimeConfig) return <PortfolioFeatureLoading feature="care-note" />;
  if (batchNoteAvailable(runtimeConfig)) return <BatchGardenNote onClose={onClose} />;
  if (isPortfolioDemo && !isPublicDemo) return <><WorkspaceNoteEntry /><PortfolioFeaturePreview feature="care-note" /></>;

  if (!isServerBacked || !workspaceId) {
    return (
      <section className="operations-content season-planner" aria-labelledby="ai-garden-note-heading">
        <p className="section-eyebrow">AI Garden Note</p>
        <WorkspaceNoteEntry gardens={gardens} /><h2 id="ai-garden-note-heading">Your workspace needs to sync before generating a draft</h2>
        <p className="section-context">Check the save status and retry syncing. Your note stays here.</p>
      </section>
    );
  }

  return (
    <section className="operations-content season-planner" aria-labelledby={onClose ? "garden-note-title" : "ai-garden-note-heading"}>
      {confirmation}
      <div className="section-header">
        <div>
          {!onClose && <h2 id="ai-garden-note-heading">AI Garden Note</h2>}
          <p className="section-context">Write one completed watering or fertilizing action in Chinese or English, then review every field before saving.</p>
          {isPublicDemo ? (
            <p className="field-hint">
              Demo drafts use the example Demo Garden. Your note and the example garden&apos;s names are sent to OpenAI to
              create the draft, so use a generic gardening example. The demo has a small, shared number of AI drafts.
            </p>
          ) : null}
        </div>
      </div>
      <FeedbackForm id="single-note-source" className="care-form" onSubmit={() => {
        const generate = () => { void createDraft(); };
        if (onClose && draft) requestConfirmation({ message: "Replace the current review draft? Your original note stays available.", confirmLabel: "Replace draft", onConfirm: generate });
        else generate();
      }} error={error} validate={() => ({
        "ai-note-garden": !garden ? "Choose an existing garden." : undefined,
        "ai-garden-note": isNoteTooLong ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer.` : undefined,
      })}>
        <FormField id="ai-note-garden" className="field">
          <label htmlFor="ai-note-garden">Garden</label>
          <select
            id="ai-note-garden" required disabled={Boolean(onClose && draft)}
            onChange={(event) => {
              setGardenId(event.target.value);
              discardDraft();
            }}
            value={gardenId}
          >
            <option value="">Choose a garden for this record</option>
            {gardenChoices.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
          {!canGenerate ? <p className="field-hint">{isPublicDemo ? "AI drafts in the demo work on Demo Garden only, and it is no longer in this workspace." : "Choose the garden where this care took place before creating a draft."}</p> : null}
        </FormField>
        <FormField id="ai-garden-note" className="field care-note-field">
          <label htmlFor="ai-garden-note">Care note</label>
          <textarea
            id="ai-garden-note"
            aria-invalid={isNoteTooLong}
            aria-describedby="ai-note-length"
            onChange={(event) => {
              setNote(event.target.value);
              discardDraft();
            }}
            placeholder="Watered the tomatoes in the back garden bed today."
            required
            readOnly={Boolean(onClose && draft)}
            rows={4}
            value={note}
          />
          <p className="field-hint" id="ai-note-length">
            {isNoteTooLong
              ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer (${noteLength} now).`
              : `${noteLength} / ${AI_CARE_NOTE_MAX_LENGTH} characters`}
          </p>
        </FormField>
        {!onClose && <div className="form-actions">
          <button className="primary-button" disabled={isLoading || isNoteTooLong || !canGenerate} type="submit">
            {isLoading ? "Creating draft..." : "Create draft"}
          </button>
        </div>}
      </FeedbackForm>
      {notice ? <p className="workspace-message" role="status">{notice}</p> : null}
      {isPublicDemo && requestId ? <p className="field-hint">Request ID: {requestId}</p> : null}
      {!onClose && (error || notice) && !draft ? (
        <div className="form-actions">
          <button className="secondary-button" onClick={startManualRecord} type="button">Fill in the record manually</button>
        </div>
      ) : null}
      {draft && garden ? (
        <FeedbackForm
          id="single-note-review"
          className="care-form"
          error={saveError}
          notice="Unsaved changes"
          validate={() => ({
            "ai-care-type": !draft.type ? "Choose a care type." : undefined,
            "ai-care-date": !draft.date || !isCalendarDate(draft.date) ? "Enter a valid care date." : undefined,
            "ai-care-target": !draft.targetScope ? "Choose a target before saving." : draft.targetScope === "planting-area" && !garden.growingAreas.some((area) => area.id === draft.growingAreaId) ? "Choose an existing planting area." : draft.targetScope === "plant-group" && !garden.plantings.some((plant) => plant.id === draft.plantingRecordId) ? "Choose an existing plant group." : undefined,
            "ai-fertilizer-amount": draft.type === "fertilizing" && draft.fertilizerAmount !== null && (!Number.isFinite(draft.fertilizerAmount) || draft.fertilizerAmount <= 0) ? "Enter a fertilizer amount greater than zero." : undefined,
          })}
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.type || !draft.date) return setError("Choose a care type and date before saving.");
            if (!draft.targetScope) return setError("Choose a target before saving.");
            if (isPublicDemo && targetValue(draft) === proposedTarget && !matchesDemoSnapshot(draft, garden)) {
              selectTarget("");
              return setSaveError("The example garden has changed since this draft was made. Choose the target again or fill in the record manually.");
            }
            setSaveError("");
            if (onSave(gardenId, draft)) { setDraft(undefined); setNote(""); }
            else setSaveError("This record could not be added. Check its garden and target, then try again.");
          }}
        >
          <h3>{isManual ? "Manual care record" : "AI extracted draft"}</h3>
          <p className="section-context">
            {isManual ? "Fill in each field before saving." : "Review or adjust the extracted fields before saving."}
          </p>
          {draft.reviewNotes.length ? (
            <ul className="rotation-note-list">{draft.reviewNotes.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : null}
          <FormField id="ai-care-type" className="field">
            <label htmlFor="ai-care-type">Care type</label>
            <select
              id="ai-care-type" required
              onChange={(event) => setDraft({ ...draft, type: event.target.value as CareEventType })}
              value={draft.type ?? ""}
            >
              <option value="">Choose type</option>
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </FormField>
          <FormField id="ai-care-date" className="field">
            <label htmlFor="ai-care-date">Date</label>
            <input id="ai-care-date" required onChange={(event) => setDraft({ ...draft, date: event.target.value })} type="date" value={draft.date ?? ""} />
          </FormField>
          <FormField id="ai-care-target" className="field">
            <label htmlFor="ai-care-target">Target</label>
            <select
              id="ai-care-target" required
              onChange={(event) => selectTarget(event.target.value)}
              value={targetValue(draft)}
            >
              <option value="">Choose target</option>
              {isPublicDemo ? null : <option value="all-gardens">All gardens</option>}
              <option value="garden">{garden.name}</option>
              <optgroup label="Planting areas">
                {garden.growingAreas.map((area) => <option key={area.id} value={`planting-area:${area.id}`}>{area.name}</option>)}
              </optgroup>
              <optgroup label="Plant groups">
                {garden.plantings.map((planting) => <option key={planting.id} value={`plant-group:${planting.id}`}>{plantGroupName(planting.commonName, planting.growingAreaId, garden)}</option>)}
              </optgroup>
            </select>
          </FormField>
          {draft.type === "fertilizing" ? (
            <>
              <div className="field">
                <label htmlFor="ai-fertilizer-product">Fertilizer product (optional)</label>
                <input id="ai-fertilizer-product" onChange={(event) => setDraft({ ...draft, fertilizerProduct: event.target.value || null })} value={draft.fertilizerProduct ?? ""} />
              </div>
              <FormField id="ai-fertilizer-amount" className="field">
                <label htmlFor="ai-fertilizer-amount">Fertilizer amount (optional)</label>
                <input id="ai-fertilizer-amount" min="0" onChange={(event) => setDraft({ ...draft, fertilizerAmount: event.target.value ? Number(event.target.value) : null })} step="any" type="number" value={draft.fertilizerAmount ?? ""} />
              </FormField>
              <div className="field">
                <label htmlFor="ai-fertilizer-unit">Fertilizer unit (optional)</label>
                <input id="ai-fertilizer-unit" onChange={(event) => setDraft({ ...draft, fertilizerUnit: event.target.value || null })} value={draft.fertilizerUnit ?? ""} />
              </div>
            </>
          ) : null}
          <div className="field care-note-field">
            <label htmlFor="ai-review-note">Original note</label>
            <textarea id="ai-review-note" onChange={(event) => setDraft({ ...draft, note: event.target.value })} rows={3} value={draft.note} />
          </div>
          {!onClose && <div className="form-actions">
            <button className="primary-button" type="submit">Save to Care History</button>
            <button className="secondary-button" onClick={discardDraft} type="button">Start over</button>
          </div>}
        </FeedbackForm>
      ) : null}
      {onClose && <div className={dialogStyles.footer}>
        {(note || draft) && <Button variant="text" disabled={isLoading} onClick={() => requestConfirmation({
          message: "Discard this note and its unsaved draft?", confirmLabel: "Discard note", tone: "danger",
          fallbackFocusId: "garden-note-title", onConfirm: () => { discardDraft(); setNote(""); setError(""); },
        })}>Discard note</Button>}
        {draft ? <>
          <Button type="submit" form="single-note-source" loading={isLoading} loadingLabel="Creating draft…" disabled={isNoteTooLong || !canGenerate}>Generate again</Button>
          <Button variant="primary" type="submit" form="single-note-review" disabled={isLoading}>Save to Care History</Button>
        </> : <>
          <Button disabled={!canGenerate || isLoading} onClick={startManualRecord}>Fill in the record manually</Button>
          <Button variant="primary" type="submit" form="single-note-source" loading={isLoading} loadingLabel="Creating draft…" disabled={isNoteTooLong || !canGenerate}>Create draft</Button>
        </>}
      </div>}
    </section>
  );
}

/**
 * Whether a server-proposed target still means the same item in the visitor's
 * garden: same ID, name, and planting area as the demo snapshot the server used.
 */
function matchesDemoSnapshot(draft: AiCareNoteDraft, garden: Garden) {
  // The public AI path still runs on the sample garden until the AI redo (ADR-0077).
  const [snapshot] = createSampleGardenWorkspace().gardens;
  if (garden.id !== "demo-garden") return false;
  if (draft.targetScope === "garden") return true;
  if (draft.targetScope === "planting-area") {
    const expected = snapshot.growingAreas.find((area) => area.id === draft.growingAreaId);
    const actual = garden.growingAreas.find((area) => area.id === draft.growingAreaId);
    return Boolean(expected && actual && actual.name === expected.name);
  }
  if (draft.targetScope === "plant-group") {
    const expected = snapshot.plantings.find((planting) => planting.id === draft.plantingRecordId);
    const actual = garden.plantings.find((planting) => planting.id === draft.plantingRecordId);
    return Boolean(
      expected && actual && actual.commonName === expected.commonName && actual.growingAreaId === expected.growingAreaId,
    );
  }
  return false;
}

function manualDraft(note: string): AiCareNoteDraft {
  // A manual record is a completed event whose fields the gardener fills in.
  return {
    kind: "completed",
    type: null,
    date: null,
    note,
    targetScope: null,
    growingAreaId: null,
    growingAreaName: null,
    plantingRecordId: null,
    plantingRecordName: null,
    fertilizerProduct: null,
    fertilizerAmount: null,
    fertilizerUnit: null,
    reviewNotes: [],
  };
}

function plantGroupName(commonName: string, growingAreaId: string, garden: Garden) {
  const area = garden.growingAreas.find((candidate) => candidate.id === growingAreaId);
  return `${commonName} · ${area?.name ?? "Planting area"}`;
}
