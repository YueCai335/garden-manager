import { demoGardenData } from "@/lib/demoGardenData";
import type { GardenWorkspace } from "@/lib/gardenWorkspace";
import type { CareNoteBatchDraftResponse, RuntimeConfig } from "@/lib/gardenWorkspaceApi";

type BatchDraft = CareNoteBatchDraftResponse["drafts"][number];

/**
 * Whether this frontend build shows AI note batches in the public demo (ADR-0086).
 * Next.js inlines the value at build time, so changing it needs a new build and
 * deployment. Only the exact string "true" opens it; the local app ignores it.
 */
export function isCareNoteBatchLiveEntryBuild() {
  return process.env.NEXT_PUBLIC_CARE_NOTE_BATCH_LIVE_ENTRY === "true";
}

/** Whether the note dialog offers batches: the local app's own path, or the demo's when the server and this build both allow it. */
export function batchNoteAvailable(config: RuntimeConfig | undefined) {
  if (!config) return false;
  if (!config.portfolioDemo) return config.careNoteBatchAvailable === true;
  return config.careNoteBatchPublicAvailable === true && isCareNoteBatchLiveEntryBuild();
}

/** Each showcase garden, area, and plant group by ID, with the name the server's copy gives it. */
const showcaseNames = new Map<string, string>(demoGardenData.flatMap((garden) => [
  [garden.id, garden.name] as [string, string],
  ...garden.areas.map((area) => [area.id, area.name] as [string, string]),
]));

/**
 * A public draft names items of the server's showcase copy (ADR-0086). The
 * visitor may have renamed, moved, or deleted them since, so each ID the
 * visitor's workspace no longer has under the same name and place is left
 * empty, with a review note, instead of being saved onto the wrong item.
 */
export function matchShowcaseDraft(draft: BatchDraft, workspace: GardenWorkspace): BatchDraft {
  if (!draft.gardenId) return draft;
  const garden = workspace.gardens.find((item) => item.id === draft.gardenId);
  const area = draft.growingAreaId ? garden?.growingAreas.find((item) => item.id === draft.growingAreaId) : undefined;
  const planting = draft.plantingRecordId ? garden?.plantings.find((item) => item.id === draft.plantingRecordId) : undefined;
  const gardenMatches = Boolean(garden) && garden!.name === showcaseNames.get(draft.gardenId);
  const areaMatches = !draft.growingAreaId || (Boolean(area) && area!.name === showcaseNames.get(draft.growingAreaId));
  const plantingMatches = !draft.plantingRecordId || (Boolean(planting) && plantingStillShowcase(draft.gardenId, planting!));
  if (gardenMatches && areaMatches && plantingMatches) return draft;
  const review = "Choose the garden and target for this action; the demo garden has changed since the AI read it.";
  const cleared = { targetScope: null, growingAreaId: null, plantingRecordId: null, reviewNotes: [...draft.reviewNotes, review] };
  return gardenMatches ? { ...draft, ...cleared } : { ...draft, gardenId: null, ...cleared };
}

function plantingStillShowcase(gardenId: string, planting: { id: string; commonName: string; growingAreaId: string }) {
  const data = demoGardenData.find((garden) => garden.id === gardenId);
  const area = data?.areas.find((item) => item.id === planting.growingAreaId);
  return Boolean(area?.plants.some((plant) => plant.type === planting.commonName));
}
