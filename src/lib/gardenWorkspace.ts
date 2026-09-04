export const GARDEN_WORKSPACE_STORAGE_KEY =
  "sun-aware-garden-planner:garden-workspace:v1";

export const growingAreaKinds = [
  "raised-bed",
  "in-ground",
  "container",
  "greenhouse",
] as const;
export type GrowingAreaKind = (typeof growingAreaKinds)[number];

export type LayoutPoint = { x: number; y: number };
export type PlanPlacement = { x: number; y: number; rotationDegrees: number };
export type PlantAllocation = {
  id: string;
  label: string;
  plantType?: string;
  variety?: string;
  plantingRecordId?: string;
  color?: string;
  x: number;
  y: number;
  diameterMeters: number;
};

const plantAppearanceDefaults = [
  { name: "Tomato", aliases: ["tomato", "tomatoes", "番茄", "西红柿", "sungold", "sun gold"], color: "#d9534f" },
  { name: "Pepper", aliases: ["pepper", "辣椒", "甜椒", "彩椒"], color: "#e06a43" },
  { name: "Eggplant", aliases: ["eggplant", "茄子"], color: "#76529a" },
  { name: "Marigold", aliases: ["marigold", "万寿菊"], color: "#e69a32" },
  { name: "Sunflower", aliases: ["sunflower", "向日葵"], color: "#e2b52e" },
  { name: "Meadow sage", aliases: ["meadow sage", "salvia", "sage", "林荫鼠尾草", "鼠尾草"], color: "#8a62ad" },
  { name: "Panicle hydrangea", aliases: ["panicle hydrangea", "hydrangea", "圆锥绣球", "绣球"], color: "#d17e9c" },
  { name: "Squash", aliases: ["squash", "pumpkin", "南瓜", "西葫芦"], color: "#d88a38" },
  { name: "Bean", aliases: ["bean", "beans", "豆角", "四季豆"], color: "#4e9b78" },
  { name: "Pea", aliases: ["pea", "peas", "豌豆"], color: "#7ca64b" },
  { name: "Lettuce", aliases: ["lettuce", "生菜"], color: "#86ad5f" },
  { name: "Kale", aliases: ["kale", "羽衣甘蓝"], color: "#3e7457" },
  { name: "Basil", aliases: ["basil", "罗勒"], color: "#519a55" },
  { name: "Cucumber", aliases: ["cucumber", "黄瓜"], color: "#3d9881" },
] as const;

const fallbackPlantColors = [
  "#3d9881",
  "#5f84b8",
  "#76529a",
  "#c66b86",
  "#d88a38",
  "#7ca64b",
] as const;

const minimumColorDistance = 90;

export const plantTypeSuggestions = plantAppearanceDefaults.map(({ name }) => name);

export function defaultPlantColor(plantType: string, variety = "") {
  const normalized = `${plantType} ${variety}`.trim().toLowerCase();
  return plantAppearanceDefaults.find(({ aliases }) => aliases.some((alias) => normalized.includes(alias)))?.color ?? fallbackPlantColors[colorIndex(normalized)];
}

export function allocationPlantColor(
  allocation: PlantAllocation,
  allocations: PlantAllocation[],
) {
  if (allocation.color) return allocation.color;

  const automaticAllocations = allocations.filter((candidate) => !candidate.color);
  const identities = [...new Set(automaticAllocations.map(allocationIdentity))].sort();
  const reservedColors = new Set(
    allocations.flatMap((candidate) => (candidate.color ? [candidate.color] : [])),
  );
  const colorsByIdentity = new Map<string, string>();

  for (const identity of identities) {
    const sample = automaticAllocations.find(
      (candidate) => allocationIdentity(candidate) === identity,
    );
    if (!sample) continue;
    const preferred = defaultPlantColor(
      sample.plantType ?? sample.label,
      sample.variety,
    );
    const color = [preferred, ...fallbackPlantColors].find(
      (candidate) =>
        [...reservedColors].every(
          (reservedColor) => colorDistance(candidate, reservedColor) >= minimumColorDistance,
        ),
    ) ?? preferred;
    colorsByIdentity.set(identity, color);
    reservedColors.add(color);
  }

  return colorsByIdentity.get(allocationIdentity(allocation)) ?? defaultPlantColor(
    allocation.plantType ?? allocation.label,
    allocation.variety,
  );
}

function allocationIdentity(allocation: PlantAllocation) {
  return (allocation.plantType ?? allocation.label).trim().toLocaleLowerCase();
}

function colorIndex(value: string) {
  let total = 0;
  for (const character of value) total = (total * 31 + character.charCodeAt(0)) >>> 0;
  return total % fallbackPlantColors.length;
}

function colorDistance(first: string, second: string) {
  const firstChannels = hexChannels(first);
  const secondChannels = hexChannels(second);
  return Math.hypot(
    firstChannels[0] - secondChannels[0],
    firstChannels[1] - secondChannels[1],
    firstChannels[2] - secondChannels[2],
  );
}

function hexChannels(color: string) {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}

export function plantDisplayName({
  plantType,
  variety,
  fallback,
}: {
  plantType?: string;
  variety?: string;
  fallback: string;
}) {
  const type = plantType?.trim() || fallback;
  return variety?.trim() ? `${type} · ${variety.trim()}` : type;
}

export function isPlantColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}
export type GrowingAreaLayout = {
  widthMeters: number;
  depthMeters: number;
  boundary: LayoutPoint[];
  allocations: PlantAllocation[];
};
export type GardenPlan = { widthMeters: number; depthMeters: number };
export type GardenPlanViewMode = "full" | "growing-areas";
export type GardenPlanViewport = {
  x: number;
  y: number;
  widthMeters: number;
  depthMeters: number;
};
export type GrowingArea = {
  id: string;
  name: string;
  kind: GrowingAreaKind;
  planPlacement: PlanPlacement;
  layout?: GrowingAreaLayout;
};

export function gardenPlanViewport(
  plan: GardenPlan,
  growingAreas: GrowingArea[],
  viewMode: GardenPlanViewMode,
): GardenPlanViewport {
  if (viewMode === "full") {
    return { x: 0, y: 0, ...plan };
  }

  const points = growingAreas.flatMap((area) => {
    if (!area.layout) return [];
    const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
    return area.layout.boundary.map((point) => ({
      x:
        area.planPlacement.x +
        point.x * Math.cos(angle) -
        point.y * Math.sin(angle),
      y:
        area.planPlacement.y +
        point.x * Math.sin(angle) +
        point.y * Math.cos(angle),
    }));
  });
  if (!points.length) return { x: 0, y: 0, ...plan };

  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const widthMeters = Math.max(right - left, 0.5);
  const depthMeters = Math.max(bottom - top, 0.5);
  const padding = Math.max(0.3, Math.max(widthMeters, depthMeters) * 0.15);
  const areasStayWithinPlan =
    left >= 0 && top >= 0 && right <= plan.widthMeters && bottom <= plan.depthMeters;
  const frameLeft = areasStayWithinPlan ? Math.max(0, left - padding) : left - padding;
  const frameRight = areasStayWithinPlan
    ? Math.min(plan.widthMeters, right + padding)
    : right + padding;
  const frameTop = areasStayWithinPlan ? Math.max(0, top - padding) : top - padding;
  const frameBottom = areasStayWithinPlan
    ? Math.min(plan.depthMeters, bottom + padding)
    : bottom + padding;

  return {
    x: frameLeft,
    y: frameTop,
    widthMeters: frameRight - frameLeft,
    depthMeters: frameBottom - frameTop,
  };
}

