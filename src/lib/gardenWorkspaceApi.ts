import type { CareDetailField, CareDetails, CareEventTargetScope, CareEventType, GardenWorkspace, GrowingAreaKind, HealthAssessment, HealthSeverity, PlantingCropFamily } from "@/lib/gardenWorkspace";
import type { SeasonAllocationResult } from "@/lib/seasonAllocation";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

export type ServerWorkspace = GardenWorkspace & { workspaceId: string; revision: number };

/** A failed workspace request, keeping the HTTP status so callers can react to 409 conflicts. */
export class ServerWorkspaceError extends Error {
  status: number;
  currentRevision?: number;

  constructor(status: number, message: string, currentRevision?: number) {
    super(message);
    this.name = "ServerWorkspaceError";
    this.status = status;
    this.currentRevision = currentRevision;
  }
}

export type RuntimeConfig = {
  portfolioDemo: boolean;
  /** Whether the server allows live AI Garden Note drafts in the public demo (ADR-0059). */
  careNotePublicAvailable?: boolean;
  /** Missing means unsupported. Public demos must never advertise batches. */
  careNoteBatchAvailable?: boolean;
  /** Whether the server allows AI note batches on the showcase gardens in the public demo (ADR-0086). */
  careNoteBatchPublicAvailable?: boolean;
};

export type CareNoteBatchDraftResponse = {
  drafts: Array<{
    sourceText: string;
    gardenId: string | null;
    type: CareEventType | null;
    date: string | null;
    targetScope: CareEventTargetScope | null;
    growingAreaId: string | null;
    plantingRecordId: string | null;
    reviewNotes: string[];
  } & CareNoteBatchDetails>;
  notices: Array<{
    sourceText: string;
    reason: "planned" | "negated" | "unrelated" | "question" | "ambiguous" | "unsupported";
    message: string;
    /** A planned job's values for "Add as a task" (ADR-0085); null for every other reason. */
    task?: CareNoteBatchTaskSuggestion | null;
  }>;
};
/** The details a batch draft or task suggestion carries; each was found in the note's own words (ADR-0085). */
export type CareNoteBatchDetails = { [Field in CareDetailField]?: CareDetails[Field] | null };
export type CareNoteBatchTaskSuggestion = CareNoteBatchDetails & {
  gardenId: string | null;
  type: CareEventType | null;
  dueDate: string | null;
  targetScope: CareEventTargetScope | null;
  growingAreaId: string | null;
  plantingRecordId: string | null;
};
export const CARE_NOTE_BATCH_LIMIT = 12;

