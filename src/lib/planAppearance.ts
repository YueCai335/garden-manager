import {
  inferPlantCropFamily,
  plantingCropFamilies,
  type GardenPlanViewport,
  type GrowingArea,
  type GrowingAreaKind,
  type GrowingAreaLayout,
  type PlantAllocation,
  type PlantingCropFamily,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";

/**
 * How each planting-area type is drawn on the Garden Plan canvas (ADR-0072 G1,
 * restyled as a pale planting chart by ADR-0073 S4). Konva draws to a canvas and
 * cannot read CSS custom properties, so the plan colours live here in one place and
 * mirror `src/styles/tokens.css`. The app has a single light theme today.
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
  /** Draw a faint drop shadow under the outline (framed beds and pots). */
  shadow?: boolean;
};

export const areaAppearances: Record<GrowingAreaKind, AreaAppearance> = {
  // Pale soil inside a thin wood-brown frame.
  "raised-bed": { fill: "#f1ece4", stroke: "#8c6a48", strokeWidth: 4, shadow: true },
  // Slightly darker soil with a dashed edge: no frame, planted straight into the ground.
  "in-ground": { fill: "#ece6dc", stroke: "#7a6650", strokeWidth: 1.5, dash: [7, 5] },
  // Round pots with a terracotta rim.
  container: { fill: "#f1ece4", stroke: "#b5704e", strokeWidth: 4, rounded: true, shadow: true },
  // Pale-blue glass with a ridge line.
  greenhouse: { fill: "#e4eff2", stroke: "#6f97a3", strokeWidth: 2, ridge: true },
};

export const planColors = {
  /** The garden ground inside the boundary; the dot grid outside it is CSS on the canvas surface. */
  ground: "#fafafa",
  /** The garden boundary: content green (ADR-0073). */
  boundary: "#1f4230",
  grid: "#e2e2e0",
  label: "#18181a",
  mutedLabel: "#5f5f63",
  ruler: "#8d8d91",
  /** The selection ring and handles: content green. */
  selection: "#1f4230",
  /** Drawn behind plant-group labels so they stay readable over soil. */
  labelHalo: "rgba(250, 250, 250, 0.9)",
  shadow: "rgba(0, 0, 0, 0.07)",
  /** Crowded plants and plants that reach past their area's edge. */
  warning: "#b45309",
} as const;

export type PlantColors = { fill: string; stroke: string };

/**
 * Plant circles take the colours of their crop family (ADR-0073 S4), the same
 * families the rotation warnings use (ADR-0025). Fills are light and strokes are
 * dark, with at least 3:1 contrast between a stroke and its fill, the soil, and the
 * ground. "Other" is a neutral grey. The stored per-plant `color` field is kept in
 * the data but no longer drawn.
 */
export const cropFamilyColors: Record<PlantingCropFamily, PlantColors> = {
  nightshade: { fill: "#ebc3b4", stroke: "#a85a42" },
  brassica: { fill: "#c9daea", stroke: "#466f9a" },
  cucurbit: { fill: "#f0dcae", stroke: "#8f6d1f" },
  legume: { fill: "#c4ddd4", stroke: "#3f7a68" },
  allium: { fill: "#dad3ee", stroke: "#6656a0" },
  root: { fill: "#edcbd9", stroke: "#a04a73" },
  leafy: { fill: "#d3e4bc", stroke: "#5a8236" },
  other: { fill: "#e6e6e4", stroke: "#77777b" },
};

/** The legend's names for each family; "Other" covers plants the families do not list. */
export const cropFamilyLegendLabels: Record<PlantingCropFamily, string> = {
  nightshade: "Nightshade",
  brassica: "Brassica",
  cucurbit: "Cucurbit",
  legume: "Legume",
  allium: "Allium",
  root: "Root crop",
  leafy: "Leafy green",
  other: "Other",
};

/** Planting-record families by record ID, so a linked plant uses its record's family. */
export function plantingFamilies(plantings: Pick<PlantingRecord, "id" | "cropFamily">[] = []) {
  return new Map(plantings.map((planting) => [planting.id, planting.cropFamily]));
}

/**
 * A plant's crop family: its linked planting record's family when there is one,
 * otherwise the family its type name implies, and "other" when nothing matches.
 */
export function allocationCropFamily(
  allocation: Pick<PlantAllocation, "label" | "plantType" | "variety" | "plantingRecordId">,
  families: Map<string, PlantingCropFamily> = new Map(),
): PlantingCropFamily {
  const linked = allocation.plantingRecordId ? families.get(allocation.plantingRecordId) : undefined;
  if (linked && plantingCropFamilies.includes(linked)) return linked;
  return inferPlantCropFamily(allocation.plantType?.trim() || allocation.label, allocation.variety);
}

export function cropFamilyColor(family: PlantingCropFamily): PlantColors {
  return cropFamilyColors[family] ?? cropFamilyColors.other;
}

/** The families present among these plants, in the standard family order. */
export function familiesInView(families: Iterable<PlantingCropFamily>) {
  const present = new Set(families);
  return plantingCropFamilies.filter((family) => present.has(family));
}

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