export const plantingCropFamilies = [
  "nightshade",
  "brassica",
  "cucurbit",
  "legume",
  "allium",
  "root",
  "leafy",
  "other",
] as const;
export type PlantingCropFamily = (typeof plantingCropFamilies)[number];
export type PlantingRecord = {
  id: string;
  commonName: string;
  plantType?: string;
  variety?: string;
  cropFamily: PlantingCropFamily;
  quantity: number;
  plantingDate: string;
  growingAreaId: string;
  isActive: boolean;
};
export type PlannedPlanting = {
  id: string;
  commonName: string;
  plantType?: string;
  variety?: string;
  cropFamily: PlantingCropFamily;
  growingAreaId: string;
};
export type SeasonPlan = {
  id: string;
  seasonYear: number;
  plantings: PlannedPlanting[];
};
export const careEventTypes = ["watering", "fertilizing"] as const;
export type CareEventType = (typeof careEventTypes)[number];
export type CareEventTargetScope = "all-gardens" | "garden" | "planting-area" | "plant-group";
export type CareEvent = {
  id: string;
  type: CareEventType;
  date: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId?: string;
  growingAreaName?: string;
  targetAreaDeleted?: boolean;
  plantingRecordId?: string;
  plantingRecordName?: string;
  targetPlantingRecordDeleted?: boolean;
  fertilizerProduct?: string;
  fertilizerAmount?: number;
  fertilizerUnit?: string;
};
export type CareTask = {
  id: string;
  type: CareEventType;
  dueDate: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId?: string;
  growingAreaName?: string;
  targetAreaDeleted?: boolean;
  plantingRecordId?: string;
  plantingRecordName?: string;
  targetPlantingRecordDeleted?: boolean;
  repeatIntervalDays?: number;
};
export const healthSeverities = ["low", "medium", "high"] as const;
export type HealthSeverity = (typeof healthSeverities)[number];
export type HealthRecordTargetScope = Exclude<CareEventTargetScope, "all-gardens">;
export type HealthAssessment = {
  summary: string;
  possibleIssues: string[];
  nextSteps: string[];
  followUpQuestions: string[];
  confidence: HealthSeverity;
};
export type HealthRecord = {
  id: string;
  observedOn: string;
  symptoms: string;
  severity: HealthSeverity;
  targetScope: HealthRecordTargetScope;
  growingAreaId?: string;
  growingAreaName?: string;
  targetAreaDeleted?: boolean;
  plantingRecordId?: string;
  plantingRecordName?: string;
  targetPlantingRecordDeleted?: boolean;
  photoPaths: string[];
  assessment?: HealthAssessment;
};
export type Garden = {
  id: string;
  name: string;
  plan: GardenPlan;
  growingAreas: GrowingArea[];
  plantings: PlantingRecord[];
  seasonPlans?: SeasonPlan[];
  careEvents: CareEvent[];
  careTasks: CareTask[];
  healthRecords: HealthRecord[];
};
export type GardenWorkspace = {
  version: 10;
  selectedGardenId: string;
  gardens: Garden[];
  careEvents: CareEvent[];
  careTasks: CareTask[];
};

type PreHealthGarden = Omit<Garden, "healthRecords">;
type Version9GardenWorkspace = Omit<GardenWorkspace, "version" | "gardens"> & {
  version: 9;
  gardens: PreHealthGarden[];
};
type Version8GardenWorkspace = Omit<Version9GardenWorkspace, "version" | "careEvents" | "careTasks"> & {
  version: 8;
};

type Version7CareTask = CareTask & { completedDate?: string };
type Version7Garden = Omit<Garden, "careTasks" | "healthRecords"> & {
  careTasks: Version7CareTask[];
};
type Version7GardenWorkspace = {
  version: 7;
  selectedGardenId: string;
  gardens: Version7Garden[];
};
type Version6Garden = Omit<Garden, "careTasks" | "healthRecords">;
type Version6GardenWorkspace = {
  version: 6;
  selectedGardenId: string;
  gardens: Version6Garden[];
};

type Version5CareEvent = Omit<CareEvent, "targetScope"> & {
  targetScope: "garden" | "planting-area";
};
type Version5Garden = Omit<Garden, "careEvents" | "careTasks" | "healthRecords"> & {
  careEvents: Version5CareEvent[];
};
type Version5GardenWorkspace = {
  version: 5;
  selectedGardenId: string;
  gardens: Version5Garden[];
};
type Version4Garden = Omit<Garden, "careEvents" | "careTasks" | "healthRecords">;
type Version4GardenWorkspace = {
  version: 4;
  selectedGardenId: string;
  gardens: Version4Garden[];
};

type Version3GardenWorkspace = {
  version: 3;
  garden: Omit<
    Garden,
    "growingAreas" | "plantings" | "careEvents" | "careTasks" | "healthRecords"
  >;
  growingAreas: GrowingArea[];
  plantings: PlantingRecord[];
};

type Version2GardenWorkspace = {
  version: 2;
  garden: Omit<
    Garden,
    "growingAreas" | "plantings" | "careEvents" | "careTasks" | "healthRecords"
  >;
  growingAreas: GrowingArea[];
};

type LegacyGardenWorkspace = {
  version: 1;
  garden: { id: string; name: string };
  growingAreas: Omit<GrowingArea, "planPlacement">[];
};

export const DEFAULT_GARDEN_PLAN: GardenPlan = {
  widthMeters: 10,
  depthMeters: 6,
};

export const growingAreaKindLabels: Record<GrowingAreaKind, string> = {
  "raised-bed": "Raised bed",
  "in-ground": "In-ground area",
  container: "Container group",
  greenhouse: "Greenhouse shelf",
};

export const plantingCropFamilyLabels: Record<PlantingCropFamily, string> = {
  nightshade: "Nightshade",
  brassica: "Brassica",
  cucurbit: "Cucurbit",
  legume: "Legume",
  allium: "Allium",
  root: "Root crop",
  leafy: "Leafy green",
  other: "Other or unknown",
};

const cropFamilyAliases: Array<{
  family: PlantingCropFamily;
  aliases: string[];
}> = [
  { family: "nightshade", aliases: ["tomato", "番茄", "西红柿", "sungold", "sun gold", "pepper", "辣椒", "茄子", "eggplant", "potato", "土豆"] },
  { family: "brassica", aliases: ["kale", "羽衣甘蓝", "cabbage", "卷心菜", "broccoli", "西兰花", "cauliflower", "菜花"] },
  { family: "cucurbit", aliases: ["squash", "南瓜", "西葫芦", "cucumber", "黄瓜", "melon", "甜瓜"] },
  { family: "legume", aliases: ["bean", "豆角", "四季豆", "pea", "豌豆"] },
  { family: "allium", aliases: ["onion", "洋葱", "garlic", "大蒜", "leek", "韭葱"] },
  { family: "root", aliases: ["carrot", "胡萝卜", "beet", "甜菜", "radish", "萝卜"] },
  { family: "leafy", aliases: ["lettuce", "生菜", "莴笋", "spinach", "菠菜"] },
];

