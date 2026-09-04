import { describe, expect, it } from "vitest";

import {
  addDays,
  careTaskStatus,
  allocationPlantColor,
  clampAllocationCenter,
  clampPlanPosition,
  createDemoGardenWorkspace,
  createRectangularLayout,
  defaultPlantColor,
  defaultPlanPlacement,
  findDuplicatePlantPosition,
  gardenPlanViewport,
  inferPlantCropFamily,
  isPlantColor,
  plantDisplayName,
  normalizePlanRotation,
  readGardenWorkspace,
  snapToGrid,
  validateGardenPlanDimensions,
  validateLayoutDimensions,
} from "@/lib/gardenWorkspace";

describe("readGardenWorkspace", () => {
  it("migrates a v3 garden into a selected multi-garden collection without losing records or layouts", () => {
    const v3 = {
      version: 3,
      garden: {
        id: "garden-1",
        name: "Home garden",
        plan: { widthMeters: 8, depthMeters: 5 },
      },
      growingAreas: [
        {
          id: "area-1",
          name: "North bed",
          kind: "raised-bed",
          planPlacement: { x: 1, y: 2, rotationDegrees: 10 },
          layout: {
            widthMeters: 1.2,
            depthMeters: 0.8,
            boundary: [
              { x: 0, y: 0 },
              { x: 1.2, y: 0 },
              { x: 1.2, y: 0.8 },
              { x: 0, y: 0.8 },
            ],
            allocations: [
              {
                id: "allocation-1",
                label: "Tomato",
                x: 0.6,
                y: 0.4,
                diameterMeters: 0.5,
              },
            ],
          },
        },
      ],
      plantings: [
        {
          id: "planting-1",
          commonName: "Tomatoes",
          cropFamily: "nightshade",
          quantity: 4,
          plantingDate: "2026-05-18",
          growingAreaId: "area-1",
          isActive: true,
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(v3))).toEqual({
      version: 10,
      selectedGardenId: "garden-1",
      careEvents: [],
      careTasks: [],
      gardens: [
        {
          id: "garden-1",
          name: "Home garden",
          plan: { widthMeters: 8, depthMeters: 5 },
          growingAreas: [
            {
              ...v3.growingAreas[0],
              layout: {
                ...v3.growingAreas[0].layout,
                allocations: [
                  { ...v3.growingAreas[0].layout.allocations[0], plantingRecordId: "planting-1" },
                ],
              },
            },
          ],
          plantings: v3.plantings,
          careEvents: [],
          careTasks: [],
          healthRecords: [],
        },
      ],
    });
  });

  it("links legacy layout plants to current-season records for planning", () => {
    const workspace = {
      version: 10,
      selectedGardenId: "garden-1",
      gardens: [{
        id: "garden-1",
        name: "Back garden",
        plan: { widthMeters: 4, depthMeters: 3 },
        growingAreas: [{
          id: "bed-1",
          name: "Bed 1",
          kind: "raised-bed",
          planPlacement: { x: 0, y: 0, rotationDegrees: 0 },
          layout: {
            widthMeters: 2,
            depthMeters: 1,
            boundary: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }],
            allocations: [{ id: "sungold-1", label: "Sun Gold", plantType: "Tomato", variety: "Sun Gold", x: 1, y: 0.5, diameterMeters: 0.5 }],
          },
        }],
        plantings: [],
        careEvents: [],
        careTasks: [],
        healthRecords: [],
      }],
      careEvents: [],
      careTasks: [],
    };

    const restored = readGardenWorkspace(JSON.stringify(workspace));
    const garden = restored!.gardens[0];
    expect(garden.plantings).toEqual([expect.objectContaining({
      commonName: "Tomato · Sun Gold",
      cropFamily: "nightshade",
      quantity: 1,
      growingAreaId: "bed-1",
      isActive: true,
    })]);
    expect(garden.plantings[0].plantingDate).toMatch(new RegExp(`^${new Date().getFullYear()}-`));
    expect(garden.growingAreas[0].layout!.allocations[0].plantingRecordId).toBe(garden.plantings[0].id);
  });

  it("keeps independent gardens and rejects a record linked outside its garden", () => {
    const valid = {
      version: 8,
      selectedGardenId: "home",
      gardens: [
        {
          id: "home",
          name: "Home garden",
          plan: { widthMeters: 10, depthMeters: 6 },
          growingAreas: [
            {
              id: "home-bed",
              name: "Home bed",
              kind: "raised-bed",
              planPlacement: { x: 1, y: 1, rotationDegrees: 0 },
            },
          ],
          plantings: [],
          careEvents: [],
          careTasks: [],
        },
        {
          id: "community",
          name: "Community plot",
          plan: { widthMeters: 4, depthMeters: 4 },
          growingAreas: [
            {
              id: "community-bed",
              name: "Plot bed",
              kind: "in-ground",
              planPlacement: { x: 0, y: 0, rotationDegrees: 0 },
            },
          ],
          careEvents: [],
          careTasks: [],
          plantings: [
            {
              id: "planting-1",
              commonName: "Beans",
              cropFamily: "legume",
              quantity: 8,
              plantingDate: "2026-05-18",
              growingAreaId: "community-bed",
              isActive: true,
            },
          ],
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(valid))).toMatchObject({
      selectedGardenId: "home",
      gardens: [
        { name: "Home garden" },
        { name: "Community plot", plantings: [{ commonName: "Beans" }] },
      ],
    });
    expect(
      readGardenWorkspace(
        JSON.stringify({
          ...valid,
          gardens: [
            { ...valid.gardens[0], plantings: valid.gardens[1].plantings },
            valid.gardens[1],
          ],
        }),
      ),
    ).toBeUndefined();
    expect(
      readGardenWorkspace(
        JSON.stringify({
          ...valid,
          gardens: [
            {
              ...valid.gardens[0],
              careEvents: [
                {
                  id: "care-1",
                  type: "watering",
                  date: "2026-06-01",
                  note: "",
                  targetScope: "planting-area",
                  growingAreaId: "community-bed",
                  growingAreaName: "Plot bed",
                },
              ],
            },
            valid.gardens[1],
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("migrates v4 gardens without changing their existing contents", () => {
    const v4 = {
      version: 4,
      selectedGardenId: "garden-1",
      gardens: [
        {
          id: "garden-1",
          name: "Home garden",
          plan: { widthMeters: 8, depthMeters: 5 },
          growingAreas: [],
          plantings: [],
        },
      ],
    };

    expect(readGardenWorkspace(JSON.stringify(v4))).toEqual({
      version: 10,
      selectedGardenId: "garden-1",
      gardens: [{ ...v4.gardens[0], careEvents: [], careTasks: [], healthRecords: [] }],
      careEvents: [],
      careTasks: [],
    });
  });

  it("migrates v1 and v2 workspaces with measured layouts", () => {
    const v1 = {
      version: 1,
      garden: { id: "garden-1", name: "Backyard garden" },
      growingAreas: [
        {
          id: "area-1",
          name: "North bed",
          kind: "raised-bed",
          layout: {
            widthMeters: 1.2,
            depthMeters: 0.8,
            boundary: [
              { x: 0, y: 0 },
              { x: 1.2, y: 0 },
              { x: 1.2, y: 0.8 },
              { x: 0, y: 0.8 },
            ],
            allocations: [
              {
                id: "allocation-1",
                label: "Tomato",
                x: 0.6,
                y: 0.4,
                diameterMeters: 0.5,
              },
            ],
          },
        },
      ],
    };
    const v2 = {
      version: 2,
      garden: {
        id: "garden-2",
        name: "Side garden",
        plan: { widthMeters: 4, depthMeters: 3 },
      },
      growingAreas: [
        {
          id: "area-2",
          name: "Patio",
          kind: "container",
          planPlacement: { x: 1, y: 2, rotationDegrees: 0 },
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(v1))).toMatchObject({
      version: 10,
      gardens: [
        {
          plan: { widthMeters: 10, depthMeters: 6 },
          growingAreas: [
            {
              planPlacement: { x: 0.5, y: 0.5, rotationDegrees: 0 },
              layout: { allocations: [{ label: "Tomato" }] },
            },
          ],
        },
      ],
    });
    expect(readGardenWorkspace(JSON.stringify(v2))).toMatchObject({
      version: 10,
      selectedGardenId: "garden-2",
      gardens: [
        {
          plan: { widthMeters: 4, depthMeters: 3 },
          growingAreas: [{ name: "Patio" }],
        },
      ],
    });
  });

  it("migrates v5 care events and validates plant-group history", () => {
    const v5 = {
      version: 5,
      selectedGardenId: "garden-1",
      gardens: [
        {
          id: "garden-1",
          name: "Home garden",
          plan: { widthMeters: 8, depthMeters: 5 },
          growingAreas: [
            {
              id: "area-1",
              name: "North bed",
              kind: "raised-bed",
              planPlacement: { x: 1, y: 1, rotationDegrees: 0 },
            },
            {
              id: "area-2",
              name: "South bed",
              kind: "in-ground",
              planPlacement: { x: 3, y: 1, rotationDegrees: 0 },
            },
          ],
          plantings: [
            {
              id: "planting-1",
              commonName: "Tomatoes",
              cropFamily: "nightshade",
              quantity: 4,
              plantingDate: "2026-05-18",
              growingAreaId: "area-1",
              isActive: true,
            },
            {
              id: "planting-2",
              commonName: "Tomatoes",
              cropFamily: "nightshade",
              quantity: 2,
              plantingDate: "2026-05-20",
              growingAreaId: "area-2",
              isActive: true,
            },
          ],
          careEvents: [
            {
              id: "care-1",
              type: "watering",
              date: "2026-06-01",
              note: "",
              targetScope: "planting-area",
              growingAreaId: "area-1",
              growingAreaName: "North bed",
            },
          ],
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(v5))).toMatchObject({
      version: 10,
      gardens: [{ careEvents: [{ targetScope: "planting-area" }], healthRecords: [] }],
    });

    const plantGroupWorkspace = {
      ...v5,
      version: 10,
      careEvents: [],
      careTasks: [],
      gardens: [
        {
          ...v5.gardens[0],
          careTasks: [],
          healthRecords: [],
          careEvents: [
            {
              id: "care-2",
              type: "fertilizing",
              date: "2026-06-02",
              note: "",
              targetScope: "plant-group",
              plantingRecordId: "planting-2",
              plantingRecordName: "Tomatoes · South bed",
            },
          ],
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(plantGroupWorkspace))).toEqual(
      plantGroupWorkspace,
    );
    expect(
      readGardenWorkspace(
        JSON.stringify({
          ...plantGroupWorkspace,
          gardens: [
            {
              ...plantGroupWorkspace.gardens[0],
              plantings: [],
              careEvents: [
                {
                  ...plantGroupWorkspace.gardens[0].careEvents[0],
                  targetPlantingRecordDeleted: true,
                },
              ],
            },
          ],
        }),
      ),
    ).toMatchObject({
      gardens: [
        { careEvents: [{ targetPlantingRecordDeleted: true }] },
      ],
    });
    expect(
      readGardenWorkspace(
        JSON.stringify({
          ...plantGroupWorkspace,
          gardens: [
            {
              ...plantGroupWorkspace.gardens[0],
              careEvents: [
                {
                  ...plantGroupWorkspace.gardens[0].careEvents[0],
                  plantingRecordId: "missing-planting",
                },
              ],
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it("migrates v6 care history into v8 task storage", () => {
    const v6 = {
      version: 6,
      selectedGardenId: "garden-1",
      gardens: [
        {
          id: "garden-1",
          name: "Home garden",
          plan: { widthMeters: 8, depthMeters: 5 },
          growingAreas: [],
          plantings: [],
          careEvents: [],
        },
      ],
    };
    expect(readGardenWorkspace(JSON.stringify(v6))).toEqual({
      version: 10,
      selectedGardenId: "garden-1",
      gardens: [{ ...v6.gardens[0], careTasks: [], healthRecords: [] }],
      careEvents: [],
      careTasks: [],
    });
  });

  it("migrates completed v7 tasks out of the open task list", () => {
    const v7 = {
      version: 7,
      selectedGardenId: "garden-1",
      gardens: [
        {
          id: "garden-1",
          name: "Home garden",
          plan: { widthMeters: 8, depthMeters: 5 },
          growingAreas: [],
          plantings: [],
          careEvents: [
            {
              id: "care-1",
              type: "watering",
              date: "2026-08-31",
              note: "",
              targetScope: "garden",
            },
          ],
          careTasks: [
            {
              id: "completed-task",
              type: "watering",
              dueDate: "2026-08-30",
              note: "",
              targetScope: "garden",
              completedDate: "2026-08-31",
            },
            {
              id: "open-task",
              type: "fertilizing",
              dueDate: "2026-09-07",
              note: "Feed tomatoes",
              targetScope: "garden",
            },
          ],
        },
      ],
    };

    expect(readGardenWorkspace(JSON.stringify(v7))).toMatchObject({
      version: 10,
      gardens: [
        {
          careEvents: [{ id: "care-1" }],
          careTasks: [{ id: "open-task" }],
        },
      ],
    });
  });

  it("validates Garden Plan dimensions and grid-snaps placement values", () => {
    expect(validateGardenPlanDimensions(3, 2)).toBe(true);
    expect(validateGardenPlanDimensions(0, 2)).toBe(false);
    expect(
      clampPlanPosition(
        { x: 3.08, y: -0.03 },
        { widthMeters: 3, depthMeters: 2 },
      ),
    ).toEqual({ x: 3, y: 0 });
    expect(defaultPlanPlacement(4)).toEqual({
      x: 3.5,
      y: 2.5,
      rotationDegrees: 0,
    });
    expect(normalizePlanRotation(-10.2)).toBe(349.8);
  });

  it("validates metric dimensions and keeps duplicate allocations from overlapping", () => {
    const layout = createRectangularLayout(2, 2);
    layout.allocations = [
      { id: "plant-1", label: "Tomato", x: 0.5, y: 0.5, diameterMeters: 0.6 },
    ];
    expect(validateLayoutDimensions(1.2, 0.8)).toBe(true);
    expect(validateLayoutDimensions(0, 0.8)).toBe(false);
    expect(snapToGrid(0.26)).toBe(0.3);
    expect(clampAllocationCenter({ x: 2.2, y: -0.03 }, layout)).toEqual({
      x: 2,
      y: 0,
    });
    expect(findDuplicatePlantPosition(layout.allocations[0], layout)).toEqual({
      x: 1.1,
      y: 0.5,
    });
  });

  it("uses bilingual plant types, varied automatic colors, and manual overrides", () => {
    expect(defaultPlantColor("Tomato")).toBe("#d9534f");
    expect(defaultPlantColor("番茄", "Sun Gold")).toBe("#d9534f");
    expect(defaultPlantColor("茄子")).toBe("#76529a");
    expect(defaultPlantColor("林荫鼠尾草")).toBe("#8a62ad");
    expect(defaultPlantColor("圆锥绣球")).toBe("#d17e9c");
    expect(defaultPlantColor("Unknown perennial")).not.toBe(defaultPlantColor("Another unknown perennial"));
    const allocations = [
      { id: "tomato", label: "Tomato", plantType: "Tomato", x: 0.5, y: 0.5, diameterMeters: 0.3 },
      { id: "sun-gold", label: "Sun Gold", plantType: "Sun Gold", x: 1, y: 0.5, diameterMeters: 0.3 },
      { id: "sage-1", label: "Meadow sage", plantType: "Meadow sage", x: 1.5, y: 0.5, diameterMeters: 0.3 },
      { id: "sage-2", label: "Meadow sage · Caradonna", plantType: "Meadow sage", variety: "Caradonna", x: 2, y: 0.5, diameterMeters: 0.3 },
      { id: "manual", label: "Custom color", plantType: "Custom color", color: "#1f77b4", x: 2.5, y: 0.5, diameterMeters: 0.3 },
    ];
    expect(allocationPlantColor(allocations[0], allocations)).not.toBe(allocationPlantColor(allocations[1], allocations));
    expect(allocationPlantColor(allocations[2], allocations)).toBe(allocationPlantColor(allocations[3], allocations));
    expect(allocationPlantColor(allocations[4], allocations)).toBe("#1f77b4");

    const similarDefaultAllocations = [
      { id: "tomato", label: "Tomato", plantType: "Tomato", x: 0.5, y: 0.5, diameterMeters: 0.3 },
      { id: "hydrangea", label: "Panicle hydrangea", plantType: "Panicle hydrangea", x: 1, y: 0.5, diameterMeters: 0.3 },
    ];
    expect(allocationPlantColor(similarDefaultAllocations[0], similarDefaultAllocations)).toBe("#3d9881");
    expect(allocationPlantColor(similarDefaultAllocations[1], similarDefaultAllocations)).toBe("#d17e9c");

    expect(plantDisplayName({ plantType: "Tomato", variety: "Sun Gold", fallback: "Tomato" })).toBe("Tomato · Sun Gold");
    expect(isPlantColor("#d9534f")).toBe(true);
    expect(isPlantColor("tomato")).toBe(false);
    expect(inferPlantCropFamily("番茄", "Sun Gold")).toBe("nightshade");
    expect(inferPlantCropFamily("Tomato")).toBe("nightshade");
    expect(inferPlantCropFamily("Sungold")).toBe("nightshade");
    expect(inferPlantCropFamily("圆锥绣球")).toBe("other");
  });

  it("focuses a preview on measured growing areas while preserving a full-garden option", () => {
    const workspace = createDemoGardenWorkspace();
    const garden = workspace.gardens[0];

    expect(garden.growingAreas.map((area) => area.planPlacement.rotationDegrees)).toEqual([0, 0, 0]);

    const focused = gardenPlanViewport(
      garden.plan,
      garden.growingAreas,
      "growing-areas",
    );
    const full = gardenPlanViewport(garden.plan, garden.growingAreas, "full");

    expect(focused.widthMeters).toBeLessThan(full.widthMeters);
    expect(focused.depthMeters).toBeLessThanOrEqual(full.depthMeters);
    expect(full).toEqual({ x: 0, y: 0, ...garden.plan });
  });

  it("straightens the unchanged legacy Demo Garden area during workspace restore", () => {
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].growingAreas[1].planPlacement.rotationDegrees = 10;
    delete workspace.gardens[0].growingAreas[1].layout;

    const restored = readGardenWorkspace(JSON.stringify(workspace));

    expect(restored?.gardens[0].growingAreas[1].planPlacement.rotationDegrees).toBe(0);

    workspace.gardens[0].growingAreas[1].planPlacement.rotationDegrees = 20;
    const manuallyRotated = readGardenWorkspace(JSON.stringify(workspace));

    expect(manuallyRotated?.gardens[0].growingAreas[1].planPlacement.rotationDegrees).toBe(20);
  });

  it("moves future planting records into a season plan during workspace restore", () => {
    const workspace = createDemoGardenWorkspace();
    workspace.gardens[0].plantings[0].plantingDate = "2027-05-18";

    const restored = readGardenWorkspace(JSON.stringify(workspace));

    expect(restored?.gardens[0].plantings).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "demo-planting-tomatoes" }),
      ]),
    );
    expect(restored?.gardens[0].seasonPlans).toEqual([
      expect.objectContaining({
        seasonYear: 2027,
        plantings: [
          expect.objectContaining({
            commonName: "Tomatoes",
            cropFamily: "nightshade",
          }),
        ],
      }),
    ]);
  });

  it("calculates task status and repeat dates from calendar dates", () => {
    expect(careTaskStatus({ dueDate: "2026-08-30" }, "2026-08-31")).toBe(
      "overdue",
    );
    expect(careTaskStatus({ dueDate: "2026-08-31" }, "2026-08-31")).toBe(
      "due-today",
    );
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});
