import { describe, expect, it } from "vitest";
import { defaultPlanLevel, isPlanLevel, planLevelFromSearch, setupLevel } from "./planLevels";

describe("plan levels (ADR-0075)", () => {
  it("starts on Garden, or on Plants when the address opens an area (ADR-0078)", () => {
    expect(defaultPlanLevel(false)).toBe("garden");
    expect(defaultPlanLevel(true)).toBe("plants");
  });

  it("reads a known level from the address and ignores anything else", () => {
    expect(planLevelFromSearch("garden", true)).toBe("garden");
    expect(planLevelFromSearch("areas", false)).toBe("areas");
    expect(planLevelFromSearch("roots", false)).toBe("garden");
    expect(planLevelFromSearch(null, true)).toBe("plants");
    expect(isPlanLevel("plants")).toBe(true);
    expect(isPlanLevel(undefined)).toBe(false);
  });

  it("maps the guided setup's steps to the matching level", () => {
    expect(setupLevel("size")).toBe("garden");
    expect(setupLevel("areas")).toBe("areas");
    expect(setupLevel("plants")).toBe("plants");
    expect(setupLevel("ready")).toBeUndefined();
  });
});
