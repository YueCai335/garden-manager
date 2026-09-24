import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type { Garden, GrowingAreaKind, PlannedPlanting, PlantingCropFamily } from "@/lib/gardenWorkspace";
import {
  allocationRequestBody,
  allocationRotationSummary,
  appendAllocationToGarden,
  isAllocationDraftStale,
  needsAreaChoice,
  plannedCropKey,
  selectedAllocationAreaIds,
  type AllocationInput,
  type SeasonAllocationResult,
} from "@/lib/seasonAllocation";

type AreaSpec = { id: string; name?: string; kind: GrowingAreaKind };
type PlantingSpec = { id: string; commonName?: string; cropFamily: PlantingCropFamily; plantingDate: string; growingAreaId: string };

function garden(areas: AreaSpec[], plantings: PlantingSpec[] = [], plans: Garden["seasonPlans"] = []): Garden {
  return {
    id: "garden-1",
    name: "Home",
    plan: { widthMeters: 10, depthMeters: 6 },
    growingAreas: areas.map((area) => ({
      id: area.id,
      name: area.name ?? area.id,
      kind: area.kind,
      planPlacement: { x: 0, y: 0, rotationDegrees: 0 },
    })),
    plantings: plantings.map((planting) => ({
      commonName: planting.id,
      quantity: 1,
      isActive: false,
      ...planting,
    })),
    seasonPlans: plans,
    careEvents: [],
    careTasks: [],
    healthRecords: [],
  };
}

const bed = { id: "bed", name: "North bed", kind: "raised-bed" } as const;
const ground = { id: "ground", name: "Back plot", kind: "in-ground" } as const;
const history = [
  { id: "tomatoes", cropFamily: "nightshade", plantingDate: "2026-05-01", growingAreaId: "bed" },
  { id: "beans", cropFamily: "legume", plantingDate: "2026-05-02", growingAreaId: "ground" },
] satisfies PlantingSpec[];

function draft(overrides: Partial<SeasonAllocationResult> = {}): SeasonAllocationResult {
  return {
    status: "draft",
    seasonYear: 2027,
    scope: {
      seasonYear: 2027,
      areas: [
        { id: "bed", name: "North bed", kind: "raised-bed" },
        { id: "ground", name: "Back plot", kind: "in-ground" },
      ],
      crops: ["tomato", "bean"],
      preference: "keep tomatoes sunny",
    },
    allocation: [
      { growingAreaId: "ground", crop: "tomato" },
      { growingAreaId: "bed", crop: "bean" },
    ],
    explanation: "Swapped them.",
    warnings: [],
    rotationSummary: [
      { growingAreaId: "bed", year: 2026, rotationGroup: "nightshade" },
      { growingAreaId: "ground", year: 2026, rotationGroup: "legume" },
    ],
    missingInputs: [],
    failureReason: null,
    trace: [],
    ...overrides,
  };
}

const input: AllocationInput = { crops: ["tomato", "bean"], preference: "keep tomatoes sunny", chosenAreaIds: [] };

describe("area selection", () => {
  it("counts only rotation-eligible areas when deciding whether the gardener must choose", () => {
    const twoBedsTwoGreenhouses = garden([
      bed,
      { id: "glass-1", kind: "greenhouse" },
      { id: "bed-2", kind: "raised-bed" },
      { id: "glass-2", kind: "greenhouse" },
    ]);

    expect(needsAreaChoice(twoBedsTwoGreenhouses)).toBe(false);
    expect(selectedAllocationAreaIds(twoBedsTwoGreenhouses, [])).toEqual(["bed", "bed-2"]);
    expect(allocationRequestBody(twoBedsTwoGreenhouses, input)).toEqual({
      crops: ["tomato", "bean"],
      preference: "keep tomatoes sunny",
    });
  });

  it("sends the chosen areas, in garden order, only when more than three are eligible", () => {
    const fourBeds = garden(["a", "b", "c", "d"].map((id) => ({ id, kind: "raised-bed" as const })));

    expect(needsAreaChoice(fourBeds)).toBe(true);
    expect(allocationRequestBody(fourBeds, { ...input, chosenAreaIds: ["d", "a"] })).toEqual({
      crops: ["tomato", "bean"],
      preference: "keep tomatoes sunny",
      growingAreaIds: ["a", "d"],
    });
  });

  it("sends crops in the fixed crop order whatever order they were ticked", () => {
    expect(allocationRequestBody(garden([bed]), { ...input, crops: ["carrot", "tomato"] }).crops).toEqual([
      "tomato",
      "carrot",
    ]);
  });
});

describe("rotation summary", () => {
  it("matches the backend on the shared fixture", () => {
    // backend/tests/test_season_allocation.py runs the same fixture through the Python rules.
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), "backend/tests/fixtures/allocation_rotation_summary.json"), "utf-8"),
    );
    const shared = garden(fixture.growingAreas, fixture.plantings);
    const areaIds = selectedAllocationAreaIds(shared, []);

    expect(needsAreaChoice(shared)).toBe(false);
    expect(areaIds).toEqual(fixture.expectedAreaIds);
    expect(allocationRotationSummary(shared, areaIds, fixture.seasonYear)).toEqual(fixture.expectedRows);
  });
});

