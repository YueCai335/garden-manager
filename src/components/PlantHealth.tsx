"use client";

import { FormEvent, useState } from "react";

import type { Garden, HealthAssessment, HealthRecord, HealthRecordTargetScope, HealthSeverity } from "@/lib/gardenWorkspace";
import { apiUrl, createPlantHealthAssessment, uploadPlantHealthPhoto } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview, usePortfolioDemoMode } from "@/components/PortfolioFeaturePreview";

type HealthForm = {
  observedOn: string;
  symptoms: string;
  severity: HealthSeverity;
  targetScope: HealthRecordTargetScope;
  targetId: string;
};

export function PlantHealth({
  gardens,
  initialGardenId,
  isServerBacked,
  onSave,
  workspaceId,
}: {
  gardens: Garden[];
  initialGardenId: string;
  isServerBacked: boolean;
  onSave: (gardenId: string, record: HealthRecord) => void;
  workspaceId?: string;
}) {
  const isPortfolioDemo = usePortfolioDemoMode();
  const [gardenId, setGardenId] = useState(initialGardenId);
  const [form, setForm] = useState<HealthForm>(emptyHealthForm());
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<HealthAssessment>();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const garden = gardens.find((candidate) => candidate.id === gardenId);

  const createAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !garden || !form.symptoms.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      setAssessment(await createPlantHealthAssessment(workspaceId, gardenId, {
        symptoms: form.symptoms.trim(),
        severity: form.severity,
        photoCount: photoPaths.length,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The AI service could not create a plant-health assessment.");
    } finally {
      setIsLoading(false);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!workspaceId || !files || !garden) return;
    const nextPhotos = [...files].slice(0, 3 - photoPaths.length);
    if (!nextPhotos.length) return;
    setError("");
    setIsLoading(true);
    try {
      const paths = await Promise.all(nextPhotos.map((photo) => uploadPlantHealthPhoto(workspaceId, gardenId, photo)));
      setPhotoPaths((current) => [...current, ...paths]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The garden server could not upload this photo.");
    } finally {
      setIsLoading(false);
    }
  };

  const save = () => {
    if (!garden || !assessment || !form.symptoms.trim()) return;
    const target = healthTarget(form, garden);
    onSave(gardenId, {
      id: `health-${crypto.randomUUID()}`,
      observedOn: form.observedOn,
      symptoms: form.symptoms.trim(),
      severity: form.severity,
      photoPaths,
      assessment,
      ...target,
    });
    setForm(emptyHealthForm());
    setPhotoPaths([]);
    setAssessment(undefined);
  };

  if (isPortfolioDemo === undefined && (!isServerBacked || !workspaceId)) return <PortfolioFeatureLoading feature="plant-health" />;
  if (isPortfolioDemo) return <PortfolioFeaturePreview feature="plant-health" />;

  if (!isServerBacked || !workspaceId) {
    return (
      <section className="operations-content season-planner" aria-labelledby="plant-health-heading">
        <p className="section-eyebrow">Plant health</p>
        <h2 id="plant-health-heading">Import gardens to PostgreSQL first</h2>
        <p className="section-context">Plant Health stores photos and records through the local API.</p>
      </section>
    );
  }

  if (!garden) return null;

  return (
    <section className="operations-content season-planner" aria-labelledby="plant-health-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Plant health</p>
          <h2 id="plant-health-heading">Record a plant health concern</h2>
          <p className="section-context">Save photos and observations, then review a cautious AI assessment before adding it to history.</p>
        </div>
      </div>
      <form className="care-form" onSubmit={createAssessment}>
        <HealthFields
          form={form}
          garden={garden}
          gardens={gardens}
          isLoading={isLoading}
          onChange={setForm}
          onGardenChange={(nextGardenId) => {
            setGardenId(nextGardenId);
            setForm(emptyHealthForm());
            setPhotoPaths([]);
            setAssessment(undefined);
          }}
        />
        <div className="field">
          <label htmlFor="health-photos">Photos (optional, up to 3)</label>
          <input accept="image/jpeg,image/png,image/webp" disabled={isLoading || photoPaths.length === 3} id="health-photos" multiple onChange={(event) => void addPhotos(event.target.files)} type="file" />
          <p className="field-hint">Photos are stored as evidence. The current local text model uses your written observations.</p>
        </div>
        {photoPaths.length ? <PhotoStrip photoPaths={photoPaths} onRemove={(path) => setPhotoPaths((current) => current.filter((item) => item !== path))} /> : null}
        <div className="form-actions">
          <button className="primary-button" disabled={isLoading} type="submit">{isLoading ? "Creating assessment..." : "Create AI assessment"}</button>
        </div>
      </form>
      {error ? <p className="workspace-message" role="alert">{error}</p> : null}
      {assessment ? (
        <section className="care-form" aria-labelledby="health-assessment-heading">
          <h3 id="health-assessment-heading">Review assessment</h3>
          <p className="section-context">The assessment is a starting point for observation. It does not confirm a diagnosis or prescribe treatment.</p>
          <AssessmentEditor assessment={assessment} onChange={setAssessment} />
          <div className="form-actions">
            <button className="primary-button" onClick={save} type="button">Save health record</button>
            <button className="secondary-button" onClick={() => setAssessment(undefined)} type="button">Start over</button>
          </div>
        </section>
      ) : null}
      {garden.healthRecords.length ? <HealthHistory records={garden.healthRecords} /> : null}
    </section>
  );
}

function HealthFields({ form, garden, gardens, isLoading, onChange, onGardenChange }: {
  form: HealthForm;
  garden: Garden;
  gardens: Garden[];
  isLoading: boolean;
  onChange: (form: HealthForm) => void;
  onGardenChange: (gardenId: string) => void;
}) {
  const targetValue = form.targetScope === "garden" ? "garden" : `${form.targetScope}:${form.targetId}`;
  return (
    <>
      <div className="field">
        <label htmlFor="health-garden">Garden</label>
        <select disabled={isLoading} id="health-garden" onChange={(event) => onGardenChange(event.target.value)} value={garden.id}>
          {gardens.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="health-observed-on">Observed on</label>
        <input id="health-observed-on" onChange={(event) => onChange({ ...form, observedOn: event.target.value })} required type="date" value={form.observedOn} />
      </div>
      <div className="field">
        <label htmlFor="health-target">Target</label>
        <select id="health-target" onChange={(event) => {
          const [targetScope, targetId = ""] = event.target.value.split(":");
          onChange({ ...form, targetScope: targetScope as HealthRecordTargetScope, targetId });
        }} value={targetValue}>
          <option value="garden">{garden.name}</option>
          <optgroup label="Planting areas">{garden.growingAreas.map((area) => <option key={area.id} value={`planting-area:${area.id}`}>{area.name}</option>)}</optgroup>
          <optgroup label="Plant groups">{garden.plantings.map((planting) => <option key={planting.id} value={`plant-group:${planting.id}`}>{plantGroupName(planting.commonName, planting.growingAreaId, garden)}</option>)}</optgroup>
        </select>
      </div>
      <div className="field">
        <label htmlFor="health-severity">Concern level</label>
        <select id="health-severity" onChange={(event) => onChange({ ...form, severity: event.target.value as HealthSeverity })} value={form.severity}>
          <option value="low">Monitor</option>
          <option value="medium">Needs attention</option>
          <option value="high">Urgent observation</option>
        </select>
      </div>
      <div className="field care-note-field">
        <label htmlFor="health-symptoms">What do you observe?</label>
        <textarea id="health-symptoms" onChange={(event) => onChange({ ...form, symptoms: event.target.value })} placeholder="Yellowing leaves, white powder on the lower leaves, and slower growth." required rows={5} value={form.symptoms} />
      </div>
    </>
  );
}

function AssessmentEditor({ assessment, onChange }: { assessment: HealthAssessment; onChange: (assessment: HealthAssessment) => void }) {
  return (
    <>
      <div className="field"><label htmlFor="health-summary">Summary</label><textarea id="health-summary" onChange={(event) => onChange({ ...assessment, summary: event.target.value })} rows={3} value={assessment.summary} /></div>
      <AssessmentLines id="health-issues" label="Possible issues" value={assessment.possibleIssues} onChange={(possibleIssues) => onChange({ ...assessment, possibleIssues })} />
      <AssessmentLines id="health-next-steps" label="Low-risk next steps" value={assessment.nextSteps} onChange={(nextSteps) => onChange({ ...assessment, nextSteps })} />
      <AssessmentLines id="health-follow-up" label="Questions to resolve" value={assessment.followUpQuestions} onChange={(followUpQuestions) => onChange({ ...assessment, followUpQuestions })} />
      <div className="field"><label htmlFor="health-confidence">AI confidence</label><select id="health-confidence" onChange={(event) => onChange({ ...assessment, confidence: event.target.value as HealthSeverity })} value={assessment.confidence}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
    </>
  );
}

function AssessmentLines({ id, label, value, onChange }: { id: string; label: string; value: string[]; onChange: (value: string[]) => void }) {
  return <div className="field"><label htmlFor={id}>{label}</label><textarea id={id} onChange={(event) => onChange(event.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} rows={3} value={value.join("\n")} /></div>;
}

function PhotoStrip({ photoPaths, onRemove }: { photoPaths: string[]; onRemove: (path: string) => void }) {
  return (
    <div className="health-photo-strip">
      {photoPaths.map((path) => (
        <figure key={path}>
          {/* Photos come from the local API, not a configured image host. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Plant health evidence" src={apiUrl(path)} />
          <button aria-label="Remove photo" className="danger-text-button" onClick={() => onRemove(path)} type="button">Remove</button>
        </figure>
      ))}
    </div>
  );
}

function HealthHistory({ records }: { records: HealthRecord[] }) {
  return <section className="health-history" aria-labelledby="health-history-heading"><h3 id="health-history-heading">Health history</h3><ul>{[...records].sort((left, right) => right.observedOn.localeCompare(left.observedOn)).map((record) => <li key={record.id}><strong>{record.observedOn} · {record.severity}</strong><span>{record.symptoms}</span>{record.assessment ? <span>{record.assessment.summary}</span> : null}</li>)}</ul></section>;
}

function emptyHealthForm(): HealthForm {
  return { observedOn: new Date().toISOString().slice(0, 10), symptoms: "", severity: "medium", targetScope: "garden", targetId: "" };
}

function healthTarget(form: HealthForm, garden: Garden): Pick<HealthRecord, "targetScope" | "growingAreaId" | "growingAreaName" | "plantingRecordId" | "plantingRecordName"> {
  if (form.targetScope === "garden") return { targetScope: "garden" };
  if (form.targetScope === "planting-area") {
    const area = garden.growingAreas.find((candidate) => candidate.id === form.targetId);
    return { targetScope: "planting-area", growingAreaId: area?.id, growingAreaName: area?.name };
  }
  const planting = garden.plantings.find((candidate) => candidate.id === form.targetId);
  return { targetScope: "plant-group", plantingRecordId: planting?.id, plantingRecordName: planting ? plantGroupName(planting.commonName, planting.growingAreaId, garden) : undefined };
}

function plantGroupName(commonName: string, growingAreaId: string, garden: Garden) {
  const area = garden.growingAreas.find((candidate) => candidate.id === growingAreaId);
  return `${commonName} · ${area?.name ?? "Planting area"}`;
}
