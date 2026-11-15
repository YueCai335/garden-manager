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

/** Blend two viewports for a zoom animation; progress runs 0 → 1 with ease-in-out. */
export function interpolateViewport(from: GardenPlanViewport, to: GardenPlanViewport, progress: number): GardenPlanViewport {
  const t = Math.min(1, Math.max(0, progress));
  const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  const blend = (start: number, end: number) => start + (end - start) * eased;
  return {
    x: blend(from.x, to.x),
    y: blend(from.y, to.y),
    widthMeters: blend(from.widthMeters, to.widthMeters),
    depthMeters: blend(from.depthMeters, to.depthMeters),
  };
}

/** Canvas pixels kept clear on each side for floating layers (ADR-0073 S4). */
export type CanvasInsets = { top: number; right: number; bottom: number; left: number };
export const noInsets: CanvasInsets = { top: 0, right: 0, bottom: 0, left: 0 };
export type OverlayCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Insets that keep every floating layer out of the framed region. A layer in a
 * top corner reserves a band down to its bottom edge, except the top-right panel,
 * which reserves a band from its left edge to the right side (it runs most of the
 * canvas height). Layers in bottom corners reserve a band from their top edge down.
 * Each layer then lies wholly inside a reserved band, so the free rectangle never
 * meets one. Rectangles are relative to the canvas surface. Insets that would
 * leave no room at all fall back to none.
 */
export function overlayInsets(
  surface: { width: number; height: number },
  layers: { corner: OverlayCorner; left: number; top: number; right: number; bottom: number }[],
  gap = 12,
): CanvasInsets {
  const insets = { ...noInsets };
  for (const layer of layers) {
    if (layer.right <= layer.left || layer.bottom <= layer.top) continue;
    if (layer.corner === "top-left") insets.top = Math.max(insets.top, layer.bottom + gap);
    else if (layer.corner === "top-right") insets.right = Math.max(insets.right, surface.width - layer.left + gap);
    else insets.bottom = Math.max(insets.bottom, surface.height - layer.top + gap);
  }
  // Layers that would leave no free room (such as before layout) reserve nothing.
  if (insets.top + insets.bottom >= surface.height || insets.left + insets.right >= surface.width) return { ...noInsets };
  return insets;
}

/**
 * The viewport that, fitted to the whole canvas with `fitCanvas`, centres
 * `target` inside the canvas minus `insets`. Rendering and pointer conversion keep
 * using one ordinary transform; only the framed region moves. Insets that leave no
 * room fall back to the plain target.
 */
export function insetViewport(target: GardenPlanViewport, width: number, height: number, padding: number, insets: CanvasInsets): GardenPlanViewport {
  const freeWidth = width - insets.left - insets.right - padding * 2;
  const freeHeight = height - insets.top - insets.bottom - padding * 2;
  if (!(insets.top || insets.right || insets.bottom || insets.left)) return target;
  if (freeWidth <= 0 || freeHeight <= 0 || width <= padding * 2 || height <= padding * 2 || target.widthMeters <= 0 || target.depthMeters <= 0) return target;
  const scale = Math.min(freeWidth / target.widthMeters, freeHeight / target.depthMeters);
  const left = insets.left + padding + (freeWidth - target.widthMeters * scale) / 2;
  const top = insets.top + padding + (freeHeight - target.depthMeters * scale) / 2;
  return {
    x: target.x - (left - padding) / scale,
    y: target.y - (top - padding) / scale,
    widthMeters: (width - padding * 2) / scale,
    depthMeters: (height - padding * 2) / scale,
  };
}
