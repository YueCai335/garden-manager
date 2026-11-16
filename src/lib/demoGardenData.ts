import type { GardenPlan, GrowingAreaKind } from "@/lib/gardenWorkspace";

/**
 * The showcase behind "Load demo garden" (ADR-0077): three gardens for three
 * common situations, a home vegetable backyard, a flower front yard, and a shared
 * community plot. The layout is a copy of the owner's own planned gardens from
 * 2026-11-16. createDemoGardenWorkspace turns it into a workspace whose dates
 * count from the visitor's today, so the demo never looks stale.
 *
 * Each plant entry is one plant type in one area; `at` lists each plant's
 * position and spacing diameter in metres, measured from the area's corner.
 */
export type DemoPlantGroup = { type: string; plantedDaysAgo: number; at: Array<[x: number, y: number, diameter: number]> };
export type DemoAreaData = {
  id: string;
  name: string;
  kind: GrowingAreaKind;
  x: number;
  y: number;
  rotation: number;
  width: number;
  depth: number;
  plants: DemoPlantGroup[];
};
export type DemoGardenData = { id: string; name: string; plan: GardenPlan; areas: DemoAreaData[] };

export const demoGardenData: DemoGardenData[] = [
  {
    id: "demo-backyard",
    name: "Backyard",
    plan: { widthMeters: 15, depthMeters: 7.5 },
    areas: [
      { id: "demo-backyard-raised-bed-1", name: "Raised bed 1", kind: "raised-bed", x: 1, y: 0.9, rotation: 0, width: 0.9, depth: 2.1, plants: [
        { type: "Pepper", plantedDaysAgo: 0, at: [[0.3, 0.3, 0.5]] },
        { type: "Meadow sage", plantedDaysAgo: 0, at: [[0.2, 0.8, 0.3], [0.2, 1.2, 0.3], [0.2, 1.6, 0.3], [0.6, 0.8, 0.3], [0.6, 1.2, 0.2], [0.5, 1.6, 0.2]] },
      ] },
      { id: "demo-backyard-raised-bed-2", name: "Raised bed 2", kind: "raised-bed", x: 2.4, y: 0.9, rotation: 0, width: 1, depth: 2.1, plants: [
        { type: "Lettuce", plantedDaysAgo: 0, at: [[0.1, 0.2, 0.2], [0.3, 0.2, 0.2], [0.5, 0.2, 0.2], [0.7, 0.2, 0.2], [0.9, 0.2, 0.2], [0.1, 0.4, 0.2], [0.3, 0.4, 0.2], [0.5, 0.4, 0.2], [0.7, 0.4, 0.2], [0.9, 0.4, 0.2], [0.1, 0.6, 0.2], [0.3, 0.6, 0.2], [0.5, 0.6, 0.2], [0.7, 0.6, 0.2], [0.9, 0.6, 0.2], [0.1, 0.8, 0.2], [0.3, 0.8, 0.2], [0.5, 0.8, 0.2], [0.7, 0.8, 0.2], [0.9, 0.8, 0.2], [0.1, 1, 0.2], [0.3, 1, 0.2], [0.5, 1, 0.2], [0.7, 1, 0.2], [0.9, 1, 0.2], [0.1, 1.2, 0.2], [0.3, 1.2, 0.2], [0.5, 1.2, 0.2], [0.7, 1.2, 0.2], [0.9, 1.2, 0.2], [0.1, 1.4, 0.2], [0.3, 1.4, 0.2], [0.5, 1.4, 0.2], [0.7, 1.4, 0.2], [0.9, 1.4, 0.2], [0.1, 1.6, 0.2], [0.3, 1.6, 0.2], [0.5, 1.6, 0.2], [0.7, 1.6, 0.2], [0.9, 1.6, 0.2], [0.1, 1.8, 0.2], [0.3, 1.8, 0.2], [0.5, 1.8, 0.2], [0.7, 1.8, 0.2], [0.9, 1.8, 0.2], [0.1, 2, 0.2], [0.3, 2, 0.2], [0.5, 2, 0.2], [0.7, 2, 0.2], [0.9, 2, 0.2]] },
      ] },
      { id: "demo-backyard-raised-bed-3", name: "Raised bed 3", kind: "raised-bed", x: 3.9, y: 0.8, rotation: 0, width: 1, depth: 2.2, plants: [
        { type: "Carrot", plantedDaysAgo: 0, at: [[0.3, 0.3, 0.4], [0.7, 0.3, 0.4], [0.3, 0.7, 0.4], [0.7, 0.7, 0.4], [0.3, 1.1, 0.4], [0.7, 1.1, 0.4], [0.3, 1.5, 0.4], [0.7, 1.5, 0.4], [0.3, 1.9, 0.4], [0.7, 1.9, 0.4]] },
      ] },
      { id: "demo-backyard-raised-bed-4", name: "Raised bed 4", kind: "raised-bed", x: 5.6, y: 0.8, rotation: 0, width: 1, depth: 2.2, plants: [] },
      { id: "demo-backyard-raised-bed-5", name: "Raised bed 5", kind: "raised-bed", x: 7.4, y: 0.8, rotation: 0, width: 1, depth: 2.1, plants: [] },
      { id: "demo-backyard-container-1", name: "Container 1", kind: "container", x: 1.7, y: 4.3, rotation: 0, width: 1, depth: 1, plants: [
        { type: "Eggplant", plantedDaysAgo: 1, at: [[0.5, 0.5, 0.6]] },
      ] },
      { id: "demo-backyard-container-2", name: "container 2", kind: "container", x: 13.6, y: 1, rotation: 90, width: 0.5, depth: 0.8, plants: [] },
      { id: "demo-backyard-greenhouse-1", name: "Greenhouse 1", kind: "greenhouse", x: 10.7, y: 3.8, rotation: 0, width: 2, depth: 2.5, plants: [] },
      { id: "demo-backyard-container-3", name: "Container 3", kind: "container", x: 9.9, y: 0.8, rotation: 0, width: 0.6, depth: 0.6, plants: [
        { type: "Marigold", plantedDaysAgo: 0, at: [[0.3, 0.3, 0.3]] },
      ] },
      { id: "demo-backyard-greenhouse-2", name: "Greenhouse 2", kind: "greenhouse", x: 5.1, y: 4, rotation: 0, width: 2.5, depth: 3, plants: [
        { type: "Sunflower", plantedDaysAgo: 0, at: [[0.4, 0.5, 0.3], [1, 0.5, 0.3]] },
        { type: "Squash", plantedDaysAgo: 0, at: [[1.9, 0.8, 1.2], [1.9, 2.2, 1.2]] },
      ] },
    ],
  },
  {
    id: "demo-community-garden",
    name: "Community Garden",
    plan: { widthMeters: 4, depthMeters: 4 },
    areas: [
      { id: "demo-community-garden-bed-1", name: "1", kind: "raised-bed", x: 0.4, y: 0.2, rotation: 0, width: 0.8, depth: 1.6, plants: [
        { type: "Eggplant", plantedDaysAgo: 0, at: [[0.2, 0.4, 0.3], [0.6, 0.4, 0.3], [0.2, 1.2, 0.3], [0.6, 1.2, 0.3]] },
        { type: "Kale", plantedDaysAgo: 0, at: [[0.2, 0.8, 0.2], [0.6, 0.8, 0.2], [0.4, 0.1, 0.2], [0.4, 1.4, 0.2]] },
      ] },
      { id: "demo-community-garden-bed-2", name: "2", kind: "raised-bed", x: 1.9, y: 0.2, rotation: 0, width: 0.7, depth: 1.6, plants: [
        { type: "Cucumber", plantedDaysAgo: 0, at: [[0.3, 0.4, 0.6], [0.4, 1.2, 0.6]] },
      ] },
      { id: "demo-community-garden-raised-bed-1", name: "Raised bed 1", kind: "raised-bed", x: 0.4, y: 2.1, rotation: 0, width: 0.8, depth: 1.6, plants: [] },
      { id: "demo-community-garden-raised-bed-2", name: "Raised bed 2", kind: "raised-bed", x: 2, y: 2.1, rotation: 0, width: 0.7, depth: 1.6, plants: [
        { type: "Bean", plantedDaysAgo: 0, at: [[0.5, 0.2, 0.2], [0.2, 0.2, 0.2]] },
        { type: "Basil", plantedDaysAgo: 0, at: [[0.2, 0.6, 0.3], [0.5, 0.6, 0.3]] },
      ] },
      { id: "demo-community-garden-container-1", name: "Container 1", kind: "container", x: 3.1, y: 0.8, rotation: 0, width: 0.6, depth: 0.6, plants: [
        { type: "Tomato", plantedDaysAgo: 0, at: [[0.3, 0.3, 0.5], [0.3, 0.3, 0.5]] },
      ] },
      { id: "demo-community-garden-container-2", name: "Container 2", kind: "container", x: 3, y: 2.7, rotation: 0, width: 0.6, depth: 0.6, plants: [] },
    ],
  },
  {
    id: "demo-front-yard",
    name: "Front Yard",
    plan: { widthMeters: 10, depthMeters: 6 },
    areas: [
      { id: "demo-front-yard-in-ground-bed-1", name: "In-ground bed 1", kind: "in-ground", x: 2.9, y: 0.7, rotation: 0, width: 4.9, depth: 1.7, plants: [
        { type: "Panicle hydrangea", plantedDaysAgo: 0, at: [[0.6, 0.8, 1], [2.5, 0.8, 1], [4.2, 0.8, 1]] },
      ] },
      { id: "demo-front-yard-in-ground-bed-2", name: "In-ground bed 2", kind: "in-ground", x: 2.9, y: 2.6, rotation: 0, width: 0.8, depth: 2.3, plants: [
        { type: "Sunflower", plantedDaysAgo: 0, at: [[0.4, 0.4, 0.5], [0.4, 1.2, 0.5], [0.4, 1.9, 0.5]] },
      ] },
      { id: "demo-front-yard-in-ground-bed-3", name: "In-ground bed 3", kind: "in-ground", x: 0.2, y: 5, rotation: 0, width: 2.7, depth: 0.8, plants: [
        { type: "Marigold", plantedDaysAgo: 0, at: [[0.2, 0.3, 0.3], [0.5, 0.3, 0.3], [0.8, 0.3, 0.3], [1.1, 0.3, 0.3], [1.4, 0.3, 0.3], [1.7, 0.3, 0.3], [2, 0.3, 0.3], [2.3, 0.3, 0.3], [2.6, 0.3, 0.3], [0.2, 0.6, 0.3], [0.5, 0.6, 0.3], [0.8, 0.6, 0.3], [1.1, 0.6, 0.3], [1.4, 0.6, 0.3], [1.7, 0.6, 0.3], [2, 0.6, 0.3], [2.3, 0.6, 0.3], [2.6, 0.6, 0.3]] },
      ] },
    ],
  },
];

/** Workspace-wide care in the demo: fertilize every garden weekly, first due in four days. */
export const demoWorkspaceCare = [
  { id: "demo-fertilize-all-gardens", type: "fertilizing", dueInDays: 4, repeatIntervalDays: 7 },
] as const;
