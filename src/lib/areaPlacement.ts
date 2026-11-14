import {
  areaPlanCorners,
  clampAllocationCenter,
  createRectangularLayout,
  snapToGrid,
  type GardenPlan,
  type GrowingArea,
  type GrowingAreaKind,
  type GrowingAreaLayout,
  type LayoutPoint,
} from "@/lib/gardenWorkspace";

/**
 * Standard sizes for the "Add a planting area" buttons (ADR-0072, phase G4).
 * Width runs left to right (widthMeters); length runs top to bottom (depthMeters).
 */
export const areaKindDefaults: Record<GrowingAreaKind, { widthMeters: number; depthMeters: number }> = {
  "raised-bed": { widthMeters: 1.2, depthMeters: 2.4 },
  "in-ground": { widthMeters: 2, depthMeters: 3 },
  container: { widthMeters: 0.6, depthMeters: 0.6 },
  greenhouse: { widthMeters: 2.5, depthMeters: 3 },
};

/** The gap kept around existing areas, so a new bed leaves room to walk. */
export const AREA_CLEARANCE = 0.3;
/** Candidate positions sit on a half-metre grid, starting half a metre in from the edge. */
const SEARCH_STEP = 0.5;
const EPSILON = 1e-6;

export type AreaSpot = LayoutPoint & {
  widthMeters: number;
  depthMeters: number;
  /** The garden was smaller than the requested size, so the area was shrunk to fit. */
  resized: boolean;
  /** No free position existed; the area is centred and overlaps another area. */
  overlaps: boolean;
};

type Box = { left: number; top: number; right: number; bottom: number };

