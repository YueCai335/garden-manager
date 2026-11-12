"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";

import { FormEvent, useState } from "react";
import { isCalendarDate } from "@/lib/careRecords";

import type { Garden, HealthAssessment, HealthRecord, HealthRecordTargetScope, HealthSeverity } from "@/lib/gardenWorkspace";
import { featureErrorMessage, apiUrl, createPlantHealthAssessment, uploadPlantHealthPhoto } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview, PortfolioFeatureSettingsError, useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { Button, ButtonLink } from "@/components/ui/Button";
import styles from "./plant/PlantTools.module.css";

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
  onGardenContextChange,
  isServerBacked,
  onSave,
  workspaceId,
}: {
  gardens: Garden[];
  initialGardenId: string;
  onGardenContextChange?: (id: string) => void;
  isServerBacked: boolean;
  onSave: (gardenId: string, record: HealthRecord) => void;
  workspaceId?: string;
}) {
  const { config, failed, retry } = useRuntimeConfig();
  const isPortfolioDemo = config?.portfolioDemo;
  const [localGardenId, setLocalGardenId] = useState(initialGardenId);
  const gardenId = onGardenContextChange ? initialGardenId : localGardenId;
  const setGardenId = onGardenContextChange ?? setLocalGardenId;
  const [form, setForm] = useWorkspaceDraft<HealthForm>(`doctor:${initialGardenId}:form`, emptyHealthForm());
  const [photoPaths, setPhotoPaths] = useWorkspaceDraft<string[]>(`doctor:${initialGardenId}:photoPaths`, []);
  const [assessment, setAssessment] = useWorkspaceDraft<HealthAssessment | undefined>(`doctor:${initialGardenId}:assessment`, undefined);
  const [notice, setNotice] = useState("");
  const [error, setError] = useWorkspaceDraft(`doctor:${initialGardenId}:error`, "");
  const [operation, setOperation] = useWorkspaceDraft<"assessment" | "photos" | undefined>(`doctor:${initialGardenId}:operation`, undefined);
  const isLoading = Boolean(operation);
  useUnsavedDraft(`doctor:${initialGardenId}`, Boolean(form.symptoms || photoPaths.length));
  const garden = gardens.find((candidate) => candidate.id === gardenId);

  const createAssessment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !garden || !form.symptoms.trim() || isLoading) return;
    setError("");
    setNotice("");
    setOperation("assessment");
    try {
      setAssessment(await createPlantHealthAssessment(workspaceId, gardenId, {
        symptoms: form.symptoms.trim(),
        severity: form.severity,
        photoCount: photoPaths.length,
      }));
    } catch (reason) {
      setError(featureErrorMessage(reason, "Plant Doctor could not connect. Your observations are kept. Check your connection and try again."));
    } finally {
      setOperation(undefined);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!workspaceId || !files || !garden || isLoading) return;
    const nextPhotos = [...files].slice(0, 3 - photoPaths.length);
    if (!nextPhotos.length) return;
    setError("");
    setNotice("");
    setOperation("photos");
    try {
      const paths = await Promise.all(nextPhotos.map((photo) => uploadPlantHealthPhoto(workspaceId, gardenId, photo)));
      setPhotoPaths((current) => [...current, ...paths]);
    } catch (reason) {
      setError(featureErrorMessage(reason, "The photo could not upload. Your observations are kept. Check your connection and choose the photo again."));
    } finally {
      setOperation(undefined);
    }
  };

  const save = () => {
    if (!garden || !assessment || !form.symptoms.trim() || isLoading) return;
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
    setNotice("Health record added.");
    setForm(emptyHealthForm());
    setPhotoPaths([]);
    setAssessment(undefined);
  };

  if (failed) return <PortfolioFeatureSettingsError featureName="Plant Doctor" onRetry={retry} />;
  if (isPortfolioDemo === undefined) return <PortfolioFeatureLoading feature="plant-health" />;
  if (isPortfolioDemo) return <PortfolioFeaturePreview feature="plant-health" />;

  if (!isServerBacked || !workspaceId) {
    return (
      <section className={styles.workspace} aria-labelledby="plant-health-heading">
        <div className={styles.panel}>
          <h2 id="plant-health-heading">Sync your workspace</h2>
          <p>Your workspace needs to sync before Plant Doctor is available. Check the save status and retry syncing.</p>
        </div>
      </section>
    );
  }

  if (!garden) return <section className={styles.workspace} aria-label="Garden for the observation">
    <div className={`care-form ${styles.panel}`}>
      {initialGardenId && <p role="alert">Garden not found in this workspace.</p>}
      {gardens.length ? <FormField id="doctor-garden-choice" label="Choose a garden for this record">
        <select id="doctor-garden-choice" value="" onChange={(event) => setGardenId(event.target.value)}>
          <option value="">Choose garden</option>
          {gardens.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </FormField> : <>
        <h2>Add a garden to record observations</h2>
        <div><ButtonLink href="/gardens/new" variant="primary">Add garden</ButtonLink></div>
      </>}
    </div>
  </section>;

  return (
    <section className={styles.workspace} aria-label="Plant observations and assessments">
      <FeedbackForm id="health-observations" aria-labelledby="health-observations-heading" className={`care-form ${styles.panel} ${styles.columns}`} error={error} notice={notice || (form.symptoms || assessment ? "Unsaved changes" : "")} validate={() => ({
        "health-observed-on": !isCalendarDate(form.observedOn) ? "Enter a valid observation date." : undefined,
        "health-target": form.targetScope === "planting-area" && !garden.growingAreas.some((area) => area.id === form.targetId) ? "Choose an existing planting area." : form.targetScope === "plant-group" && !garden.plantings.some((plant) => plant.id === form.targetId) ? "Choose an existing plant group." : undefined,
      })} onSubmit={(event) => {
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (submitter?.getAttribute("data-action") === "save") save();
        else void createAssessment(event);
      }}>
        <h2 id="health-observations-heading">Observations</h2>
        <HealthFields
          form={form}
          garden={garden}
          gardens={gardens}
          isLoading={isLoading}
          onChange={setForm}
          onGardenChange={(nextGardenId) => {
            if (onGardenContextChange) { onGardenContextChange(nextGardenId); return; }
            setGardenId(nextGardenId);
            setForm(emptyHealthForm());
            setPhotoPaths([]);
            setAssessment(undefined);
          }}
        />
        <FormField id="health-photos" label="Photos (optional, up to 3)" hint="Photos are saved with the record. The assessment uses your written observations." className="field care-note-field">
          <input accept="image/jpeg,image/png,image/webp" disabled={isLoading || photoPaths.length === 3} id="health-photos" multiple onChange={(event) => void addPhotos(event.target.files)} type="file" />
        </FormField>
        {operation === "photos" && <p role="status">Uploading photos…</p>}
        {photoPaths.length ? <PhotoStrip photoPaths={photoPaths} onRemove={(path) => setPhotoPaths((current) => current.filter((item) => item !== path))} /> : null}
        <div className={styles.actions}>
          <Button variant={assessment ? "secondary" : "primary"} disabled={isLoading} loading={operation === "assessment"} loadingLabel="Creating assessment…" type="submit">Create AI assessment</Button>
        </div>
      </FeedbackForm>
      {assessment ? (
        <section className={`care-form ${styles.panel} ${styles.columns}`} aria-labelledby="health-assessment-heading">
          <h2 id="health-assessment-heading">Review assessment</h2>
          <p className="section-context">The assessment is a starting point for observation. It does not confirm a diagnosis or prescribe treatment.</p>
          <AssessmentEditor assessment={assessment} onChange={setAssessment} />
          <div className={styles.actions}>
            <Button variant="primary" data-action="save" form="health-observations" type="submit" disabled={isLoading}>Save health record</Button>
            <Button onClick={() => setAssessment(undefined)}>Discard assessment</Button>
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
      <FormField id="health-observed-on" className="field">
        <label htmlFor="health-observed-on">Observed on</label>
        <input id="health-observed-on" onChange={(event) => onChange({ ...form, observedOn: event.target.value })} required type="date" value={form.observedOn} />
      </FormField>
      <FormField id="health-target" className="field">
        <label htmlFor="health-target">Target</label>
        <select id="health-target" onChange={(event) => {
          const [targetScope, targetId = ""] = event.target.value.split(":");
          onChange({ ...form, targetScope: targetScope as HealthRecordTargetScope, targetId });
        }} value={targetValue}>
          <option value="garden">{garden.name}</option>
          <optgroup label="Planting areas">{garden.growingAreas.map((area) => <option key={area.id} value={`planting-area:${area.id}`}>{area.name}</option>)}</optgroup>
          <optgroup label="Plant groups">{garden.plantings.map((planting) => <option key={planting.id} value={`plant-group:${planting.id}`}>{plantGroupName(planting.commonName, planting.growingAreaId, garden)}</option>)}</optgroup>
        </select>
      </FormField>
      <div className="field">
        <label htmlFor="health-severity">Concern level</label>
        <select id="health-severity" onChange={(event) => onChange({ ...form, severity: event.target.value as HealthSeverity })} value={form.severity}>
          <option value="low">Monitor</option>
          <option value="medium">Needs attention</option>
          <option value="high">Urgent observation</option>
        </select>
      </div>
      <FormField id="health-symptoms" className="field care-note-field">
        <label htmlFor="health-symptoms">What do you observe?</label>
        <textarea id="health-symptoms" onChange={(event) => onChange({ ...form, symptoms: event.target.value })} placeholder="Yellowing leaves, white powder on the lower leaves, and slower growth." required rows={5} value={form.symptoms} />
      </FormField>
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