describe("draft staleness", () => {
  const current = garden([bed, ground], history);

  it("keeps a draft whose inputs and history are unchanged", () => {
    expect(isAllocationDraftStale(draft(), current, input, 2027)).toBe(false);
    // The server trims the preference, so surrounding spaces are not a change.
    expect(isAllocationDraftStale(draft(), current, { ...input, preference: "  keep tomatoes sunny " }, 2027)).toBe(false);
  });

  it.each([
    ["the preference", current, { ...input, preference: "keep tomatoes shady" }, 2027],
    ["the crops", current, { ...input, crops: ["tomato"] }, 2027],
    ["the season year", current, input, 2028],
    ["an area's kind", garden([bed, { ...ground, kind: "container" }], history), input, 2027],
    ["the area set", garden([bed], history), input, 2027],
    [
      "the rotation history",
      garden([bed, ground], [...history, { id: "kale", cropFamily: "brassica", plantingDate: "2025-04-01", growingAreaId: "bed" }]),
      input,
      2027,
    ],
  ] as const)("marks a draft stale when %s changes", (_label, changedGarden, changedInput, seasonYear) => {
    expect(isAllocationDraftStale(draft(), changedGarden, changedInput as AllocationInput, seasonYear)).toBe(true);
  });

  it("treats anything but a draft, or a missing garden, as stale", () => {
    expect(isAllocationDraftStale(draft({ status: "generation_failed" }), current, input, 2027)).toBe(true);
    expect(isAllocationDraftStale(draft(), undefined, input, 2027)).toBe(true);
  });
});

describe("planned crop recognition", () => {
  it.each([
    [{ plantType: "Tomato", commonName: "Sungold" }, "tomato"],
    [{ commonName: "番茄" }, "tomato"],
    [{ commonName: "Tomatoes" }, "tomato"],
    [{ commonName: "胡萝卜" }, "carrot"],
    [{ plantType: "Bean", commonName: "Bush beans" }, "bean"],
    [{ commonName: "Cherry tomato" }, undefined],
    [{ commonName: "Tomato soup garden" }, undefined],
    [{ commonName: "Kale" }, undefined],
  ] as const)("maps %o to %s by exact alias only", (planting, key) => {
    expect(plannedCropKey(planting)).toBe(key);
  });
});

describe("appending a confirmed draft", () => {
  let nextId = 0;
  const createId = (prefix: string) => `${prefix}-${++nextId}`;
  const planned = (id: string, commonName: string, growingAreaId: string, plantType?: string): PlannedPlanting => ({
    id,
    commonName,
    plantType,
    cropFamily: "other",
    growingAreaId,
  });

  it("creates the draft's season plan when none exists", () => {
    const result = appendAllocationToGarden(garden([bed, ground], history), draft(), createId);

    expect(result).toMatchObject({ added: 2, skipped: 0 });
    expect(result.garden.seasonPlans).toHaveLength(1);
    expect(result.garden.seasonPlans?.[0]).toMatchObject({ seasonYear: 2027 });
    expect(result.garden.seasonPlans?.[0].plantings.map(({ commonName, cropFamily, growingAreaId }) => ({ commonName, cropFamily, growingAreaId }))).toEqual([
      { commonName: "Tomato", cropFamily: "nightshade", growingAreaId: "ground" },
      { commonName: "Bean", cropFamily: "legume", growingAreaId: "bed" },
    ]);
  });

  it("skips a crop already planned in the same area, keeps other entries, and leaves unknown ones alone", () => {
    const existing = garden([bed, ground], history, [
      { id: "plan-2027", seasonYear: 2027, plantings: [
        planned("p-1", "番茄", "ground"),
        planned("p-2", "Mystery squash-tomato cross", "bed"),
        planned("p-3", "Tomato", "bed", "Tomato"),
      ] },
      { id: "plan-2028", seasonYear: 2028, plantings: [planned("p-4", "Bean", "bed", "Bean")] },
    ]);

    const result = appendAllocationToGarden(existing, draft(), createId);

    expect(result).toMatchObject({ added: 1, skipped: 1 });
    const plan2027 = result.garden.seasonPlans?.find((plan) => plan.seasonYear === 2027);
    expect(plan2027?.plantings.map((planting) => planting.id)).toEqual(["p-1", "p-2", "p-3", expect.any(String)]);
    expect(plan2027?.plantings.at(-1)).toMatchObject({ commonName: "Bean", growingAreaId: "bed" });
    expect(result.garden.seasonPlans?.find((plan) => plan.seasonYear === 2028)?.plantings).toHaveLength(1);
  });

  it("adds nothing the second time the same draft is confirmed", () => {
    const once = appendAllocationToGarden(garden([bed, ground], history), draft(), createId);
    const twice = appendAllocationToGarden(once.garden, draft(), createId);

    expect(twice).toMatchObject({ added: 0, skipped: 2 });
    expect(twice.garden.seasonPlans?.[0].plantings).toHaveLength(2);
  });
});