export function inferPlantCropFamily(
  plantType: string,
  variety = "",
): PlantingCropFamily {
  const normalized = `${plantType} ${variety}`.toLocaleLowerCase();
  return cropFamilyAliases.find(({ aliases }) =>
    aliases.some((alias) => normalized.includes(alias)),
  )?.family ?? "other";
}

export function createGarden(name: string): Garden {
  return {
    id: createId("garden"),
    name,
    plan: { ...DEFAULT_GARDEN_PLAN },
    growingAreas: [],
    plantings: [],
    seasonPlans: [],
    careEvents: [],
    careTasks: [],
    healthRecords: [],
  };
}

export function createGardenWorkspace(name: string): GardenWorkspace {
  const garden = createGarden(name);
  return { version: 10, selectedGardenId: garden.id, gardens: [garden], careEvents: [], careTasks: [] };
}

export function createDemoGardenWorkspace(): GardenWorkspace {
  const garden: Garden = {
    id: "demo-garden",
    name: "Demo Garden",
    plan: { widthMeters: 10, depthMeters: 6 },
    growingAreas: [
      {
        id: "demo-raised-bed",
        name: "Sample raised bed",
        kind: "raised-bed",
        planPlacement: { x: 0.8, y: 1, rotationDegrees: 0 },
        layout: {
          widthMeters: 3,
          depthMeters: 1.2,
          boundary: rectangularBoundary(3, 1.2),
          allocations: [
            {
              id: "demo-tomato",
              label: "Tomato",
              plantType: "Tomato",
              x: 0.6,
              y: 0.6,
              diameterMeters: 0.6,
            },
          ],
        },
      },
      {
        id: "demo-in-ground-area",
        name: "Sample in-ground area",
        kind: "in-ground",
        planPlacement: { x: 4.7, y: 2.6, rotationDegrees: 0 },
        layout: createRectangularLayout(3.8, 1.8),
      },
      {
        id: "demo-container-group",
        name: "Sample container group",
        kind: "container",
        planPlacement: { x: 5.2, y: 0.6, rotationDegrees: 0 },
        layout: createRectangularLayout(1.4, 1.1),
      },
    ],
    plantings: [
      {
        id: "demo-planting-tomatoes",
        commonName: "Tomatoes",
        plantType: "Tomato",
        variety: "Sun Gold",
        cropFamily: "nightshade",
        quantity: 4,
        plantingDate: "2026-05-18",
        growingAreaId: "demo-raised-bed",
        isActive: true,
      },
      {
        id: "demo-planting-beans",
        commonName: "Bush beans",
        plantType: "Bean",
        variety: "Bush bean",
        cropFamily: "legume",
        quantity: 12,
        plantingDate: "2026-05-24",
        growingAreaId: "demo-in-ground-area",
        isActive: true,
      },
    ],
    seasonPlans: [],
    careEvents: [],
    careTasks: [],
    healthRecords: [],
  };

  return { version: 10, selectedGardenId: garden.id, gardens: [garden], careEvents: [], careTasks: [] };
}

export function linkCurrentLayoutPlants(
  garden: Garden,
  plantingDate = todayDate(),
): Garden {
  let plantings = [...garden.plantings];
  const growingAreas = garden.growingAreas.map((area) => {
    if (!area.layout?.allocations.length) return area;

    const groups = new Map<string, PlantAllocation[]>();
    for (const allocation of area.layout.allocations) {
      const key = layoutPlantIdentity(allocation);
      groups.set(key, [...(groups.get(key) ?? []), allocation]);
    }

    const allocations = area.layout.allocations.map((allocation) => ({ ...allocation }));
    for (const groupedAllocations of groups.values()) {
      const sample = groupedAllocations[0];
      const linkedRecord = sample.plantingRecordId
        ? plantings.find((planting) => planting.id === sample.plantingRecordId)
        : undefined;
      const existing = linkedRecord ?? plantings.find((planting) =>
        planting.growingAreaId === area.id &&
        planting.isActive &&
        sameLayoutPlant(planting, sample),
      );
      const record = existing ?? {
        id: createId("planting"),
        commonName: plantDisplayName({
          plantType: sample.plantType ?? sample.label,
          variety: sample.variety,
          fallback: sample.label,
        }),
        plantType: sample.plantType ?? sample.label,
        ...(sample.variety ? { variety: sample.variety } : {}),
        cropFamily: inferPlantCropFamily(
          sample.plantType ?? sample.label,
          sample.variety,
        ),
        quantity: groupedAllocations.length,
        plantingDate,
        growingAreaId: area.id,
        isActive: true,
      } satisfies PlantingRecord;
      if (!existing) plantings = [...plantings, record];

      for (const allocation of allocations) {
        if (layoutPlantIdentity(allocation) === layoutPlantIdentity(sample)) {
          allocation.plantingRecordId = record.id;
        }
      }
    }

    return { ...area, layout: { ...area.layout, allocations } };
  });

  return { ...garden, growingAreas, plantings };
}

function layoutPlantIdentity(allocation: PlantAllocation) {
  return `${allocation.plantType ?? allocation.label}\u0000${allocation.variety ?? ""}`
    .trim()
    .toLocaleLowerCase();
}

function sameLayoutPlant(planting: PlantingRecord, allocation: PlantAllocation) {
  const plantingType = normalizedPlantType(planting.plantType ?? planting.commonName);
  const allocationType = normalizedPlantType(allocation.plantType ?? allocation.label);
  if (plantingType !== allocationType) return false;
  if (!allocation.variety || !planting.variety) return true;
  return planting.variety.trim().toLocaleLowerCase() === allocation.variety.trim().toLocaleLowerCase();
}

function normalizedPlantType(value: string) {
  return value.trim().toLocaleLowerCase().replace(/es$/, "").replace(/s$/, "");
}

export function createRectangularLayout(
  widthMeters: number,
  depthMeters: number,
): GrowingAreaLayout {
  return {
    widthMeters,
    depthMeters,
    boundary: rectangularBoundary(widthMeters, depthMeters),
    allocations: [],
  };
}

export function validateLayoutDimensions(
  widthMeters: number,
  depthMeters: number,
) {
  return (
    Number.isFinite(widthMeters) &&
    Number.isFinite(depthMeters) &&
    widthMeters >= 0.1 &&
    depthMeters >= 0.1
  );
}

export function validateGardenPlanDimensions(
  widthMeters: number,
  depthMeters: number,
) {
  return validateLayoutDimensions(widthMeters, depthMeters);
}

export function snapToGrid(value: number) {
  return Math.round(value * 10) / 10;
}

