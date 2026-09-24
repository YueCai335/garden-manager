import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createDemoGardenWorkspace } from "@/lib/gardenWorkspace";

// The public Allocation Assistant runs on the backend's fixed copy of the demo
// garden (ADR-0056). If the two drift apart, public drafts would describe a
// garden the visitor is not looking at.
const serverDemoGarden = JSON.parse(
  readFileSync(resolve(process.cwd(), "backend/app/agent/demo_garden.json"), "utf-8"),
);

describe("server demo garden", () => {
  it("matches the frontend demo garden's areas and plantings", () => {
    const [garden] = createDemoGardenWorkspace().gardens;

    expect(serverDemoGarden).toEqual({
      gardenId: garden.id,
      growingAreas: garden.growingAreas.map(({ id, name, kind }) => ({ id, name, kind })),
      plantings: garden.plantings.map(({ id, commonName, cropFamily, plantingDate, growingAreaId }) => ({
        id,
        commonName,
        cropFamily,
        plantingDate,
        growingAreaId,
      })),
    });
  });
});
