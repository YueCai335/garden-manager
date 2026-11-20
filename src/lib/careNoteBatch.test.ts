import { describe, expect, it } from "vitest";
import { careFixture } from "@/test/careFixture";
import { applyCareDraftBatch, newCareDraft } from "./careNoteBatch";

function row(gardenId: string, note = "Watered today") {
  return { ...newCareDraft(), gardenId, note, type: "watering" as const, date: "2026-11-11", targetScope: "garden" as const };
}

describe("atomic care batch application", () => {
  it("adds selected garden and root records once without changing the selected garden or mutating input", () => {
    const workspace = careFixture();
    const original = structuredClone(workspace);
    const rows = [row("front"), row("back"), { ...row(""), targetScope: "all-gardens" as const }, { ...row("front"), included: false, date: "" }];
    const result = applyCareDraftBatch(workspace, rows);
    expect(result.errors).toEqual({});
    expect(result.added).toBe(3);
    expect(workspace).toEqual(original);
    expect(result.workspace.selectedGardenId).toBe("front");
    expect(result.workspace.gardens.map((garden) => garden.careEvents.length)).toEqual([3, 4]);
    expect(result.workspace.careEvents).toHaveLength(2);
    const retry = applyCareDraftBatch(result.workspace, rows);
    expect(retry.workspace).toBe(result.workspace);
    expect(retry.added).toBe(0);
  });
  it("does not write any row if one garden or target disappeared", () => {
    const workspace = careFixture();
    for (const invalid of [row("deleted"), { ...row("back"), targetScope: "plant-group" as const, plantingRecordId: "front-only" }]) {
      const result = applyCareDraftBatch(workspace, [row("front"), invalid]);
      expect(result.workspace).toBe(workspace);
      expect(result.added).toBe(0);
      expect(Object.keys(result.errors)).toHaveLength(1);
    }
  });
  it("preserves unrelated newer edits and checks dates and quantities before writing", () => {
    const workspace = careFixture();
    workspace.gardens[1].name = "New back name";
    const draft = row("back");
    const result = applyCareDraftBatch(workspace, [draft]);
    expect(result.workspace.gardens[1].name).toBe("New back name");
    for (const invalid of [{ ...draft, date: "2026-02-30" }, { ...draft, type: "fertilizing" as const, fertilizerAmount: "-1" }]) {
      expect(applyCareDraftBatch(workspace, [row("front"), invalid]).workspace).toBe(workspace);
    }
  });
  it("rejects identity collisions and refuses to partially replay a changed record", () => {
    const workspace = careFixture();
    const first = row("front");
    const saved = applyCareDraftBatch(workspace, [first]).workspace;
    const replay = applyCareDraftBatch(saved, [{ ...first, note: "Different" }, row("back")]);
    expect(replay.workspace).toBe(saved);
    expect(Object.values(replay.errors)[0]).toMatch(/record changed/);
    expect(applyCareDraftBatch(workspace, [first, { ...row("back"), eventId: first.eventId }]).workspace).toBe(workspace);
  });
  it("uses current trusted labels for selected targets", () => {
    const workspace = careFixture();
    workspace.gardens[1].growingAreas = [{ id: "back-area", name: "New area name", kind: "raised-bed", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } }];
    const result = applyCareDraftBatch(workspace, [{ ...row("back"), targetScope: "planting-area", growingAreaId: "back-area" }]);
    expect(result.workspace.gardens[1].careEvents.at(-1)?.growingAreaName).toBe("New area name");
  });
});

describe("batch rows with five care types (ADR-0085 N3)", () => {
  const draft = { sourceText: "Pruned side shoots", gardenId: "front", type: "pruning" as const, date: "2026-11-11", targetScope: "garden" as const, growingAreaId: null, plantingRecordId: null, reviewNotes: [], pruneDetail: "side shoots" };

  it("keeps a new type's details from the AI draft through to the saved record", () => {
    const fromAi = newCareDraft(draft);
    expect(fromAi).toMatchObject({ type: "pruning", pruneDetail: "side shoots", plantCount: "" });
    const result = applyCareDraftBatch(careFixture(), [fromAi]);
    expect(result.errors).toEqual({});
    expect(result.workspace.gardens[0].careEvents.at(-1)).toMatchObject({ type: "pruning", pruneDetail: "side shoots" });
  });

  it("saves only the chosen type's details and checks a plant count", () => {
    const planting = { ...row("front"), type: "planting" as const, plantName: "Basil", plantCount: "1.5", pestProblem: "Aphids" };
    const rejected = applyCareDraftBatch(careFixture(), [planting]);
    expect(Object.entries(rejected.errors)).toEqual([[`batch-${planting.draftId}-count`, "Enter a whole number of plants from 1 to 999."]]);
    const saved = applyCareDraftBatch(careFixture(), [{ ...planting, plantCount: "2" }]).workspace.gardens[0].careEvents.at(-1);
    expect(saved).toMatchObject({ type: "planting", plantName: "Basil", plantCount: 2 });
    expect(saved).not.toHaveProperty("pestProblem");
  });

  it("saves up to 12 records at once", () => {
    const rows = Array.from({ length: 13 }, () => row("front"));
    expect(applyCareDraftBatch(careFixture(), rows).errors.batch).toBe("Select between 1 and 12 records to save.");
    expect(applyCareDraftBatch(careFixture(), rows.slice(0, 12)).added).toBe(12);
  });
});
