import type { GardenPlanViewport, LayoutPoint } from "./gardenWorkspace";

export type CanvasTransform = { width: number; height: number; padding: number; scale: number; bounds: GardenPlanViewport };

/** One transform for rendering and pointer conversion; no minimum scale that can overflow. */
export function fitCanvas(bounds: GardenPlanViewport, width: number, height: number, padding = 34): CanvasTransform | undefined {
  if (![width, height, bounds.x, bounds.y, bounds.widthMeters, bounds.depthMeters].every(Number.isFinite) || width <= padding * 2 || height <= padding * 2 || bounds.widthMeters <= 0 || bounds.depthMeters <= 0) return;
  const scale = Math.min((width - padding * 2) / bounds.widthMeters, (height - padding * 2) / bounds.depthMeters);
  return { width, height, padding, scale, bounds: { ...bounds } };
}
export function canvasToMetres(point: LayoutPoint, transform: CanvasTransform): LayoutPoint {
  return { x: (point.x - transform.padding) / transform.scale + transform.bounds.x, y: (point.y - transform.padding) / transform.scale + transform.bounds.y };
}
export function metresToCanvas(point: LayoutPoint, transform: CanvasTransform): LayoutPoint {
  return { x: transform.padding + (point.x - transform.bounds.x) * transform.scale, y: transform.padding + (point.y - transform.bounds.y) * transform.scale };
}

/** Limit grid density to readable ticks, including very large gardens. */
export function canvasGridTicks(start: number, end: number, scale: number) {
  if (![start, end, scale].every(Number.isFinite) || scale <= 0 || end < start) return [];
  const minimumStep = Math.max(1, 48 / scale, (end - start) / 80);
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const step = ([1, 2, 5, 10].find((value) => value * magnitude >= minimumStep) ?? 10) * magnitude;
  const first = Math.ceil(start / step) * step;
  return Array.from({ length: Math.min(81, Math.max(0, Math.floor((end - first) / step) + 1)) }, (_, index) => first + index * step);
}
