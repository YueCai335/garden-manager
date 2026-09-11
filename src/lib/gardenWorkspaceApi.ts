import type { CareEventTargetScope, CareEventType, GardenWorkspace, GrowingAreaKind, HealthAssessment, HealthSeverity, PlantingCropFamily } from "@/lib/gardenWorkspace";

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
};

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

export type AiCareNoteDraft = {
  type: CareEventType | null;
  date: string | null;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string | null;
  growingAreaName: string | null;
  plantingRecordId: string | null;
  plantingRecordName: string | null;
  fertilizerProduct: string | null;
  fertilizerAmount: number | null;
  fertilizerUnit: string | null;
  reviewNotes: string[];
};

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

async function request(path: string, options?: RequestInit): Promise<ServerWorkspace> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
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
  return response.json() as Promise<ServerWorkspace>;
}

export function loadServerWorkspace(workspaceId: string) {
  return request(`/workspaces/${encodeURIComponent(workspaceId)}`);
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
): Promise<AiCareNoteDraft> {
  const response = await fetch(
    `${apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/gardens/${encodeURIComponent(gardenId)}/ai/care-note-draft`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail ?? "The AI service could not create a care draft.");
  }
  return response.json() as Promise<AiCareNoteDraft>;
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
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail ?? "The garden server could not upload this photo.");
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
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail ?? "The AI service could not create a plant-health assessment.");
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
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.detail ?? "The garden server could not answer this question.");
  }
  return response.json() as Promise<PlantKnowledgeAnswer>;
}
