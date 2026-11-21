import { afterEach, describe, expect, it, vi } from "vitest";

import { createShowcaseWorkspace } from "@/lib/gardenWorkspace";
import type { CareNoteBatchDraftResponse } from "@/lib/gardenWorkspaceApi";
import { batchNoteAvailable, matchShowcaseDraft } from "@/lib/publicNoteBatch";

type Draft = CareNoteBatchDraftResponse["drafts"][number];
const draft = (fields: Partial<Draft>): Draft => ({
  sourceText: "Fed the Carrot", gardenId: "demo-backyard", type: "fertilizing", date: "2026-11-21", targetScope: "plant-group",
  growingAreaId: "demo-backyard-raised-bed-3", plantingRecordId: "demo-backyard-raised-bed-3-carrot",
  fertilizerProduct: null, fertilizerAmount: null, fertilizerUnit: null, reviewNotes: [], ...fields,
} as Draft);

describe("batch note availability (ADR-0086)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    [{ portfolioDemo: false, careNoteBatchAvailable: true }, "false", true],
    [{ portfolioDemo: false, careNoteBatchAvailable: false }, "true", false],
    [{ portfolioDemo: true, careNoteBatchPublicAvailable: true }, "true", true],
    [{ portfolioDemo: true, careNoteBatchPublicAvailable: true }, "false", false],
    [{ portfolioDemo: true, careNoteBatchPublicAvailable: false }, "true", false],
    [{ portfolioDemo: true, careNoteBatchAvailable: true }, "true", false],
  ])("config %o with build flag %s → %s", (config, flag, expected) => {
    vi.stubEnv("NEXT_PUBLIC_CARE_NOTE_BATCH_LIVE_ENTRY", flag);
    expect(batchNoteAvailable(config)).toBe(expected);
  });

  it("is off while the configuration is loading", () => {
    expect(batchNoteAvailable(undefined)).toBe(false);
  });
});

describe("matching a public draft to the visitor's showcase", () => {
  it("keeps a draft whose garden, bed, and plant are unchanged", () => {
    const workspace = createShowcaseWorkspace("2026-11-21");
    const kept = draft({});
    expect(workspace.gardens[0].plantings.some((planting) => planting.id === kept.plantingRecordId)).toBe(true);
    expect(matchShowcaseDraft(kept, workspace)).toBe(kept);
  });

  it("leaves the target for the visitor when the bed was renamed", () => {
    const workspace = createShowcaseWorkspace("2026-11-21");
    workspace.gardens[0].growingAreas.find((area) => area.id === "demo-backyard-raised-bed-3")!.name = "Herb bed";
    const result = matchShowcaseDraft(draft({}), workspace);
    expect([result.gardenId, result.targetScope, result.growingAreaId, result.plantingRecordId]).toEqual(["demo-backyard", null, null, null]);
    expect(result.reviewNotes.at(-1)).toMatch(/demo garden has changed/);
  });

  it("leaves the garden empty too when the garden is gone or renamed", () => {
    const workspace = createShowcaseWorkspace("2026-11-21");
    workspace.gardens[0].name = "My yard";
    const result = matchShowcaseDraft(draft({ targetScope: "garden", growingAreaId: null, plantingRecordId: null }), workspace);
    expect([result.gardenId, result.targetScope]).toEqual([null, null]);
  });

  it("leaves a draft with no garden as it is", () => {
    const empty = draft({ gardenId: null, targetScope: null, growingAreaId: null, plantingRecordId: null });
    expect(matchShowcaseDraft(empty, createShowcaseWorkspace("2026-11-21"))).toBe(empty);
  });
});