export function clampPlanPosition(
  point: LayoutPoint,
  plan: GardenPlan,
): LayoutPoint {
  return {
    x: snapToGrid(Math.min(Math.max(point.x, 0), plan.widthMeters)),
    y: snapToGrid(Math.min(Math.max(point.y, 0), plan.depthMeters)),
  };
}

export function normalizePlanRotation(value: number) {
  return snapToGrid(((value % 360) + 360) % 360);
}

export function defaultPlanPlacement(index: number): PlanPlacement {
  return {
    x: snapToGrid(0.5 + (index % 3) * 3),
    y: snapToGrid(0.5 + Math.floor(index / 3) * 2),
    rotationDegrees: 0,
  };
}

export function clampAllocationCenter(
  point: LayoutPoint,
  layout: Pick<GrowingAreaLayout, "widthMeters" | "depthMeters">,
): LayoutPoint {
  return {
    x: snapToGrid(Math.min(Math.max(point.x, 0), layout.widthMeters)),
    y: snapToGrid(Math.min(Math.max(point.y, 0), layout.depthMeters)),
  };
}

export function findDuplicatePlantPosition(
  source: PlantAllocation,
  layout: GrowingAreaLayout,
): LayoutPoint | undefined {
  const sourceRow = Math.round(snapToGrid(source.y) * 10);
  const preferred = {
    x: snapToGrid(source.x + source.diameterMeters),
    y: snapToGrid(source.y),
  };
  const maxColumn = Math.round(layout.widthMeters * 10);
  const maxRow = Math.round(layout.depthMeters * 10);
  const occupied = new Set(layout.allocations.map(pointKey));
  const plants = layout.allocations.some(
    (allocation) => allocation.id === source.id,
  )
    ? layout.allocations
    : [...layout.allocations, source];

  return gridPointsAfter(sourceRow, maxRow, maxColumn, preferred).find(
    (point) =>
      !occupied.has(pointKey(point)) &&
      plants.every((plant) => !spacingCirclesOverlap(point, source, plant)),
  );
}

function gridPointsAfter(
  sourceRow: number,
  maxRow: number,
  maxColumn: number,
  preferred: LayoutPoint,
) {
  const preferredPoint = {
    x: Math.round(preferred.x * 10),
    y: Math.round(preferred.y * 10),
  };
  const preferredPoints =
    preferredPoint.x >= 0 &&
    preferredPoint.x <= maxColumn &&
    preferredPoint.y >= 0 &&
    preferredPoint.y <= maxRow
      ? [{ x: preferredPoint.x / 10, y: preferredPoint.y / 10 }]
      : [];
  const laterRows: LayoutPoint[] = [];
  const earlierRows: LayoutPoint[] = [];
  const sameRow: LayoutPoint[] = [];

  for (let row = sourceRow + 1; row <= maxRow; row += 1) {
    for (let column = 0; column <= maxColumn; column += 1)
      laterRows.push({ x: column / 10, y: row / 10 });
  }
  for (let row = sourceRow - 1; row >= 0; row -= 1) {
    for (let column = 0; column <= maxColumn; column += 1)
      earlierRows.push({ x: column / 10, y: row / 10 });
  }
  for (let column = 0; column <= maxColumn; column += 1)
    sameRow.push({ x: column / 10, y: sourceRow / 10 });

  const points = [
    ...preferredPoints,
    ...laterRows.sort(
      (left, right) =>
        distanceToPreferred(left, preferred) -
        distanceToPreferred(right, preferred),
    ),
    ...earlierRows.sort(
      (left, right) =>
        distanceToPreferred(left, preferred) -
        distanceToPreferred(right, preferred),
    ),
    ...sameRow.sort(
      (left, right) =>
        distanceToPreferred(left, preferred) -
        distanceToPreferred(right, preferred),
    ),
  ];
  return points.filter(
    (point, index) =>
      points.findIndex(
        (candidate) => pointKey(candidate) === pointKey(point),
      ) === index,
  );
}

function pointKey(point: LayoutPoint) {
  return `${Math.round(snapToGrid(point.x) * 10)},${Math.round(snapToGrid(point.y) * 10)}`;
}

function distanceToPreferred(point: LayoutPoint, preferred: LayoutPoint) {
  return (point.x - preferred.x) ** 2 + (point.y - preferred.y) ** 2;
}

function spacingCirclesOverlap(
  point: LayoutPoint,
  source: PlantAllocation,
  plant: PlantAllocation,
) {
  return (
    Math.hypot(point.x - plant.x, point.y - plant.y) <
    (source.diameterMeters + plant.diameterMeters) / 2 - Number.EPSILON
  );
}