/** The public demo's server adds a request ID (ADR-0086); the local app's never does. */
export async function createAiCareNoteBatch(workspaceId: string, note: string, today: string): Promise<CareNoteBatchDraftResponse & { requestId?: string }> {
  const response = await fetch(apiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/ai/care-note-drafts`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, today }),
  });
  const requestId = response.headers?.get?.(CARE_NOTE_REQUEST_ID_HEADER) ?? undefined;
  if (!response.ok) {
    if (response.status === 422) {
      const body = await response.json().catch(() => ({}));
      const split = `This note has too many events. Split it into notes with at most ${CARE_NOTE_BATCH_LIMIT} completed care records.`;
      throw new AiCareNoteRequestError(body?.detail === split ? split : "Check your note and device date, then try again.", requestId);
    }
    if (response.status === 413) {
      throw new AiCareNoteRequestError(requestId ? "This note is too long for the demo. Shorten it and try again." : "This workspace is too large for one AI note request. Enter the records manually.", requestId);
    }
    throw new AiCareNoteRequestError(await featureResponseMessage(response, "AI Garden Note"), requestId);
  }
  const result = await response.json() as CareNoteBatchDraftResponse;
  return requestId ? { ...result, requestId } : result;
}

export type RotationHistoryPlanting = {
  plantingId: string;
  commonName: string;
  cropFamily: PlantingCropFamily;
  plantingDate: string;
  season: number;
};

export type RotationGuidance = {
  growingAreaId: string;
  growingAreaKind: GrowingAreaKind;
  season: number;
  history: RotationHistoryPlanting[];
  warning: { cropFamily: PlantingCropFamily; plantings: RotationHistoryPlanting[] } | null;
  automatedWarningSupported: boolean;
  hasAutomaticCompatibilityConclusion: boolean;
  rotationFriendlyCropFamilies: PlantingCropFamily[];
};

/** How the model classified the note; only "completed" comes with draft fields (ADR-0058). */
export type AiCareNoteKind = "completed" | "planned" | "negated" | "multiple" | "unrelated";

/** Notes are limited to this many Unicode code points, matching the API. */
export const AI_CARE_NOTE_MAX_LENGTH = 500;

export type AiCareNoteDraft = {
  kind: AiCareNoteKind;
  type: CareEventType | null;
  date: string | null;
  note: string;
  /** Null until the gardener chooses a target. */
  targetScope: CareEventTargetScope | null;
  growingAreaId: string | null;
  growingAreaName: string | null;
  plantingRecordId: string | null;
  plantingRecordName: string | null;
  fertilizerProduct: string | null;
  fertilizerAmount: number | null;
  fertilizerUnit: string | null;
  reviewNotes: string[];
  /** The public demo's request ID, read from a response header; absent in the local app. */
  requestId?: string;
};

/** A failed draft request, with the public demo's request ID when the server sent one. */
/** Only application-authored messages may be shown in an AI form. */
export class FeatureRequestError extends Error {}

export function featureErrorMessage(error: unknown, fallback: string) {
  return error instanceof FeatureRequestError ? error.message : fallback;
}

export class AiCareNoteRequestError extends FeatureRequestError {
  constructor(message: string, readonly requestId?: string) {
    super(message);
  }
}

type AiFeature = "AI Garden Note" | "Plant Doctor" | "Plant Guide" | "Allocation Assistant" | "Photo upload";

// Exact known demo limits remain useful to visitors. Arbitrary server/provider
// details (including validation objects and configuration) never enter the UI.
const careNoteLimitMessages = new Set([
  "Too many drafts from this connection. Wait a minute and try again.",
  "Today's AI drafts for the demo are used up. Try again tomorrow, or fill in the record manually.",
  "The demo's AI drafts are used up. You can still fill in the record manually.",
  "AI Garden Note is not available in the demo right now. You can still fill in the record manually.",
]);

async function featureResponseMessage(response: Response, feature: AiFeature) {
  if (feature === "AI Garden Note" && [429, 503].includes(response.status)) {
    const body = await response.json().catch(() => ({}));
    if (typeof body?.detail === "string" && careNoteLimitMessages.has(body.detail)) return body.detail as string;
  }
  if (response.status === 429) return `${feature} is busy or has reached its usage limit. Wait a while before trying again.`;
  if (response.status === 403) return `${feature} is unavailable in this demo. You can continue using the other garden tools.`;
  if (response.status === 404) return "This workspace or garden is unavailable. Check your selected garden and try again.";
  if (feature === "Photo upload" && response.status === 413) return "Each photo must be 10 MB or smaller. Choose a smaller photo.";
  if (feature === "Photo upload" && response.status === 415) return "Choose a JPEG, PNG, or WebP photo.";
  if (response.status === 413) return "This request is too long. Shorten your text and try again.";
  if (response.status === 422) return "Check the fields in this form, then try again.";
  return feature === "AI Garden Note"
    ? "AI Garden Note is unavailable right now. Try again later, or fill in the record manually."
    : `${feature} could not complete this request. Your input is kept. Try again later.`;
}

const CARE_NOTE_REQUEST_ID_HEADER = "X-Care-Note-Request";

export type PlantKnowledgeAnswer = {
  answer: string;
  confidence: "low" | "medium" | "high";
  followUpQuestions: string[];
  citations: Array<{
    sourceKey: string;
    title: string;
    publisher: string;
    sourceUrl: string;
    reviewedOn: string;
    excerpt: string;
  }>;
};

export const WORKSPACE_REQUEST_TIMEOUT_MS = 30_000;
/** Opening a workspace may wake a sleeping demo server, which takes about a minute (ADR-0079). */
export const WORKSPACE_LOAD_TIMEOUT_MS = 90_000;

async function request(path: string, options?: RequestInit, timeoutMs = WORKSPACE_REQUEST_TIMEOUT_MS): Promise<ServerWorkspace> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!response.ok) {
      let currentRevision: number | undefined;
      try {
        const detail = (await response.json())?.detail;
        if (typeof detail?.currentRevision === "number") currentRevision = detail.currentRevision;
      } catch {
        // Error bodies are optional.
      }
      throw new ServerWorkspaceError(response.status, "The garden server could not save this workspace.", currentRevision);
    }
    return await response.json() as ServerWorkspace;
  } finally {
    clearTimeout(timeout);
  }
}

export function loadServerWorkspace(workspaceId: string) {
  return request(`/workspaces/${encodeURIComponent(workspaceId)}`, undefined, WORKSPACE_LOAD_TIMEOUT_MS);
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const response = await fetch(apiUrl("/runtime-config"));
  if (!response.ok) throw new Error("The garden server could not load runtime settings.");
  return response.json() as Promise<RuntimeConfig>;
}

export function importServerWorkspace(workspaceId: string, workspace: GardenWorkspace) {
  return request(`/workspaces/${encodeURIComponent(workspaceId)}/import`, {
    method: "PUT",
    body: JSON.stringify({ workspaceId, ...workspace }),
  });
}

export function saveServerWorkspace(workspaceId: string, workspace: GardenWorkspace, revision: number) {
  return request(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PUT",
    body: JSON.stringify({ workspaceId, ...workspace, revision }),
  });
}

export async function loadRotationGuidance(
  workspaceId: string,
  gardenId: string,
  input: {
    growingAreaId: string;
    cropFamily: PlantingCropFamily;
    plantingDate: string;
    excludePlantingId?: string;
  },
): Promise<RotationGuidance> {
  const response = await fetch(
    `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/rotation-guidance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) throw new Error("The garden server could not check crop rotation.");
  return response.json() as Promise<RotationGuidance>;
}