function boundingBox(points: LayoutPoint[]): Box {
  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function boxesOverlap(a: Box, b: Box) {
  return a.left < b.right - EPSILON && b.left < a.right - EPSILON && a.top < b.bottom - EPSILON && b.top < a.bottom - EPSILON;
}

/** Positions from the near edge to `room` (the free length) in half-metre steps, ending at the far edge. */
function candidates(room: number) {
  if (room < -EPSILON) return [];
  const start = room >= SEARCH_STEP ? SEARCH_STEP : 0;
  const values: number[] = [];
  for (let value = start; value <= room + EPSILON; value += SEARCH_STEP) values.push(snapToGrid(value));
  // The last position is flush with the far edge, rounded down so the area stays inside.
  const last = Math.max(0, Math.floor(room * 10 + EPSILON) / 10);
  if (!values.length || values[values.length - 1] < last - EPSILON) values.push(last);
  return [...new Set(values)];
}

/**
 * Finds where a new, unrotated rectangular area goes: the first position in
 * reading order (top to bottom, left to right) that stays inside the garden
 * and keeps AREA_CLEARANCE from every sized area. When no position has that
 * clearance, it accepts a position that only touches its neighbours. When the
 * garden is full, the area is centred and marked as overlapping; overlap is a
 * warning, never a blocker. A garden smaller than the requested size shrinks
 * the area to the garden.
 */
export function findFreeAreaSpot(plan: GardenPlan, areas: GrowingArea[], size: { widthMeters: number; depthMeters: number }): AreaSpot {
  const widthMeters = Math.max(0.1, Math.min(size.widthMeters, Math.floor(plan.widthMeters * 10) / 10));
  const depthMeters = Math.max(0.1, Math.min(size.depthMeters, Math.floor(plan.depthMeters * 10) / 10));
  const resized = widthMeters !== size.widthMeters || depthMeters !== size.depthMeters;
  const occupied = areas.filter((area) => area.layout).map((area) => boundingBox(areaPlanCorners(area)));
  const xs = candidates(plan.widthMeters - widthMeters);
  const ys = candidates(plan.depthMeters - depthMeters);
  for (const clearance of [AREA_CLEARANCE, 0]) {
    for (const y of ys) {
      for (const x of xs) {
        const box = { left: x - clearance, top: y - clearance, right: x + widthMeters + clearance, bottom: y + depthMeters + clearance };
        if (!occupied.some((other) => boxesOverlap(box, other))) return { x, y, widthMeters, depthMeters, resized, overlaps: false };
      }
    }
  }
  return {
    x: snapToGrid(Math.max(0, (plan.widthMeters - widthMeters) / 2)),
    y: snapToGrid(Math.max(0, (plan.depthMeters - depthMeters) / 2)),
    widthMeters,
    depthMeters,
    resized,
    overlaps: occupied.length > 0,
  };
}

/** "Raised bed 2": the type's label and the next number no other area name uses. */
export function defaultAreaName(label: string, areas: Pick<GrowingArea, "name">[]) {
  const names = new Set(areas.map((area) => area.name.trim().toLowerCase()));
  for (let number = 1; ; number++) {
    const name = `${label} ${number}`;
    if (!names.has(name.toLowerCase())) return name;
  }
}

/**
 * The size a corner-handle drag asks for: the handle's position in the area's
 * own metres, snapped to the 0.1 m grid, at least 0.1 m, and, for an unrotated
 * area, no wider or longer than the garden edge allows.
 */
export function resizedAreaSize(handle: LayoutPoint, area: Pick<GrowingArea, "planPlacement">, plan: GardenPlan) {
  const unrotated = area.planPlacement.rotationDegrees === 0;
  const maxWidth = unrotated ? Math.max(0.1, snapToGrid(plan.widthMeters - area.planPlacement.x)) : Infinity;
  const maxDepth = unrotated ? Math.max(0.1, snapToGrid(plan.depthMeters - area.planPlacement.y)) : Infinity;
  return {
    widthMeters: Math.min(maxWidth, Math.max(0.1, snapToGrid(handle.x))),
    depthMeters: Math.min(maxDepth, Math.max(0.1, snapToGrid(handle.y))),
  };
}

/** A new rectangular layout at `size`, keeping plant centres inside it (like the properties form). */
export function resizeLayout(layout: GrowingAreaLayout, size: { widthMeters: number; depthMeters: number }): GrowingAreaLayout {
  const next = createRectangularLayout(size.widthMeters, size.depthMeters);
  return {
    ...next,
    allocations: layout.allocations.map((allocation) => ({ ...allocation, ...clampAllocationCenter(allocation, next) })),
  };
}

function projection(points: LayoutPoint[], axis: LayoutPoint) {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y);
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Whether two areas' outlines overlap on the plan, after placement and
 * rotation. Outlines that only touch along an edge do not overlap. Uses the
 * separating-axis test, which holds for convex outlines; every area the
 * editor creates is a rectangle.
 */
export function areasOverlap(a: GrowingArea, b: GrowingArea) {
  const first = areaPlanCorners(a);
  const second = areaPlanCorners(b);
  if (first.length < 3 || second.length < 3) return false;
  for (const polygon of [first, second]) {
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      const axis = { x: start.y - end.y, y: end.x - start.x };
      const length = Math.hypot(axis.x, axis.y);
      if (length < EPSILON) continue;
      const unit = { x: axis.x / length, y: axis.y / length };
      const p = projection(first, unit);
      const q = projection(second, unit);
      if (p.max <= q.min + EPSILON || q.max <= p.min + EPSILON) return false;
    }
  }
  return true;
}

/** Every pair of sized areas whose outlines overlap, and the ids involved. */
export function overlappingAreas(areas: GrowingArea[]) {
  const sized = areas.filter((area) => area.layout);
  const pairs: [GrowingArea, GrowingArea][] = [];
  for (let i = 0; i < sized.length; i++)
    for (let j = i + 1; j < sized.length; j++)
      if (areasOverlap(sized[i], sized[j])) pairs.push([sized[i], sized[j]]);
  return { pairs, ids: new Set(pairs.flat().map((area) => area.id)) };
}