export function readGardenWorkspace(
  value: string | null,
): GardenWorkspace | undefined {
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    if (isGardenWorkspace(parsed)) return linkWorkspaceLayoutPlants(parsed);
    if (isVersion9GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion9GardenWorkspace(parsed));
    if (isVersion8GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion8GardenWorkspace(parsed));
    if (isVersion7GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion7GardenWorkspace(parsed));
    if (isVersion6GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion6GardenWorkspace(parsed));
    if (isVersion5GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion5GardenWorkspace(parsed));
    if (isVersion4GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion4GardenWorkspace(parsed));
    if (isVersion3GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion3GardenWorkspace(parsed));
    if (isVersion2GardenWorkspace(parsed))
      return linkWorkspaceLayoutPlants(migrateVersion3GardenWorkspace({
        ...parsed,
        version: 3,
        plantings: [],
      }));
    if (isLegacyGardenWorkspace(parsed)) {
      return linkWorkspaceLayoutPlants(migrateVersion3GardenWorkspace({
        version: 3,
        garden: { ...parsed.garden, plan: { ...DEFAULT_GARDEN_PLAN } },
        growingAreas: parsed.growingAreas.map((area, index) => ({
          ...area,
          planPlacement: defaultPlanPlacement(index),
        })),
        plantings: [],
      }));
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function linkWorkspaceLayoutPlants(workspace: GardenWorkspace): GardenWorkspace {
  return {
    ...workspace,
    gardens: workspace.gardens.map((garden) =>
      linkCurrentLayoutPlants(
        moveFuturePlantingsToSeasonPlans(normalizeLegacyDemoGardenLayout(garden)),
      ),
    ),
  };
}

function normalizeLegacyDemoGardenLayout(garden: Garden): Garden {
  if (garden.id !== "demo-garden") return garden;

  return {
    ...garden,
    growingAreas: garden.growingAreas.map((area) => {
      const isLegacyDemoArea =
        area.id === "demo-in-ground-area" &&
        area.planPlacement.rotationDegrees === 10;

      return isLegacyDemoArea
        ? { ...area, planPlacement: { ...area.planPlacement, rotationDegrees: 0 } }
        : area;
    }),
  };
}

export function moveFuturePlantingsToSeasonPlans(
  garden: Garden,
  currentYear = new Date().getFullYear(),
): Garden {
  const plansByYear = new Map<number, SeasonPlan>();
  for (const plan of garden.seasonPlans ?? []) {
    plansByYear.set(plan.seasonYear, { ...plan, plantings: [...plan.plantings] });
  }

  const currentPlantings: PlantingRecord[] = [];
  for (const planting of garden.plantings) {
    const plantingYear = Number(planting.plantingDate.slice(0, 4));
    if (plantingYear <= currentYear) {
      currentPlantings.push(planting);
      continue;
    }
    const plan = plansByYear.get(plantingYear) ?? {
      id: `season-plan-${garden.id}-${plantingYear}`,
      seasonYear: plantingYear,
      plantings: [],
    } satisfies SeasonPlan;
    if (!plansByYear.has(plantingYear)) plansByYear.set(plantingYear, plan);
    if (!plan.plantings.some((candidate) => candidate.id === planting.id)) {
      plan.plantings.push({
        id: planting.id,
        commonName: planting.commonName,
        ...(planting.plantType ? { plantType: planting.plantType } : {}),
        ...(planting.variety ? { variety: planting.variety } : {}),
        cropFamily: planting.cropFamily,
        growingAreaId: planting.growingAreaId,
      });
    }
  }

  return {
    ...garden,
    plantings: currentPlantings,
    ...(
      plansByYear.size || garden.seasonPlans !== undefined
        ? {
            seasonPlans: [...plansByYear.values()].sort(
              (left, right) => left.seasonYear - right.seasonYear,
            ),
          }
        : {}
    ),
  };
}

function migrateVersion3GardenWorkspace(
  workspace: Version3GardenWorkspace,
): GardenWorkspace {
  const garden: Garden = {
    ...workspace.garden,
    growingAreas: workspace.growingAreas,
    plantings: workspace.plantings,
    careEvents: [],
    careTasks: [],
    healthRecords: [],
  };
  return { version: 10, selectedGardenId: garden.id, gardens: [garden], careEvents: [], careTasks: [] };
}

function migrateVersion9GardenWorkspace(
  workspace: Version9GardenWorkspace,
): GardenWorkspace {
  return {
    ...workspace,
    version: 10,
    gardens: workspace.gardens.map((garden) => ({ ...garden, healthRecords: [] })),
  };
}

function migrateVersion8GardenWorkspace(
  workspace: Version8GardenWorkspace,
): GardenWorkspace {
  return {
    ...workspace,
    version: 10,
    gardens: workspace.gardens.map((garden) => ({ ...garden, healthRecords: [] })),
    careEvents: [],
    careTasks: [],
  };
}

function migrateVersion4GardenWorkspace(
  workspace: Version4GardenWorkspace,
): GardenWorkspace {
  return {
    version: 10,
    selectedGardenId: workspace.selectedGardenId,
    gardens: workspace.gardens.map((garden) => ({
      ...garden,
      careEvents: [],
      careTasks: [],
      healthRecords: [],
    })),
    careEvents: [],
    careTasks: [],
  };
}

function migrateVersion5GardenWorkspace(
  workspace: Version5GardenWorkspace,
): GardenWorkspace {
  return {
    version: 10,
    selectedGardenId: workspace.selectedGardenId,
    gardens: workspace.gardens.map((garden) => ({ ...garden, careTasks: [], healthRecords: [] })),
    careEvents: [],
    careTasks: [],
  };
}

function migrateVersion6GardenWorkspace(
  workspace: Version6GardenWorkspace,
): GardenWorkspace {
  return {
    version: 10,
    selectedGardenId: workspace.selectedGardenId,
    gardens: workspace.gardens.map((garden) => ({ ...garden, careTasks: [], healthRecords: [] })),
    careEvents: [],
    careTasks: [],
  };
}

function migrateVersion7GardenWorkspace(
  workspace: Version7GardenWorkspace,
): GardenWorkspace {
  return {
    version: 10,
    selectedGardenId: workspace.selectedGardenId,
    gardens: workspace.gardens.map((garden) => ({
      ...garden,
      careTasks: garden.careTasks.flatMap(({ completedDate, ...task }) =>
        completedDate ? [] : [task],
      ),
      healthRecords: [],
    })),
    careEvents: [],
    careTasks: [],
  };
}

function isGardenWorkspace(value: unknown): value is GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<GardenWorkspace>;
  return (
    workspace.version === 10 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isGarden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId) &&
    Array.isArray(workspace.careEvents) &&
    workspace.careEvents.every(isGlobalCareEvent) &&
    Array.isArray(workspace.careTasks) &&
    workspace.careTasks.every(isGlobalCareTask)
  );
}

function isVersion9GardenWorkspace(value: unknown): value is Version9GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version9GardenWorkspace>;
  return (
    workspace.version === 9 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isPreHealthGarden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId) &&
    Array.isArray(workspace.careEvents) &&
    workspace.careEvents.every(isGlobalCareEvent) &&
    Array.isArray(workspace.careTasks) &&
    workspace.careTasks.every(isGlobalCareTask)
  );
}

function isVersion8GardenWorkspace(value: unknown): value is Version8GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version8GardenWorkspace>;
  return (
    workspace.version === 8 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isPreHealthGarden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId)
  );
}

function isVersion7GardenWorkspace(
  value: unknown,
): value is Version7GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version7GardenWorkspace>;
  return (
    workspace.version === 7 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isVersion7Garden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId)
  );
}

function isVersion6GardenWorkspace(
  value: unknown,
): value is Version6GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version6GardenWorkspace>;
  return (
    workspace.version === 6 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isVersion6Garden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId)
  );
}

function isVersion5GardenWorkspace(
  value: unknown,
): value is Version5GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version5GardenWorkspace>;
  return (
    workspace.version === 5 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isVersion5Garden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId)
  );
}

function isVersion4GardenWorkspace(
  value: unknown,
): value is Version4GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version4GardenWorkspace>;
  return (
    workspace.version === 4 &&
    typeof workspace.selectedGardenId === "string" &&
    Array.isArray(workspace.gardens) &&
    workspace.gardens.every(isVersion4Garden) &&
    workspace.gardens.some((garden) => garden.id === workspace.selectedGardenId)
  );
}

function isVersion3GardenWorkspace(
  value: unknown,
): value is Version3GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version3GardenWorkspace>;
  return (
    workspace.version === 3 &&
    Boolean(
      workspace.garden &&
        isNamedRecord(workspace.garden) &&
        isGardenPlan(workspace.garden.plan),
    ) &&
    isGardenContents(workspace.growingAreas, workspace.plantings)
  );
}

function isVersion2GardenWorkspace(
  value: unknown,
): value is Version2GardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<Version2GardenWorkspace>;
  return (
    workspace.version === 2 &&
    Boolean(
      workspace.garden &&
        isNamedRecord(workspace.garden) &&
        isGardenPlan(workspace.garden.plan),
    ) &&
    Array.isArray(workspace.growingAreas) &&
    workspace.growingAreas.every(isGrowingArea)
  );
}

function isLegacyGardenWorkspace(
  value: unknown,
): value is LegacyGardenWorkspace {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<LegacyGardenWorkspace>;
  return (
    workspace.version === 1 &&
    Boolean(workspace.garden && isNamedRecord(workspace.garden)) &&
    Array.isArray(workspace.growingAreas) &&
    workspace.growingAreas.every((area) =>
      Boolean(
        area &&
          isNamedRecord(area) &&
          growingAreaKinds.includes(area.kind) &&
          (!area.layout || isGrowingAreaLayout(area.layout)),
      ),
    )
  );
}