export async function createAiCareNoteDraft(
  workspaceId: string,
  gardenId: string,
  note: string,
  today: string,
): Promise<AiCareNoteDraft> {
  const response = await fetch(
    `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/ai/care-note-draft`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note, today }),
    },
  );
  const requestId = response.headers?.get?.(CARE_NOTE_REQUEST_ID_HEADER) ?? undefined;
  if (!response.ok) {
    throw new AiCareNoteRequestError(
      await featureResponseMessage(response, "AI Garden Note"),
      requestId,
    );
  }
  const draft = (await response.json()) as AiCareNoteDraft;
  return requestId ? { ...draft, requestId } : draft;
}

export async function uploadPlantHealthPhoto(
  workspaceId: string,
  gardenId: string,
  photo: File,
) {
  const formData = new FormData();
  formData.append("photo", photo);
  const response = await fetch(
    apiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/plant-health/photos`),
    { method: "POST", body: formData },
  );
  if (!response.ok) {
    throw new FeatureRequestError(await featureResponseMessage(response, "Photo upload"));
  }
  return (await response.json() as { path: string }).path;
}

export async function createPlantHealthAssessment(
  workspaceId: string,
  gardenId: string,
  input: { symptoms: string; severity: HealthSeverity; photoCount: number },
): Promise<HealthAssessment> {
  const response = await fetch(
    apiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/ai/plant-health-assessment`),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  if (!response.ok) {
    throw new FeatureRequestError(await featureResponseMessage(response, "Plant Doctor"));
  }
  return response.json() as Promise<HealthAssessment>;
}

export async function askPlantKnowledge(
  workspaceId: string,
  input: { question: string; gardenId?: string },
): Promise<PlantKnowledgeAnswer> {
  const response = await fetch(
    apiUrl(`/workspaces/${encodeURIComponent(workspaceId)}/plant-knowledge/answer`),
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  if (!response.ok) {
    throw new FeatureRequestError(await featureResponseMessage(response, "Plant Guide"));
  }
  return response.json() as Promise<PlantKnowledgeAnswer>;
}

export class SeasonAllocationError extends FeatureRequestError {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SeasonAllocationError";
    this.status = status;
  }
}

/** Ask the Allocation Assistant for a draft. One response per run; the trace arrives complete. */
export async function createSeasonAllocation(
  workspaceId: string,
  gardenId: string,
  body: { crops: string[]; preference: string; growingAreaIds?: string[] },
  signal?: AbortSignal,
): Promise<SeasonAllocationResult> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/ai/season-allocation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new SeasonAllocationError("The garden server could not be reached. Check the connection and try again.");
  }
  if (!response.ok) {
    throw new SeasonAllocationError(
      await featureResponseMessage(response, "Allocation Assistant"),
      response.status,
    );
  }
  return response.json() as Promise<SeasonAllocationResult>;
}
