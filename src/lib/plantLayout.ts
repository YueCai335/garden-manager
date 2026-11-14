import { snapToGrid, type GrowingAreaLayout, type LayoutPoint, type PlantAllocation } from "@/lib/gardenWorkspace";

/** Two plants are crowded when their centres are closer than 85 % of their average spacing. */
export const CROWDING_RATIO = 0.85;
/** One Fill places at most this many plants. */
export const FILL_LIMIT = 80;
// Centres snap to a 0.1 m grid, so a circle may reach up to 5 cm past where it was aimed.
const EDGE_TOLERANCE = 0.051;

type Spaced = Pick<PlantAllocation, "x" | "y" | "diameterMeters">;
type Size = Pick<GrowingAreaLayout, "widthMeters" | "depthMeters">;

export function arePlantsCrowded(a: Spaced, b: Spaced) {
  return Math.hypot(a.x - b.x, a.y - b.y) < (CROWDING_RATIO * (a.diameterMeters + b.diameterMeters)) / 2;
}

/** Whether a plant's spacing circle reaches past its area's edge. */
export function plantReachesPastEdge(plant: Spaced, layout: Size) {
  const radius = plant.diameterMeters / 2;
  return plant.x - radius < -EDGE_TOLERANCE || plant.y - radius < -EDGE_TOLERANCE ||
    plant.x + radius > layout.widthMeters + EDGE_TOLERANCE || plant.y + radius > layout.depthMeters + EDGE_TOLERANCE;
}

export type PlantWarnings = {
  /** Each crowded pair once, by allocation id. */
  crowdedPairs: [string, string][];
  /** Every plant in at least one crowded pair. */
  crowdedIds: Set<string>;
  /** Plants whose spacing circle reaches past the area's edge. */
  pastEdgeIds: Set<string>;
};

/** Warnings only; they never block an edit (ADR-0072). */
export function plantWarnings(layout: GrowingAreaLayout): PlantWarnings {
  const crowdedPairs: [string, string][] = [];
  const crowdedIds = new Set<string>();
  const plants = layout.allocations;
  for (let first = 0; first < plants.length; first += 1) {
    for (let second = first + 1; second < plants.length; second += 1) {
      if (!arePlantsCrowded(plants[first], plants[second])) continue;
      crowdedPairs.push([plants[first].id, plants[second].id]);
      crowdedIds.add(plants[first].id);
      crowdedIds.add(plants[second].id);
    }
  }
  return { crowdedPairs, crowdedIds, pastEdgeIds: new Set(plants.filter((plant) => plantReachesPastEdge(plant, layout)).map((plant) => plant.id)) };
}

/**
 * Where a plant aimed at `point` lands: snapped to the 0.1 m grid and moved
 * inward so its spacing circle stays inside the area when the area is large
 * enough. A plant wider than the area sits on the area's centre line.
 */
export function plantCenterInArea(point: LayoutPoint, diameterMeters: number, layout: Size): LayoutPoint {
  const axis = (value: number, size: number) => {
    const radius = diameterMeters / 2;
    if (diameterMeters >= size) return snapToGrid(size / 2);
    const low = Math.ceil((radius - 1e-9) * 10) / 10;
    const high = Math.floor((size - radius + 1e-9) * 10) / 10;
    return low > high ? snapToGrid(size / 2) : Math.min(Math.max(snapToGrid(value), low), high);
  };
  return { x: axis(point.x, layout.widthMeters), y: axis(point.y, layout.depthMeters) };
}

/**
 * Fill positions for one plant type: as many rows and columns at the plant's
 * spacing as fit, centred in the area and snapped to the 0.1 m grid, skipping
 * any spot that would crowd a plant already in the area. Centring shifts every
 * spot by the same amount, so snapping keeps the spacing between them.
 */
export function fillPositions(layout: GrowingAreaLayout, diameterMeters: number, limit = FILL_LIMIT) {
  const axis = (size: number) => {
    const count = Math.max(1, Math.floor(size / diameterMeters + 1e-9));
    const margin = (size - (count - 1) * diameterMeters) / 2;
    return Array.from({ length: count }, (_, index) => snapToGrid(margin + index * diameterMeters));
  };
  const columns = axis(layout.widthMeters);
  const rows = axis(layout.depthMeters);
  const positions: LayoutPoint[] = [];
  let truncated = false;
  for (const y of rows) {
    for (const x of columns) {
      const candidate = { x, y, diameterMeters };
      if (layout.allocations.some((other) => arePlantsCrowded(candidate, other))) continue;
      if (positions.length >= limit) { truncated = true; break; }
      positions.push({ x, y });
    }
    if (truncated) break;
  }
  return { positions, truncated };
}

/** Plant groups as care records see them: one group per plant type and variety (ADR-0038). */
export function plantGroups(layout: GrowingAreaLayout) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const plant of layout.allocations) {
    const key = `${plant.plantType ?? plant.label}\u0000${plant.variety ?? ""}`.trim().toLocaleLowerCase();
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { label: plant.label, count: 1 });
  }
  return [...groups.values()];
}