function isGarden(value: unknown): value is Garden {
  return Boolean(
    value &&
      isNamedRecord(value) &&
      isGardenPlan((value as Garden).plan) &&
      isGardenContents(
        (value as Garden).growingAreas,
        (value as Garden).plantings,
      ) &&
      ((value as Garden).seasonPlans === undefined ||
        (Array.isArray((value as Garden).seasonPlans) &&
          (value as Garden).seasonPlans!.every((plan) =>
            isSeasonPlan(plan, (value as Garden).growingAreas),
          ))) &&
      Array.isArray((value as Garden).careEvents) &&
      (value as Garden).careEvents.every((event) =>
        isCareEvent(
          event,
          (value as Garden).growingAreas,
          (value as Garden).plantings,
        ),
      ) &&
      Array.isArray((value as Garden).careTasks) &&
      (value as Garden).careTasks.every((task) =>
        isCareTask(
          task,
          (value as Garden).growingAreas,
          (value as Garden).plantings,
        ),
      ) &&
      Array.isArray((value as Garden).healthRecords) &&
      (value as Garden).healthRecords.every((record) =>
        isHealthRecord(
          record,
          (value as Garden).growingAreas,
          (value as Garden).plantings,
        ),
      ),
  );
}

function isSeasonPlan(value: unknown, growingAreas: GrowingArea[]): value is SeasonPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<SeasonPlan>;
  return (
    typeof plan.id === "string" &&
    Boolean(plan.id.trim()) &&
    Number.isInteger(plan.seasonYear) &&
    (plan.seasonYear ?? 0) > 2000 &&
    Array.isArray(plan.plantings) &&
    plan.plantings.every((planting) => isPlannedPlanting(planting, growingAreas))
  );
}

function isPlannedPlanting(value: unknown, growingAreas: GrowingArea[]): value is PlannedPlanting {
  if (!value || typeof value !== "object") return false;
  const planting = value as Partial<PlannedPlanting>;
  return (
    typeof planting.id === "string" &&
    Boolean(planting.id.trim()) &&
    typeof planting.commonName === "string" &&
    Boolean(planting.commonName.trim()) &&
    (planting.plantType === undefined || typeof planting.plantType === "string") &&
    (planting.variety === undefined || typeof planting.variety === "string") &&
    Boolean(planting.cropFamily && plantingCropFamilies.includes(planting.cropFamily)) &&
    typeof planting.growingAreaId === "string" &&
    growingAreas.some((area) => area.id === planting.growingAreaId)
  );
}

function isPreHealthGarden(value: unknown): value is PreHealthGarden {
  if (!value || typeof value !== "object") return false;
  const garden = value as PreHealthGarden;
  return (
    isNamedRecord(garden) &&
    isGardenPlan(garden.plan) &&
    isGardenContents(garden.growingAreas, garden.plantings) &&
    Array.isArray(garden.careEvents) &&
    garden.careEvents.every((event) => isCareEvent(event, garden.growingAreas, garden.plantings)) &&
    Array.isArray(garden.careTasks) &&
    garden.careTasks.every((task) => isCareTask(task, garden.growingAreas, garden.plantings))
  );
}

function isVersion6Garden(value: unknown): value is Version6Garden {
  if (!value || typeof value !== "object") return false;
  const garden = value as Version6Garden;
  return (
    isNamedRecord(garden) &&
    isGardenPlan(garden.plan) &&
    isGardenContents(garden.growingAreas, garden.plantings) &&
    Array.isArray(garden.careEvents) &&
    garden.careEvents.every((event) =>
      isCareEvent(event, garden.growingAreas, garden.plantings),
    )
  );
}

function isVersion7Garden(value: unknown): value is Version7Garden {
  if (!value || typeof value !== "object") return false;
  const garden = value as Version7Garden;
  return (
    isNamedRecord(garden) &&
    isGardenPlan(garden.plan) &&
    isGardenContents(garden.growingAreas, garden.plantings) &&
    Array.isArray(garden.careEvents) &&
    garden.careEvents.every((event) =>
      isCareEvent(event, garden.growingAreas, garden.plantings),
    ) &&
    Array.isArray(garden.careTasks) &&
    garden.careTasks.every((task) =>
      isVersion7CareTask(task, garden.growingAreas, garden.plantings),
    )
  );
}

function isVersion4Garden(value: unknown): value is Version4Garden {
  return Boolean(
    value &&
      isNamedRecord(value) &&
      isGardenPlan((value as Version4Garden).plan) &&
      isGardenContents(
        (value as Version4Garden).growingAreas,
        (value as Version4Garden).plantings,
      ),
  );
}

function isVersion5Garden(value: unknown): value is Version5Garden {
  return Boolean(
    value &&
      isNamedRecord(value) &&
      isGardenPlan((value as Version5Garden).plan) &&
      isGardenContents(
        (value as Version5Garden).growingAreas,
        (value as Version5Garden).plantings,
      ) &&
      Array.isArray((value as Version5Garden).careEvents) &&
      (value as Version5Garden).careEvents.every((event) =>
        isVersion5CareEvent(event, (value as Version5Garden).growingAreas),
      ),
  );
}

function isGardenContents(growingAreas: unknown, plantings: unknown) {
  return (
    Array.isArray(growingAreas) &&
    growingAreas.every(isGrowingArea) &&
    Array.isArray(plantings) &&
    plantings.every(
      (planting) =>
        isPlantingRecord(planting) &&
        growingAreas.some((area) => area.id === planting.growingAreaId),
    )
  );
}

function isGrowingArea(value: unknown): value is GrowingArea {
  if (!value || !isNamedRecord(value)) return false;
  const area = value as Partial<GrowingArea>;
  return Boolean(
    area.kind &&
      growingAreaKinds.includes(area.kind) &&
      isPlanPlacement(area.planPlacement) &&
      (!area.layout || isGrowingAreaLayout(area.layout)),
  );
}

function isGardenPlan(value: unknown): value is GardenPlan {
  return Boolean(
    value &&
      typeof value === "object" &&
      validateGardenPlanDimensions(
        (value as GardenPlan).widthMeters,
        (value as GardenPlan).depthMeters,
      ),
  );
}

function isPlanPlacement(value: unknown): value is PlanPlacement {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number.isFinite((value as PlanPlacement).x) &&
      (value as PlanPlacement).x >= 0 &&
      Number.isFinite((value as PlanPlacement).y) &&
      (value as PlanPlacement).y >= 0 &&
      Number.isFinite((value as PlanPlacement).rotationDegrees),
  );
}

function isGrowingAreaLayout(value: unknown): value is GrowingAreaLayout {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<GrowingAreaLayout>;
  return (
    validateLayoutDimensions(
      layout.widthMeters ?? Number.NaN,
      layout.depthMeters ?? Number.NaN,
    ) &&
    Array.isArray(layout.boundary) &&
    layout.boundary.length >= 3 &&
    layout.boundary.every(isPoint) &&
    Array.isArray(layout.allocations) &&
    layout.allocations.every(
      (allocation) =>
        isAllocation(allocation) &&
        allocation.x >= 0 &&
        allocation.x <= layout.widthMeters! &&
        allocation.y >= 0 &&
        allocation.y <= layout.depthMeters!,
    )
  );
}

