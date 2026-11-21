import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createShowcaseWorkspace } from "@/lib/gardenWorkspace";

// The public demo's AI notes read the server's own copy of the showcase gardens
// (ADR-0086). If the two drift apart, a public draft would name a bed or plant
// the visitor's garden does not have.
const serverShowcase = JSON.parse(
  readFileSync(resolve(process.cwd(), "backend/app/showcase_gardens.json"), "utf-8"),
);

describe("server showcase gardens", () => {
  it("match the browser's showcase gardens, areas, and plant groups", () => {
    const { gardens } = createShowcaseWorkspace("2026-11-21");

    expect(serverShowcase).toEqual({
      gardens: gardens.map((garden) => ({
        id: garden.id,
        name: garden.name,
        areas: garden.growingAreas.map(({ id, name }) => ({ id, name })),
        plants: garden.plantings.map(({ id, commonName, growingAreaId }) => ({ id, name: commonName, growingAreaId })),
      })),
    });
  });
});
