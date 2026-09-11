"use client";

import { FormEvent, useState } from "react";

import type { CareEventTargetScope, CareEventType, Garden } from "@/lib/gardenWorkspace";
import { createAiCareNoteDraft, type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
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
  const [isLoading, setIsLoading] = useState(false);
  const garden = gardens.find((candidate) => candidate.id === gardenId);

  const createDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !note.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      setDraft(await createAiCareNoteDraft(workspaceId, gardenId, note.trim()));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The AI service could not create a care draft.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectTarget = (value: string) => {
    if (!draft || !garden) return;
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
          <select id="ai-note-garden" onChange={(event) => setGardenId(event.target.value)} value={gardenId}>
            {gardens.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </div>
        <div className="field care-note-field">
          <label htmlFor="ai-garden-note">Care note</label>
          <textarea
            id="ai-garden-note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Watered the tomatoes in the back garden bed today."
            required
            rows={4}
            value={note}
          />
        </div>
        <div className="form-actions">
          <button className="primary-button" disabled={isLoading} type="submit">
            {isLoading ? "Creating draft..." : "Create draft"}
          </button>
        </div>
      </form>
      {error ? <p className="workspace-message" role="alert">{error}</p> : null}
      {draft && garden ? (
        <form
          className="care-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.type || !draft.date) return setError("Choose a care type and date before saving.");
            setError("");
            onSave(gardenId, draft);
          }}
        >
          <h3>AI extracted draft</h3>
          <p className="section-context">Review or adjust the extracted fields before saving.</p>
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
            <button className="secondary-button" onClick={() => setDraft(undefined)} type="button">Start over</button>
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
  return "garden";
}

function plantGroupName(commonName: string, growingAreaId: string, garden: Garden) {
  const area = garden.growingAreas.find((candidate) => candidate.id === growingAreaId);
  return `${commonName} · ${area?.name ?? "Planting area"}`;
}
