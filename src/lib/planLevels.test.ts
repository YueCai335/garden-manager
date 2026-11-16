import { describe, expect, it } from "vitest";
import { defaultPlanLevel, isPlanLevel, planLevelFromSearch, setupLevel } from "./planLevels";

describe("plan levels (ADR-0075)", () => {
  it("starts on Plants, or on Planting areas while there is nothing to plant in", () => {
    expect(defaultPlanLevel(3)).toBe("plants");
    expect(defaultPlanLevel(0)).toBe("areas");
  });

  it("reads a known level from the address and ignores anything else", () => {
    expect(planLevelFromSearch("garden", 2)).toBe("garden");
    expect(planLevelFromSearch("areas", 2)).toBe("areas");
    expect(planLevelFromSearch("roots", 2)).toBe("plants");
    expect(planLevelFromSearch(null, 0)).toBe("areas");
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
