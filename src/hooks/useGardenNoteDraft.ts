"use client";
import { useWorkspaceDraft, useWorkspaceRequestRef } from "@/components/workspace/WorkspaceProvider";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { todayDate, type Garden } from "@/lib/gardenWorkspace";
import { featureErrorMessage, AI_CARE_NOTE_MAX_LENGTH, AiCareNoteRequestError, createAiCareNoteDraft, type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";

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

/** Explicit actions only. Session state and request guards outlive route components. */
export function useGardenNoteDraft(gardens: Garden[], initialGardenId: string, workspaceId?: string, isServerBacked = false) {
  const { config: runtimeConfig, failed: runtimeConfigFailed, retry: retryRuntimeConfig } = useRuntimeConfig();
  const isPortfolioDemo = runtimeConfig?.portfolioDemo;
  // Live drafts in the public demo need the server's settings, this build's
  // entry switch, and the server's availability; otherwise the demo shows a preview.
  const isPublicDemo = Boolean(isPortfolioDemo && runtimeConfig?.careNotePublicAvailable && isCareNoteLiveEntryBuild());
  const [chosenGardenId, setGardenId] = useWorkspaceDraft("note:chosenGardenId", initialGardenId);
  const [note, setNote] = useWorkspaceDraft("note:text", "");
  const [draft, setDraft] = useWorkspaceDraft<AiCareNoteDraft | undefined>("note:draft", undefined);
  const [saveError, setSaveError] = useWorkspaceDraft("note:saveError", "");
  const [error, setError] = useWorkspaceDraft("note:error", "");
  // Why a note produced no draft (planned, negated, ...); set only for those kinds.
  const [notice, setNotice] = useWorkspaceDraft("note:notice", "");
  const [isManual, setIsManual] = useWorkspaceDraft("note:isManual", false);
  // The target the server proposed, so saving can check it against the demo snapshot.
  const [proposedTarget, setProposedTarget] = useWorkspaceDraft("note:proposedTarget", "");
  // Shown in the public demo so a check can be matched to its server log line.
  const [requestId, setRequestId] = useWorkspaceDraft("note:requestId", "");
  const [isLoading, setIsLoading] = useWorkspaceDraft("note:isLoading", false);
  // State updates land after a render, so a fast double click could pass an
  // isLoading check twice. The ref blocks the second request immediately.
  const isRequesting = useWorkspaceRequestRef("note:requesting", false);
  // Bumped whenever the note or garden changes, so a late response for the old input is dropped.
  const requestCounter = useWorkspaceRequestRef("note:sequence", 0);
  // The public demo always drafts for Demo Garden, whichever garden was open before.
  const gardenId = isPublicDemo ? DEMO_GARDEN_ID : chosenGardenId;
  const garden = gardens.find((candidate) => candidate.id === gardenId);
  const gardenChoices = isPublicDemo ? gardens.filter((candidate) => candidate.id === DEMO_GARDEN_ID) : gardens;
  // A visitor who deleted Demo Garden can still record care by hand elsewhere.
  const canGenerate = Boolean(garden);
  // Code points, not UTF-16 units, so the count matches the API's limit.
  const noteLength = Array.from(note.trim()).length;
  const isNoteTooLong = noteLength > AI_CARE_NOTE_MAX_LENGTH;

  const discardDraft = () => {
    requestCounter.current += 1;
    setRequestId("");
    setDraft(undefined);
    setNotice("");
    setIsManual(false);
    setSaveError("");
  };

  const createDraft = async () => {
    if (!runtimeConfig || runtimeConfigFailed || (isPortfolioDemo && !isPublicDemo) || !isServerBacked || !workspaceId || !note.trim() || isNoteTooLong || !canGenerate || isRequesting.current) return;
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
      setError(featureErrorMessage(reason, "AI Garden Note could not connect. Your note is kept. Check your connection and try again, or fill in the record manually."));
    } finally {
      isRequesting.current = false;
      setIsLoading(false);
    }
  };

  return { runtimeConfig, runtimeConfigFailed, retryRuntimeConfig, isPortfolioDemo, isPublicDemo, gardenId, garden, gardenChoices, canGenerate, noteLength, isNoteTooLong, note, setNote, draft, setDraft, saveError, setSaveError, error, setError, notice, isManual, setIsManual, proposedTarget, setProposedTarget, requestId, isLoading, setGardenId, discardDraft, createDraft };
}

export function targetValue(draft: AiCareNoteDraft) {
  if (draft.targetScope === "all-gardens") return "all-gardens";
  if (draft.targetScope === "planting-area" && draft.growingAreaId) return `planting-area:${draft.growingAreaId}`;
  if (draft.targetScope === "plant-group" && draft.plantingRecordId) return `plant-group:${draft.plantingRecordId}`;
  if (draft.targetScope === "garden") return "garden";
  return "";
}

