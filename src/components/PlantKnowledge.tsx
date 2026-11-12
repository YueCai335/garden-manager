"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";

import { FormEvent, useState } from "react";

import type { Garden } from "@/lib/gardenWorkspace";
import { featureErrorMessage, askPlantKnowledge, type PlantKnowledgeAnswer } from "@/lib/gardenWorkspaceApi";
import { PortfolioFeatureLoading, PortfolioFeaturePreview, PortfolioFeatureSettingsError, useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { Button } from "@/components/ui/Button";
import styles from "./plant/PlantTools.module.css";

export function PlantKnowledge({
  gardens,
  initialGardenId,
  onGardenContextChange,
  isServerBacked,
  workspaceId,
}: {
  gardens: Garden[];
  initialGardenId: string;
  onGardenContextChange?: (id: string) => void;
  isServerBacked: boolean;
  workspaceId?: string;
}) {
  const { config, failed, retry } = useRuntimeConfig();
  const isPortfolioDemo = config?.portfolioDemo;
  const [localGardenId, setLocalGardenId] = useState(initialGardenId);
  const gardenId = onGardenContextChange ? initialGardenId : localGardenId;
  const setGardenId = onGardenContextChange ?? setLocalGardenId;
  const [question, setQuestion] = useWorkspaceDraft(`guide:${initialGardenId}:question`, "");
  const [answer, setAnswer] = useWorkspaceDraft<PlantKnowledgeAnswer | undefined>(`guide:${initialGardenId}:answer`, undefined);
  const [error, setError] = useWorkspaceDraft(`guide:${initialGardenId}:error`, "");
  const [isLoading, setIsLoading] = useWorkspaceDraft(`guide:${initialGardenId}:isLoading`, false);

  useUnsavedDraft(`guide:${initialGardenId}`, Boolean(question && !answer));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspaceId || !question.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      setAnswer(await askPlantKnowledge(workspaceId, { question: question.trim(), gardenId: gardens.some((item) => item.id === gardenId) ? gardenId : undefined }));
    } catch (reason) {
      setError(featureErrorMessage(reason, "Plant Guide could not connect. Your question is kept. Check your connection and try again."));
    } finally {
      setIsLoading(false);
    }
  };

  if (failed) return <PortfolioFeatureSettingsError featureName="Plant Guide" onRetry={retry} />;
  if (isPortfolioDemo === undefined) return <PortfolioFeatureLoading feature="plant-knowledge" />;
  if (isPortfolioDemo) return <PortfolioFeaturePreview feature="plant-knowledge" />;

  if (!isServerBacked || !workspaceId) {
    return (
      <section className={styles.workspace} aria-labelledby="plant-knowledge-heading">
        <div className={styles.panel}>
          <h2 id="plant-knowledge-heading">Sync your workspace</h2>
          <p>Your workspace needs to sync before Plant Guide is available. Check the save status and retry syncing.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.workspace} aria-label="Plant questions and answers">
      {gardenId && !gardens.some((item) => item.id === gardenId) && <p role="alert">Garden not found in this workspace. Choose another context.</p>}
      <FeedbackForm aria-label="Ask Plant Guide" className={`care-form ${styles.panel}`} onSubmit={submit} error={error} notice="" validate={() => ({ "knowledge-garden": gardenId && !gardens.some((garden) => garden.id === gardenId) ? "Choose an existing garden or no garden context." : undefined })}>
        <FormField id="knowledge-garden" className="field">
          <label htmlFor="knowledge-garden">Garden context (optional)</label>
          <select disabled={isLoading} id="knowledge-garden" onChange={(event) => setGardenId(event.target.value)} value={gardenId}>
            <option value="">No garden context</option>
            {gardens.map((garden) => <option key={garden.id} value={garden.id}>{garden.name}</option>)}
          </select>
        </FormField>
        <FormField id="knowledge-question" className="field care-note-field">
          <label htmlFor="knowledge-question">Question</label>
          <textarea id="knowledge-question" onChange={(event) => setQuestion(event.target.value)} placeholder="My tomato leaves have a white coating. What should I observe first?" required rows={5} value={question} />
        </FormField>
        <div className={styles.actions}>
          <Button variant="primary" loading={isLoading} loadingLabel="Searching sources…" type="submit">Ask Plant Guide</Button>
        </div>
      </FeedbackForm>
      {answer ? <KnowledgeAnswer answer={answer} /> : null}
    </section>
  );
}

function KnowledgeAnswer({ answer }: { answer: PlantKnowledgeAnswer }) {
  return (
    <section className={`knowledge-answer ${styles.panel} ${styles.answer}`} aria-labelledby="knowledge-answer-heading">
      <h2 id="knowledge-answer-heading">Answer</h2>
      <p>{answer.answer}</p>
      <p className="field-hint">Confidence: {answer.confidence}</p>
      {answer.followUpQuestions.length ? <><h3>Follow-up questions</h3><ul>{answer.followUpQuestions.map((question) => <li key={question}>{question}</li>)}</ul></> : null}
      <h3>Sources</h3>
      {answer.citations.length ? <ul className="knowledge-citations">{answer.citations.map((citation) => <li key={citation.sourceKey}><a href={citation.sourceUrl} rel="noreferrer" target="_blank">{citation.title}</a><span>{citation.publisher} · reviewed {citation.reviewedOn}</span><p>{citation.excerpt}</p></li>)}</ul> : <p className="field-hint">Add more plant and symptom details to search the current library.</p>}
    </section>
  );
}
