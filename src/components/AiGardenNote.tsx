"use client";

import { FormEvent, useRef, useState } from "react";

import { createDemoGardenWorkspace, todayDate, type CareEventTargetScope, type CareEventType, type Garden } from "@/lib/gardenWorkspace";
import { AI_CARE_NOTE_MAX_LENGTH, AiCareNoteRequestError, createAiCareNoteDraft, type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview, useRuntimeConfig } from "@/components/PortfolioFeaturePreview";

/** The public demo drafts against the server's fixed copy of this garden (ADR-0059). */
const DEMO_GARDEN_ID = "demo-garden";

/**
 * Whether this frontend build shows live drafts in the public demo (ADR-0059).
 * Next.js inlines the value at build time, so changing it needs a new build and
 * deployment. Only the exact string "true" opens it; the local app ignores it.
 */
export function isCareNoteLiveEntryBuild() {
  return process.env.NEXT_PUBLIC_CARE_NOTE_LIVE_ENTRY === "true";
}

export function AiGardenNote({
  gardens,
  initialGardenId,
  isServerBacked,
  onSave,
  workspaceId,
}: {
  gardens: Garden[];
  initialGardenId: string;
  isServerBacked: boolean;
  onSave: (gardenId: string, draft: AiCareNoteDraft) => void;
  workspaceId?: string;
}) {
  const { config: runtimeConfig, failed: runtimeConfigFailed, retry: retryRuntimeConfig } = useRuntimeConfig();
  const isPortfolioDemo = runtimeConfig?.portfolioDemo;
  // Live drafts in the public demo need the server's settings, this build's
  // entry switch, and the server's availability; otherwise the demo shows a preview.
  const isPublicDemo = Boolean(isPortfolioDemo && runtimeConfig?.careNotePublicAvailable && isCareNoteLiveEntryBuild());
  const [chosenGardenId, setGardenId] = useState(initialGardenId);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<AiCareNoteDraft>();
  const [error, setError] = useState("");
  // Why a note produced no draft (planned, negated, ...); set only for those kinds.
  const [notice, setNotice] = useState("");
  const [isManual, setIsManual] = useState(false);
  // The target the server proposed, so saving can check it against the demo snapshot.
  const [proposedTarget, setProposedTarget] = useState("");
  // Shown in the public demo so a check can be matched to its server log line.
  const [requestId, setRequestId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // State updates land after a render, so a fast double click could pass an
  // isLoading check twice. The ref blocks the second request immediately.
  const isRequesting = useRef(false);
  // Bumped whenever the note or garden changes, so a late response for the old input is dropped.
  const requestCounter = useRef(0);
  // The public demo always drafts for Demo Garden, whichever garden was open before.
  const gardenId = isPublicDemo ? DEMO_GARDEN_ID : chosenGardenId;
  const garden = gardens.find((candidate) => candidate.id === gardenId);
  const gardenChoices = isPublicDemo ? gardens.filter((candidate) => candidate.id === DEMO_GARDEN_ID) : gardens;
  // A visitor who deleted Demo Garden can still record care by hand elsewhere.
  const canGenerate = !isPublicDemo || Boolean(garden);
  // Code points, not UTF-16 units, so the count matches the API's limit.
  const noteLength = Array.from(note.trim()).length;
  const isNoteTooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;

  const discardDraft = () => {
    requestCounter.current += 1;
    setRequestId("");
    setDraft(undefined);
    setNotice("");
    setIsManual(false);
  };

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !note.trim() || isNoteTooLong || !canGenerate || isRequesting.current) return;
    isRequesting.current = true;
    discardDraft();
    const currentRequest = requestCounter.current;
    setError("");
    setIsLoading(true);
    try {
      const result = await createAiCareNoteDraft(workspaceId, gardenId, note.trim(), todayDate());
      if (currentRequest !== requestCounter.current) return;
      setRequestId(result.requestId ?? "");
      if (result.kind === "completed") {
        setDraft(result);
        setProposedTarget(targetValue(result));
      }
      else setNotice(result.reviewNotes[0] ?? "This note cannot become a care record.");
    } catch (reason) {
      if (currentRequest !== requestCounter.current) return;
      setRequestId(reason instanceof AiCareNoteRequestError ? reason.requestId ?? "" : "");
      setError(reason instanceof Error ? reason.message : "The AI service could not create a care draft.");
    } finally {
      isRequesting.current = false;
      setIsLoading(false);
    }
  };

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
        <p className="section-eyebrow">AI garden note</p>
        <h2 id="ai-garden-note-heading">AI Garden Note settings could not load</h2>
        <p className="workspace-message" role="alert">The garden server did not answer. Try again in a moment.</p>
        <p className="section-context">Care records can still be added by hand from Care records.</p>
        <div className="form-actions">
          <button className="secondary-button" onClick={retryRuntimeConfig} type="button">Try again</button>
        </div>
      </section>
    );
  }
  if (!runtimeConfig) return <PortfolioFeatureLoading feature="care-note" />;
  if (isPortfolioDemo && !isPublicDemo) return <PortfolioFeaturePreview feature="care-note" />;

  if (!isServerBacked || !workspaceId) {
    return (
      <section className="operations-content season-planner" aria-labelledby="ai-garden-note-heading">
        <p className="section-eyebrow">AI garden note</p>
        <h2 id="ai-garden-note-heading">Import gardens to PostgreSQL first</h2>
        <p className="section-context">AI Garden Note uses the local API to create a reviewable care draft.</p>
      </section>
    );
  }

  return (
    <section className="operations-content season-planner" aria-labelledby="ai-garden-note-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">AI garden note</p>
          <h2 id="ai-garden-note-heading">Turn a note into care history</h2>
          <p className="section-context">Write one completed watering or fertilizing action in Chinese or English, then review every field before saving.</p>
          {isPublicDemo ? (
            <p className="field-hint">
              Demo drafts use the example Demo Garden. Your note and the example garden&apos;s names are sent to OpenAI to
              create the draft, so use a generic gardening example. The demo has a small, shared number of AI drafts.
            </p>
          ) : null}
        </div>
      </div>
      <form className="care-form" onSubmit={createDraft}>
        <div className="field">
          <label htmlFor="ai-note-garden">Garden</label>
          <select
            id="ai-note-garden"
            onChange={(event) => {
              setGardenId(event.target.value);
              discardDraft();
            }}
            value={gardenId}
          >
            {gardenChoices.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
          {!canGenerate ? <p className="field-hint">AI drafts in the demo work on Demo Garden only, and it is no longer in this workspace.</p> : null}
        </div>
        <div className="field care-note-field">
          <label htmlFor="ai-garden-note">Care note</label>
          <textarea
            id="ai-garden-note"
            onChange={(event) => {
              setNote(event.target.value);
              discardDraft();
            }}
            placeholder="Watered the tomatoes in the back garden bed today."
            required
            rows={4}
            value={note}
          />
          <p className="field-hint">
            {isNoteTooLong
              ? `Shorten the note to ${AI_CARE_NOTE_MAX_LENGTH} characters or fewer (${noteLength} now).`
              : `${noteLength} / ${AI_CARE_NOTE_MAX_LENGTH} characters`}
          </p>
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={isLoading || isNoteTooLong || !canGenerate} type="submit">
            {isLoading ? "Creating draft..." : "Create draft"}
          </button>
        </div>
      </form>
      {error ? <p className="workspace-message" role="alert">{error}</p> : null}
      {notice ? <p className="workspace-message" role="status">{notice}</p> : null}
      {isPublicDemo && requestId ? <p className="field-hint">Request ID: {requestId}</p> : null}
      {(error || notice) && !draft ? (
        <div className="form-actions">
          <button className="secondary-button" onClick={startManualRecord} type="button">Fill in the record manually</button>
        </div>
      ) : null}
      {draft && garden ? (
        <form
          className="care-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.type || !draft.date) return setError("Choose a care type and date before saving.");
            if (!draft.targetScope) return setError("Choose a target before saving.");
            if (isPublicDemo && targetValue(draft) === proposedTarget && !matchesDemoSnapshot(draft, garden)) {
              selectTarget("");
              return setError("The example garden has changed since this draft was made. Choose the target again or fill in the record manually.");
            }
            setError("");
            onSave(gardenId, draft);
          }}
        >
          <h3>{isManual ? "Manual care record" : "AI extracted draft"}</h3>
          <p className="section-context">
            {isManual ? "Fill in each field before saving." : "Review or adjust the extracted fields before saving."}
          </p>
          {draft.reviewNotes.length ? (
            <ul className="rotation-note-list">{draft.reviewNotes.map((item) => <li key={item}>{item}</li>)}</ul>
          ) : null}
          <div className="field">
            <label htmlFor="ai-care-type">Care type</label>
            <select
              id="ai-care-type"
              onChange={(event) => setDraft({ ...draft, type: event.target.value as CareEventType })}
              value={draft.type ?? ""}
            >
              <option value="">Choose type</option>
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ai-care-date">Date</label>
            <input id="ai-care-date" onChange={(event) => setDraft({ ...draft, date: event.target.value })} type="date" value={draft.date ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="ai-care-target">Target</label>
            <select
              id="ai-care-target"
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
          </div>
          {draft.type === "fertilizing" ? (
            <>
              <div className="field">
                <label htmlFor="ai-fertilizer-product">Fertilizer product (optional)</label>
                <input id="ai-fertilizer-product" onChange={(event) => setDraft({ ...draft, fertilizerProduct: event.target.value || null })} value={draft.fertilizerProduct ?? ""} />
              </div>
              <div className="field">
                <label htmlFor="ai-fertilizer-amount">Fertilizer amount (optional)</label>
                <input id="ai-fertilizer-amount" min="0.01" onChange={(event) => setDraft({ ...draft, fertilizerAmount: event.target.value ? Number(event.target.value) : null })} step="any" type="number" value={draft.fertilizerAmount ?? ""} />
              </div>
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
          <div className="form-actions">
            <button className="primary-button" type="submit">Save to Care History</button>
            <button className="secondary-button" onClick={discardDraft} type="button">Start over</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function targetValue(draft: AiCareNoteDraft) {
  if (draft.targetScope === "all-gardens") return "all-gardens";
  if (draft.targetScope === "planting-area" && draft.growingAreaId) return `planting-area:${draft.growingAreaId}`;
  if (draft.targetScope === "plant-group" && draft.plantingRecordId) return `plant-group:${draft.plantingRecordId}`;
  if (draft.targetScope === "garden") return "garden";
  return "";
}

/**
 * Whether a server-proposed target still means the same item in the visitor's
 * garden: same ID, name, and planting area as the demo snapshot the server used.
 */
function matchesDemoSnapshot(draft: AiCareNoteDraft, garden: Garden) {
  const [snapshot] = createDemoGardenWorkspace().gardens;
  if (garden.id !== DEMO_GARDEN_ID) return false;
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