function isPoint(value: unknown): value is LayoutPoint {
  return Boolean(
    value &&
      typeof value === "object" &&
      Number.isFinite((value as LayoutPoint).x) &&
      Number.isFinite((value as LayoutPoint).y),
  );
}

function isAllocation(value: unknown): value is PlantAllocation {
  const allocation = value as Partial<PlantAllocation>;
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof allocation.id === "string" &&
      allocation.id.trim() &&
      typeof allocation.label === "string" &&
      allocation.label.trim() &&
      (allocation.plantType === undefined ||
        (typeof allocation.plantType === "string" &&
          Boolean(allocation.plantType.trim()))) &&
      (allocation.variety === undefined || typeof allocation.variety === "string") &&
      (allocation.color === undefined || isPlantColor(allocation.color)) &&
      Number.isFinite(allocation.x) &&
      Number.isFinite(allocation.y) &&
      typeof allocation.diameterMeters === "number" &&
      Number.isFinite(allocation.diameterMeters) &&
      allocation.diameterMeters > 0,
  );
}

function isPlantingRecord(value: unknown): value is PlantingRecord {
  if (!value || typeof value !== "object") return false;
  const planting = value as Partial<PlantingRecord>;
  return (
    typeof planting.id === "string" &&
    Boolean(planting.id.trim()) &&
    typeof planting.commonName === "string" &&
    Boolean(planting.commonName.trim()) &&
    (planting.plantType === undefined ||
      (typeof planting.plantType === "string" &&
        Boolean(planting.plantType.trim()))) &&
    (planting.variety === undefined || typeof planting.variety === "string") &&
    Boolean(
      planting.cropFamily && plantingCropFamilies.includes(planting.cropFamily),
    ) &&
    typeof planting.quantity === "number" &&
    Number.isInteger(planting.quantity) &&
    planting.quantity > 0 &&
    typeof planting.plantingDate === "string" &&
    isCalendarDate(planting.plantingDate) &&
    typeof planting.growingAreaId === "string" &&
    Boolean(planting.growingAreaId.trim()) &&
    typeof planting.isActive === "boolean"
  );
}

function isCareEvent(
  value: unknown,
  growingAreas?: GrowingArea[],
  plantings?: PlantingRecord[],
): value is CareEvent {
  if (!isCareEventBase(value)) return false;
  const event = value as Partial<CareEvent>;
  const hasNoAreaTarget =
    event.growingAreaId === undefined &&
    event.growingAreaName === undefined &&
    event.targetAreaDeleted === undefined;
  const hasNoPlantGroupTarget =
    event.plantingRecordId === undefined &&
    event.plantingRecordName === undefined &&
    event.targetPlantingRecordDeleted === undefined;
  const hasValidDeletionFlags =
    (event.targetAreaDeleted === undefined ||
      typeof event.targetAreaDeleted === "boolean") &&
    (event.targetPlantingRecordDeleted === undefined ||
      typeof event.targetPlantingRecordDeleted === "boolean");
  return (
    hasValidDeletionFlags &&
    (event.targetScope === "garden" ||
      event.targetScope === "planting-area" ||
      event.targetScope === "plant-group") &&
    (event.targetScope === "garden"
      ? hasNoAreaTarget && hasNoPlantGroupTarget
      : event.targetScope === "planting-area"
        ? typeof event.growingAreaId === "string" &&
        Boolean(event.growingAreaId.trim()) &&
        typeof event.growingAreaName === "string" &&
        Boolean(event.growingAreaName.trim()) &&
        (!growingAreas ||
          growingAreas.some((area) => area.id === event.growingAreaId) ||
          event.targetAreaDeleted === true) &&
        hasNoPlantGroupTarget
        :
        typeof event.plantingRecordId === "string" &&
        Boolean(event.plantingRecordId.trim()) &&
        typeof event.plantingRecordName === "string" &&
        Boolean(event.plantingRecordName.trim()) &&
        (!plantings ||
          plantings.some((planting) => planting.id === event.plantingRecordId) ||
          event.targetPlantingRecordDeleted === true) &&
        hasNoAreaTarget)
  );
}

function isGlobalCareEvent(value: unknown): value is CareEvent {
  if (!isCareEventBase(value)) return false;
  const event = value as Partial<CareEvent>;
  return (
    event.targetScope === "all-gardens" &&
    event.growingAreaId === undefined &&
    event.growingAreaName === undefined &&
    event.targetAreaDeleted === undefined &&
    event.plantingRecordId === undefined &&
    event.plantingRecordName === undefined &&
    event.targetPlantingRecordDeleted === undefined
  );
}

function isHealthRecord(
  value: unknown,
  growingAreas?: GrowingArea[],
  plantings?: PlantingRecord[],
): value is HealthRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<HealthRecord>;
  const hasNoAreaTarget =
    record.growingAreaId === undefined &&
    record.growingAreaName === undefined &&
    record.targetAreaDeleted === undefined;
  const hasNoPlantGroupTarget =
    record.plantingRecordId === undefined &&
    record.plantingRecordName === undefined &&
    record.targetPlantingRecordDeleted === undefined;
  const targetIsValid =
    record.targetScope === "garden"
      ? hasNoAreaTarget && hasNoPlantGroupTarget
      : record.targetScope === "planting-area"
        ? typeof record.growingAreaId === "string" &&
          Boolean(record.growingAreaId.trim()) &&
          typeof record.growingAreaName === "string" &&
          Boolean(record.growingAreaName.trim()) &&
          (!growingAreas || growingAreas.some((area) => area.id === record.growingAreaId) || record.targetAreaDeleted === true) &&
          hasNoPlantGroupTarget
        : record.targetScope === "plant-group" &&
          typeof record.plantingRecordId === "string" &&
          Boolean(record.plantingRecordId.trim()) &&
          typeof record.plantingRecordName === "string" &&
          Boolean(record.plantingRecordName.trim()) &&
          (!plantings || plantings.some((planting) => planting.id === record.plantingRecordId) || record.targetPlantingRecordDeleted === true) &&
          hasNoAreaTarget;
  return (
    typeof record.id === "string" &&
    Boolean(record.id.trim()) &&
    typeof record.observedOn === "string" &&
    isCalendarDate(record.observedOn) &&
    typeof record.symptoms === "string" &&
    Boolean(record.symptoms.trim()) &&
    Boolean(record.severity && healthSeverities.includes(record.severity)) &&
    Array.isArray(record.photoPaths) &&
    record.photoPaths.every((path) => typeof path === "string" && path.startsWith("/uploads/")) &&
    targetIsValid &&
    (record.assessment === undefined || isHealthAssessment(record.assessment))
  );
}

