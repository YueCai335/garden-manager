import type { GrowingArea, LayoutPoint } from "@/lib/gardenWorkspace";

/**
 * Converts between garden-plan metres and one planting area's local metres.
 * An area is placed at `planPlacement` (its local origin) and rotated
 * clockwise by `rotationDegrees` around that origin, the same way Konva draws
 * the area's group. Plants are stored in local metres (ADR-0014).
 */
export function areaLocalToPlan(area: Pick<GrowingArea, "planPlacement">, point: LayoutPoint): LayoutPoint {
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: area.planPlacement.x + point.x * cos - point.y * sin,
    y: area.planPlacement.y + point.x * sin + point.y * cos,
  };
}

/** The inverse of `areaLocalToPlan`: a plan point in the area's own metres. */
export function planToAreaLocal(area: Pick<GrowingArea, "planPlacement">, point: LayoutPoint): LayoutPoint {
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - area.planPlacement.x;
  const dy = point.y - area.planPlacement.y;
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}

/** Whether a local point lies inside the area's rectangle, with a small tolerance for rounding. */
export function isInsideArea(area: Pick<GrowingArea, "layout">, point: LayoutPoint, tolerance = 1e-6) {
  const layout = area.layout;
  return Boolean(layout) && point.x >= -tolerance && point.y >= -tolerance && point.x <= layout!.widthMeters + tolerance && point.y <= layout!.depthMeters + tolerance;
}
