import {
  inferPlantCropFamily,
  inferPlantType,
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
 * Plant colours (ADR-0076). Each plant type takes its own colour from two rings of
 * muted swatches. The plant ring keeps the seven crop-family colours of ADR-0073 S4
 * and adds a blend between each neighbouring pair, so every swatch belongs to the
 * same palette. The flower ring holds slightly richer petal colours. Fills are light
 * and strokes are dark, with at least 3:1 contrast between a stroke and its fill, the
 * soil, and the ground. Konva cannot read CSS custom properties, so the hex values live
 * here. The stored per-plant `color` field is kept in the data but not drawn.
 */
export const plantSwatches = {
  coral: { fill: "#ebc3b4", stroke: "#a85a42" },
  orange: { fill: "#f1ceb0", stroke: "#9f632f" },
  amber: { fill: "#f0dcae", stroke: "#8f6d1f" },
  olive: { fill: "#e1e1b3", stroke: "#777923" },
  leaf: { fill: "#d3e4bc", stroke: "#5a8236" },
  green: { fill: "#c6e2ca", stroke: "#438054" },
  sea: { fill: "#c4ddd4", stroke: "#3f7a68" },
  teal: { fill: "#c0dde2", stroke: "#1a7888" },
  blue: { fill: "#c9daea", stroke: "#466f9a" },
  periwinkle: { fill: "#cfd7ee", stroke: "#4f65a1" },
  lavender: { fill: "#dad3ee", stroke: "#6656a0" },
  plum: { fill: "#e5cee5", stroke: "#8c4d8c" },
  pink: { fill: "#edcbd9", stroke: "#a04a73" },
  red: { fill: "#f0c6c7", stroke: "#ab4e59" },
} as const satisfies Record<string, PlantColors>;

export const flowerSwatches = {
  red: { fill: "#f3b4b8", stroke: "#aa434f" },
  orange: { fill: "#f6c39a", stroke: "#93571f" },
  yellow: { fill: "#ecd08e", stroke: "#7b6310" },
  blue: { fill: "#b4cdf0", stroke: "#36679f" },
  violet: { fill: "#cdc4f4", stroke: "#5f5aa8" },
  pink: { fill: "#f3b8d4", stroke: "#a44374" },
} as const satisfies Record<string, PlantColors>;

type PlantSwatch = keyof typeof plantSwatches;
type FlowerSwatch = keyof typeof flowerSwatches;
type SwatchChoice = { ring: "plant"; swatch: PlantSwatch } | { ring: "flower"; swatch: FlowerSwatch };

// Swatches in ring order: neighbours are close in hue, so a garden avoids them together.
const rings = {
  plant: Object.keys(plantSwatches) as PlantSwatch[],
  flower: Object.keys(flowerSwatches) as FlowerSwatch[],
};

// The plant swatch each flower swatch shares its hue with, such as Sunflower yellow and Squash amber.
const flowerHues: Record<FlowerSwatch, PlantSwatch> = {
  red: "red",
  orange: "orange",
  yellow: "amber",
  blue: "periwinkle",
  violet: "lavender",
  pink: "pink",
};

/**
 * Each known plant type's colour, close to how the plant looks. The order is the
 * priority: when two plants in a garden would look alike, the later one moves.
 */
const knownPlantSwatches: Array<[string, SwatchChoice]> = [
  ["Tomato", { ring: "plant", swatch: "red" }],
  ["Pepper", { ring: "plant", swatch: "coral" }],
  ["Eggplant", { ring: "plant", swatch: "plum" }],
  ["Marigold", { ring: "flower", swatch: "orange" }],
  ["Sunflower", { ring: "flower", swatch: "yellow" }],
  ["Meadow sage", { ring: "flower", swatch: "violet" }],
  ["Panicle hydrangea", { ring: "flower", swatch: "pink" }],
  ["Squash", { ring: "plant", swatch: "amber" }],
  ["Bean", { ring: "plant", swatch: "green" }],
  ["Pea", { ring: "plant", swatch: "leaf" }],
  ["Lettuce", { ring: "plant", swatch: "olive" }],
  ["Kale", { ring: "plant", swatch: "blue" }],
  ["Basil", { ring: "plant", swatch: "green" }],
  ["Cucumber", { ring: "plant", swatch: "teal" }],
  ["Carrot", { ring: "plant", swatch: "orange" }],
];

/** A plant type the list does not name keeps its crop family's ADR-0073 colour. */
const familySwatches: Record<Exclude<PlantingCropFamily, "other">, PlantSwatch> = {
  nightshade: "coral",
  brassica: "blue",
  cucurbit: "amber",
  legume: "sea",
  allium: "lavender",
  root: "pink",
  leafy: "leaf",
};

/** The colour a plant group is drawn in: one per plant type, shared by its varieties. */
export function plantColorKey(allocation: Pick<PlantAllocation, "label" | "plantType">) {
  return (allocation.plantType?.trim() || allocation.label).trim().toLocaleLowerCase();
}

type ColorAllocation = Pick<PlantAllocation, "label" | "plantType" | "variety" | "plantingRecordId">;

function preferredSwatch(allocation: ColorAllocation, families: Map<string, PlantingCropFamily>) {
  const name = allocation.plantType?.trim() || allocation.label;
  const known = inferPlantType(name, allocation.variety);
  const index = knownPlantSwatches.findIndex(([type]) => type === known);
  if (index >= 0) return { choice: knownPlantSwatches[index][1], priority: index };
  const family = allocationCropFamily(allocation, families);
  if (family !== "other") return { choice: { ring: "plant", swatch: familySwatches[family] } satisfies SwatchChoice, priority: knownPlantSwatches.length };
  // An unknown plant still gets a steady colour of its own, picked from its name.
  let hash = 0;
  for (const character of plantColorKey(allocation)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return { choice: { ring: "plant", swatch: rings.plant[hash % rings.plant.length] } satisfies SwatchChoice, priority: knownPlantSwatches.length + 1 };
}

function ringDistance(first: number, second: number, size: number) {
  const distance = Math.abs(first - second) % size;
  return Math.min(distance, size - distance);
}

/**
 * Colours for every plant type in a garden, keyed by plantColorKey. Each type starts
 * from its own swatch. When that swatch is taken or sits next to a taken one, the
 * type moves to the closest clear swatch within three steps, then to any unused
 * swatch, and shares only when the ring is full. Flowers keep to the flower ring and
 * avoid only identical swatches, since its neighbours already differ clearly. A clear
 * swatch also avoids the hue of a flower or plant already in the other ring.
 */
export function gardenPlantColors(allocations: ColorAllocation[], families: Map<string, PlantingCropFamily> = new Map()) {
  const types = new Map<string, ReturnType<typeof preferredSwatch>>();
  for (const allocation of allocations) {
    const key = plantColorKey(allocation);
    if (key && !types.has(key)) types.set(key, preferredSwatch(allocation, families));
  }
  const ordered = [...types].sort(([firstKey, first], [secondKey, second]) => first.priority - second.priority || firstKey.localeCompare(secondKey));
  const taken = { plant: [] as number[], flower: [] as number[] };
  // Plant-ring positions of the hues in use, by the ring that uses them.
  const hues = { plant: [] as number[], flower: [] as number[] };
  const huePosition = (ring: "plant" | "flower", index: number) =>
    ring === "plant" ? index : rings.plant.indexOf(flowerHues[rings.flower[index]]);
  const colors = new Map<string, PlantColors>();
  for (const [key, { choice }] of ordered) {
    const ring: readonly string[] = rings[choice.ring];
    const preferred = ring.indexOf(choice.swatch);
    const used = taken[choice.ring];
    const otherHues = hues[choice.ring === "plant" ? "flower" : "plant"];
    const gap = choice.ring === "plant" ? 2 : 1;
    const candidates = ring.map((_, index) => index)
      .sort((first, second) => ringDistance(first, preferred, ring.length) - ringDistance(second, preferred, ring.length) || first - second);
    const clear = (candidate: number) => ringDistance(candidate, preferred, ring.length) <= 3
      && used.every((other) => ringDistance(candidate, other, ring.length) >= gap)
      && !otherHues.includes(huePosition(choice.ring, candidate));
    const index = candidates.find(clear)
      ?? candidates.find((candidate) => !used.includes(candidate))
      ?? preferred;
    used.push(index);
    hues[choice.ring].push(huePosition(choice.ring, index));
    const swatches: Record<string, PlantColors> = choice.ring === "plant" ? plantSwatches : flowerSwatches;
    colors.set(key, swatches[ring[index]]);
  }
  return colors;
}

/** A plant's colour from a gardenPlantColors map, or its own swatch when the map lacks it. */
export function plantColor(allocation: ColorAllocation, colors: Map<string, PlantColors>, families: Map<string, PlantingCropFamily> = new Map()) {
  return colors.get(plantColorKey(allocation)) ?? gardenPlantColors([allocation], families).values().next().value ?? plantSwatches.coral;
}

/**
 * One legend entry per plant type, grouped by crop family in the standard family
 * order and then by name, so related plants sit together.
 */
export function plantsInView(allocations: ColorAllocation[], families: Map<string, PlantingCropFamily> = new Map()) {
  const entries = new Map<string, { key: string; name: string; family: PlantingCropFamily }>();
  for (const allocation of allocations) {
    const key = plantColorKey(allocation);
    if (key && !entries.has(key)) entries.set(key, { key, name: allocation.plantType?.trim() || allocation.label.trim(), family: allocationCropFamily(allocation, families) });
  }
  return [...entries.values()]
    .sort((first, second) => plantingCropFamilies.indexOf(first.family) - plantingCropFamilies.indexOf(second.family) || first.name.localeCompare(second.name))
    .map(({ key, name }) => ({ key, name }));
}

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