function isHealthAssessment(value: unknown): value is HealthAssessment {
  if (!value || typeof value !== "object") return false;
  const assessment = value as Partial<HealthAssessment>;
  return (
    typeof assessment.summary === "string" &&
    Boolean(assessment.summary.trim()) &&
    Array.isArray(assessment.possibleIssues) &&
    assessment.possibleIssues.every((item) => typeof item === "string" && Boolean(item.trim())) &&
    Array.isArray(assessment.nextSteps) &&
    assessment.nextSteps.every((item) => typeof item === "string" && Boolean(item.trim())) &&
    Array.isArray(assessment.followUpQuestions) &&
    assessment.followUpQuestions.every((item) => typeof item === "string" && Boolean(item.trim())) &&
    Boolean(assessment.confidence && healthSeverities.includes(assessment.confidence))
  );
}

function isVersion5CareEvent(
  value: unknown,
  growingAreas?: GrowingArea[],
): value is Version5CareEvent {
  if (!isCareEventBase(value)) return false;
  const event = value as Partial<Version5CareEvent>;
  return (
    (event.targetScope === "garden" || event.targetScope === "planting-area") &&
    (event.targetScope === "garden" ||
      (typeof event.growingAreaId === "string" &&
        Boolean(event.growingAreaId.trim()) &&
        typeof event.growingAreaName === "string" &&
        Boolean(event.growingAreaName.trim()) &&
        (!growingAreas ||
          growingAreas.some((area) => area.id === event.growingAreaId) ||
          event.targetAreaDeleted === true)))
  );
}

function isCareTask(
  value: unknown,
  growingAreas?: GrowingArea[],
  plantings?: PlantingRecord[],
): value is CareTask {
  if (!isCareTaskBase(value)) return false;
  const task = value as Partial<CareTask>;
  const hasNoAreaTarget =
    task.growingAreaId === undefined &&
    task.growingAreaName === undefined &&
    task.targetAreaDeleted === undefined;
  const hasNoPlantGroupTarget =
    task.plantingRecordId === undefined &&
    task.plantingRecordName === undefined &&
    task.targetPlantingRecordDeleted === undefined;
  const hasValidDeletionFlags =
    (task.targetAreaDeleted === undefined ||
      typeof task.targetAreaDeleted === "boolean") &&
    (task.targetPlantingRecordDeleted === undefined ||
      typeof task.targetPlantingRecordDeleted === "boolean");
  return (
    typeof task.id === "string" &&
    Boolean(task.id.trim()) &&
    Boolean(task.type && careEventTypes.includes(task.type)) &&
    typeof task.dueDate === "string" &&
    isCalendarDate(task.dueDate) &&
    typeof task.note === "string" &&
    (task.repeatIntervalDays === undefined ||
      (Number.isInteger(task.repeatIntervalDays) && task.repeatIntervalDays > 0)) &&
    hasValidDeletionFlags &&
    (task.targetScope === "garden" ||
      task.targetScope === "planting-area" ||
      task.targetScope === "plant-group") &&
    (task.targetScope === "garden"
      ? hasNoAreaTarget && hasNoPlantGroupTarget
      : task.targetScope === "planting-area"
        ? typeof task.growingAreaId === "string" &&
          Boolean(task.growingAreaId.trim()) &&
          typeof task.growingAreaName === "string" &&
          Boolean(task.growingAreaName.trim()) &&
          (!growingAreas ||
            growingAreas.some((area) => area.id === task.growingAreaId) ||
            task.targetAreaDeleted === true) &&
          hasNoPlantGroupTarget
        : typeof task.plantingRecordId === "string" &&
          Boolean(task.plantingRecordId.trim()) &&
          typeof task.plantingRecordName === "string" &&
          Boolean(task.plantingRecordName.trim()) &&
          (!plantings ||
            plantings.some((planting) => planting.id === task.plantingRecordId) ||
            task.targetPlantingRecordDeleted === true) &&
          hasNoAreaTarget)
  );
}

function isCareTaskBase(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<CareTask>;
  return (
    typeof task.id === "string" &&
    Boolean(task.id.trim()) &&
    Boolean(task.type && careEventTypes.includes(task.type)) &&
    typeof task.dueDate === "string" &&
    isCalendarDate(task.dueDate) &&
    typeof task.note === "string" &&
    (task.repeatIntervalDays === undefined ||
      (Number.isInteger(task.repeatIntervalDays) && task.repeatIntervalDays > 0)) &&
    (task.targetAreaDeleted === undefined || typeof task.targetAreaDeleted === "boolean") &&
    (task.targetPlantingRecordDeleted === undefined || typeof task.targetPlantingRecordDeleted === "boolean")
  );
}

function isGlobalCareTask(value: unknown): value is CareTask {
  if (!isCareTaskBase(value)) return false;
  const task = value as Partial<CareTask>;
  return (
    task.targetScope === "all-gardens" &&
    task.growingAreaId === undefined &&
    task.growingAreaName === undefined &&
    task.targetAreaDeleted === undefined &&
    task.plantingRecordId === undefined &&
    task.plantingRecordName === undefined &&
    task.targetPlantingRecordDeleted === undefined
  );
}

function isVersion7CareTask(
  value: unknown,
  growingAreas?: GrowingArea[],
  plantings?: PlantingRecord[],
): value is Version7CareTask {
  if (!isCareTask(value, growingAreas, plantings)) return false;
  const task = value as Version7CareTask;
  return task.completedDate === undefined || isCalendarDate(task.completedDate);
}

function isCareEventBase(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<CareEvent>;
  const hasValidOptionalFertilizerDetails =
    (event.fertilizerProduct === undefined ||
      (typeof event.fertilizerProduct === "string" &&
        Boolean(event.fertilizerProduct.trim()))) &&
    (event.fertilizerAmount === undefined ||
      (typeof event.fertilizerAmount === "number" &&
        Number.isFinite(event.fertilizerAmount) &&
        event.fertilizerAmount > 0)) &&
    (event.fertilizerUnit === undefined ||
      (typeof event.fertilizerUnit === "string" &&
        Boolean(event.fertilizerUnit.trim())));
  return (
    typeof event.id === "string" &&
    Boolean(event.id.trim()) &&
    Boolean(event.type && careEventTypes.includes(event.type)) &&
    typeof event.date === "string" &&
    isCalendarDate(event.date) &&
    typeof event.note === "string" &&
    (event.type === "fertilizing"
      ? hasValidOptionalFertilizerDetails
      : event.fertilizerProduct === undefined &&
        event.fertilizerAmount === undefined &&
        event.fertilizerUnit === undefined)
  );
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function careTaskStatus(
  task: Pick<CareTask, "dueDate">,
  today: string,
) {
  if (task.dueDate < today) return "overdue" as const;
  if (task.dueDate === today) return "due-today" as const;
  return "upcoming" as const;
}

export function todayDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function rectangularBoundary(
  widthMeters: number,
  depthMeters: number,
): LayoutPoint[] {
  return [
    { x: 0, y: 0 },
    { x: widthMeters, y: 0 },
    { x: widthMeters, y: depthMeters },
    { x: 0, y: depthMeters },
  ];
}

function isNamedRecord(value: unknown): value is { id: string; name: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      "name" in value &&
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.name === "string" &&
      value.name.trim(),
  );
}

function createId(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
