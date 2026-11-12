import type { GardenPlanViewport, GrowingArea, GrowingAreaKind, GrowingAreaLayout } from "@/lib/gardenWorkspace";

/**
 * How each planting-area type is drawn on the Garden Plan canvas (ADR-0072, phase G1).
 * Konva draws to a canvas and cannot read CSS custom properties, so the plan colours
 * live here in one place. The app has a single light theme today.
 */
export type AreaAppearance = {
  fill: string;
  stroke: string;
  /** Outline width in canvas pixels on the full plan; thumbnails scale it down. */
  strokeWidth: number;
  dash?: number[];
  /** Draw a rounded outline (containers). */
  rounded?: boolean;
  /** Draw a ridge line along the longer side (greenhouses). */
  ridge?: boolean;
};

export const areaAppearances: Record<GrowingAreaKind, AreaAppearance> = {
  // Light soil inside a heavy wooden frame.
  "raised-bed": { fill: "#dcc09a", stroke: "#7a5232", strokeWidth: 4 },
  // Dark soil with a dashed edge: no frame, planted straight into the ground.
  "in-ground": { fill: "#8c6a4f", stroke: "#5e4533", strokeWidth: 2, dash: [6, 4] },
  // Terracotta pots with a rounded outline.
  container: { fill: "#d39a7a", stroke: "#9a5d3e", strokeWidth: 2, rounded: true },
  // Glass fill with a ridge line.
  greenhouse: { fill: "#d5e8ec", stroke: "#6f9aa5", strokeWidth: 2, ridge: true },
};

export const planColors = {
  ground: "#f8fbf6",
  boundary: "#183a2a",
  grid: "#cfd7ce",
  label: "#183a2a",
  mutedLabel: "#59665e",
  selection: "#2f6846",
} as const;

export function areaAppearance(kind: GrowingAreaKind, compact = false): AreaAppearance {
  const appearance = areaAppearances[kind];
  return compact ? { ...appearance, strokeWidth: Math.max(1, appearance.strokeWidth / 2), dash: appearance.dash?.map((value) => value / 2) } : appearance;
}

/** True when the boundary is the axis-aligned rectangle that createRectangularLayout produces. */
export function isRectangularLayout(layout: GrowingAreaLayout) {
  const { widthMeters: w, depthMeters: d, boundary } = layout;
  const corners = [[0, 0], [w, 0], [w, d], [0, d]];
  return boundary.length === 4 && boundary.every((point, index) => Math.abs(point.x - corners[index][0]) < 1e-9 && Math.abs(point.y - corners[index][1]) < 1e-9);
}

/** Endpoints of a greenhouse ridge, in area-local metres, along the longer side. */
export function ridgeLine(layout: GrowingAreaLayout) {
  const { widthMeters: w, depthMeters: d } = layout;
  return w >= d ? [0, d / 2, w, d / 2] : [w / 2, 0, w / 2, d];
}

const LABEL_HEIGHT = 16;
// Leaves room for the 4 px selection ring plus its stroke between a label and the outline.
const LABEL_GAP = 8;
const MIN_LABEL_WIDTH = 48;
const MAX_LABEL_WIDTH = 180;

/**
 * Canvas box for an area name: above the area outline, as wide as the area plus a small
 * margin (truncated with an ellipsis), and below the outline when there is no room above.
 * Names never sit inside the outline, so they never cover plants.
 */
export function areaLabelPosition(area: GrowingArea, scale: number, padding: number, viewport: GardenPlanViewport) {
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const origin = {
    x: padding + (area.planPlacement.x - viewport.x) * scale,
    y: padding + (area.planPlacement.y - viewport.y) * scale,
  };
  const points = area.layout!.boundary.map((point) => ({
    x: origin.x + point.x * scale * Math.cos(angle) - point.y * scale * Math.sin(angle),
    y: origin.y + point.x * scale * Math.sin(angle) + point.y * scale * Math.cos(angle),
  }));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const width = Math.max(MIN_LABEL_WIDTH, Math.min(MAX_LABEL_WIDTH, right - left + 16));
  const above = top - LABEL_HEIGHT - LABEL_GAP;
  const placedAbove = above >= LABEL_GAP;
  const y = placedAbove ? above : bottom + LABEL_GAP;
  // The size line sits under the outline, below the name when the name also had to go there.
  const sizeY = placedAbove ? bottom + LABEL_GAP : bottom + LABEL_GAP + LABEL_HEIGHT;
  return { width, x: (left + right - width) / 2, y, sizeY, left, right, top, bottom };
}

export function areaSizeText(layout: GrowingAreaLayout) {
  return `${layout.widthMeters} × ${layout.depthMeters} m`;
}
