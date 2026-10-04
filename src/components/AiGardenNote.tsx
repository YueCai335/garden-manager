"use client";

import { FormEvent, useRef, useState } from "react";

import { todayDate, type CareEventTargetScope, type CareEventType, type Garden } from "@/lib/gardenWorkspace";
import { AI_CARE_NOTE_MAX_LENGTH, createAiCareNoteDraft, type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview, usePortfolioDemoMode } from "@/components/PortfolioFeaturePreview";

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
  const isPortfolioDemo = usePortfolioDemoMode();
  const [gardenId, setGardenId] = useState(initialGardenId);
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState<AiCareNoteDraft>();
  const [error, setError] = useState("");
  // Why a note produced no draft (planned, negated, ...); set only for those kinds.
  const [notice, setNotice] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // State updates land after a render, so a fast double click could pass an
  // isLoading check twice. The ref blocks the second request immediately.
  const isRequesting = useRef(false);
  // Bumped whenever the note or garden changes, so a late response for the old input is dropped.
  const requestId = useRef(0);
  const garden = gardens.find((candidate) => candidate.id === gardenId);
  // Code points, not UTF-16 units, so the count matches the API's limit.
  const noteLength = Array.from(note.trim()).length;
  const isNoteTooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;

  const discardDraft = () => {
    requestId.current += 1;
    setDraft(undefined);
    setNotice("");
    setIsManual(false);
  };

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !note.trim() || isNoteTooLong || isRequesting.current) return;
    isRequesting.current = true;
    discardDraft();
    const currentRequest = requestId.current;
    setError("");
    setIsLoading(true);
    try {
      const result = await createAiCareNoteDraft(workspaceId, gardenId, note.trim(), todayDate());
      if (currentRequest !== requestId.current) return;
      if (result.kind === "completed") setDraft(result);
      else setNotice(result.reviewNotes[0] ?? "This note cannot become a care record.");
    } catch (reason) {
      if (currentRequest !== requestId.current) return;
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

  if (isPortfolioDemo === undefined && (!isServerBacked || !workspaceId)) return <PortfolioFeatureLoading feature="care-note" />;
  if (isPortfolioDemo) return <PortfolioFeaturePreview feature="care-note" />;

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
            {gardens.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
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
          <button className="primary-button" disabled={isLoading || isNoteTooLong} type="submit">
            {isLoading ? "Creating draft..." : "Create draft"}
          </button>
        </div>
      </form>
      {error ? <p className="workspace-message" role="alert">{error}</p> : null}
      {notice ? <p className="workspace-message" role="status">{notice}</p> : null}
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
              <option value="all-gardens">All gardens</option>
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
