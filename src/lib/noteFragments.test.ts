import { describe, expect, it } from "vitest";
import { careFixture } from "@/test/careFixture";
import { newCareDraft } from "./careNoteBatch";
import { noteGroups, noteSegments } from "./noteFragments";

// ADR-0085 N5: the review cuts the note into sentences and groups records by garden.
describe("noteSegments", () => {
  it("marks each quoted sentence once, shares a quote between drafts, and keeps the rest as text", () => {
    const note = "Watered front and back today. Pruned the pepper. Tomorrow feed the kale.";
    const segments = noteSegments(note,
      [{ draftId: "a", sourceText: "Watered front and back today" }, { draftId: "b", sourceText: "Watered front and back today" }, { draftId: "c", sourceText: "Pruned the pepper" }],
      [{ sourceText: "Tomorrow feed the kale" }]);
    expect(segments.map((segment) => [segment.text, segment.draftIds, segment.kind])).toEqual([
      ["Watered front and back today", ["a", "b"], "record"], [". ", [], undefined],
      ["Pruned the pepper", ["c"], "record"], [". ", [], undefined],
      ["Tomorrow feed the kale", [], "notice"], [".", [], undefined],
    ]);
    expect(segments.map((segment) => segment.text).join("")).toBe(note);
  });

  it("leaves out a quote that is missing or overlaps an earlier one", () => {
    const segments = noteSegments("Watered the bed", [{ draftId: "a", sourceText: "Watered the bed" }, { draftId: "b", sourceText: "the bed" }, { draftId: "c", sourceText: "Not in the note" }], []);
    expect(segments).toEqual([{ text: "Watered the bed", draftIds: ["a"], kind: "record" }]);
  });
});

describe("noteGroups", () => {
  it("groups by garden in workspace order, then all gardens, then rows without a garden", () => {
    const row = (gardenId: string, extra = {}) => ({ ...newCareDraft(), gardenId, targetScope: "garden" as const, ...extra });
    const rows = [row(""), row("back"), row("", { targetScope: "all-gardens" as const }), row("front")];
    expect(noteGroups(careFixture(), rows).map((group) => [group.name, group.rows.length])).toEqual([["Front garden", 1], ["Back garden", 1], ["All gardens", 1], ["Choose a garden", 1]]);
  });
});
