import { areaAppearances, gardenPlantColors, type PlantColors } from "@/lib/planAppearance";

/**
 * The landing page's Garden Plan showcase (ADR-0084): a fixed sample backyard, drawn
 * in scene pixels at 44 px per metre, and the timed sequence that builds it, lifts its
 * three layers apart, and closes them again. The scene data never follows the demo
 * workspace, so changes to the demo cannot break the landing page.
 */
export const PX_PER_METRE = 44;
export const SHEET = { width: 10 * PX_PER_METRE, height: 6 * PX_PER_METRE };
/** How far each layer moves on the z axis while the layers are apart. */
export const EXPLODE_Z = [-130, -10, 110] as const;

export type SceneTag = { x: number; y: number; z: number; name: string; detail?: string };

export type SceneArea =
  | { id: string; kind: "raised-bed"; x: number; y: number; width: number; height: number; tag: SceneTag }
  | { id: string; kind: "container"; cx: number; cy: number; r: number; tag: SceneTag }
  | { id: string; kind: "in-ground"; x: number; y: number; width: number; height: number; tag: SceneTag };

export const sceneAreas: SceneArea[] = [
  { id: "area-bed-a", kind: "raised-bed", x: 26, y: 31, width: 132, height: 53, tag: { x: 92, y: 31, z: 15, name: "Raised bed", detail: "3 × 1.2 m" } },
  { id: "area-bed-b", kind: "raised-bed", x: 26, y: 110, width: 132, height: 53, tag: { x: 92, y: 110, z: 15, name: "Raised bed", detail: "3 × 1.2 m" } },
  { id: "area-pot-a", kind: "container", cx: 246, cy: 60, r: 25, tag: { x: 246, y: 35, z: 18, name: "Pot", detail: "Ø 1.1 m" } },
  { id: "area-pot-b", kind: "container", cx: 318, cy: 64, r: 17, tag: { x: 318, y: 47, z: 18, name: "Pot", detail: "Ø 0.8 m" } },
  { id: "area-ground", kind: "in-ground", x: 206, y: 140, width: 200, height: 96, tag: { x: 306, y: 140, z: 4, name: "In-ground bed", detail: "4.5 × 2.2 m" } },
];

export type CropId = "tomato" | "lettuce" | "basil" | "marigold" | "carrot";
export type ScenePlant = { id: string; crop: CropId; cx: number; cy: number; r: number; z: number };

const cropNames: Record<CropId, string> = { tomato: "Tomato", lettuce: "Lettuce", basil: "Basil", marigold: "Marigold", carrot: "Carrot" };

/** Plant colours come from the plan's own palette (ADR-0076), as the app would pick them for this garden. */
const paletteForGarden = gardenPlantColors(Object.values(cropNames).map((name) => ({ label: name, plantType: name })));
export const cropColors = Object.fromEntries(
  (Object.keys(cropNames) as CropId[]).map((crop) => [crop, paletteForGarden.get(cropNames[crop].toLocaleLowerCase())!]),
) as Record<CropId, PlantColors>;

export const scenePlants: ScenePlant[] = [
  ...[59, 92, 125].map((cx) => ({ crop: "tomato" as const, cx, cy: 57.5, r: 14, z: 10 })),
  ...[44, 69, 94, 119, 144].map((cx) => ({ crop: "lettuce" as const, cx, cy: 136.5, r: 8, z: 10 })),
  { crop: "basil" as const, cx: 246, cy: 60, r: 12, z: 13 },
  { crop: "marigold" as const, cx: 318, cy: 64, r: 9, z: 13 },
  ...[168, 208].flatMap((cy) => [232, 262, 292, 322, 352, 382].map((cx) => ({ crop: "carrot" as const, cx, cy, r: 7, z: 1 }))),
].map((plant, index) => ({ ...plant, id: `plant-${index}` }));

/** Each crop group lands together with its name, so plants and names read as one layer. */
const plantTagPositions: Record<CropId, Omit<SceneTag, "name">> = {
  tomato: { x: 92, y: 31, z: 30 },
  lettuce: { x: 92, y: 110, z: 26 },
  basil: { x: 246, y: 40, z: 30 },
  marigold: { x: 322, y: 52, z: 30 },
  carrot: { x: 306, y: 150, z: 12 },
};
export const crops = Object.keys(cropNames) as CropId[];
export const plantTags = crops.map((crop) => ({
  id: `plant-tag-${crop}`,
  crop,
  ...plantTagPositions[crop],
  name: `${cropNames[crop]} ×${scenePlants.filter((plant) => plant.crop === crop).length}`,
  /** On a phone each group shows only this letter on the scene; the legend below names it. */
  letter: cropNames[crop][0],
}));

export const gardenTag: SceneTag & { id: string } = { id: "garden-tag", x: 0, y: SHEET.height, z: 6, name: "Backyard", detail: "your garden" };
export const layerMarkers = ["Your garden", "Planting areas", "Plants"] as const;

/** The plan's area colours, so the showcase matches the app's canvas. */
export const sceneColors = {
  raisedBedSoil: "#e7dfd2",
  raisedBedRim: "#a07d58",
  containerRim: "#c4805e",
  containerWall: areaAppearances.container.stroke,
  inGround: areaAppearances["in-ground"],
};

export type ShowcaseState = {
  /** Items that have dropped into place. Every other item waits above the scene, hidden. */
  landed: readonly string[];
  outline: boolean;
  rulers: boolean;
  /** The step, layer shelf, and marker that are lit together, or none. */
  active: number | null;
  /** Steps before this index are done. */
  reached: number;
  exploded: boolean;
  /** How many layer markers show. */
  markers: number;
  /** Area names step back once plants arrive, so only plant names stay. */
  areaTagsHidden: boolean;
  summary: boolean;
};

export type ShowcaseAction =
  | { type: "activate"; step: number | null }
  | { type: "land"; id: string }
  | { type: "outline" }
  | { type: "rulers" }
  | { type: "hideAreaTags" }
  | { type: "explode" }
  | { type: "marker"; index: number }
  | { type: "collapse" }
  | { type: "finish" };

export const initialShowcaseState: ShowcaseState = {
  landed: [], outline: false, rulers: false, active: null, reached: 0, exploded: false, markers: 0, areaTagsHidden: false, summary: false,
};

export function applyShowcaseAction(state: ShowcaseState, action: ShowcaseAction): ShowcaseState {
  switch (action.type) {
    case "activate": return { ...state, active: action.step, reached: Math.max(state.reached, action.step ?? 0) };
    case "land": return state.landed.includes(action.id) ? state : { ...state, landed: [...state.landed, action.id] };
    case "outline": return { ...state, outline: true };
    case "rulers": return { ...state, rulers: true };
    case "hideAreaTags": return { ...state, areaTagsHidden: true };
    case "explode": return { ...state, exploded: true };
    case "marker": return { ...state, markers: Math.max(state.markers, action.index + 1) };
    case "collapse": return { ...state, exploded: false, markers: 0 };
    case "finish": return { ...state, active: null, reached: layerMarkers.length, summary: true };
  }
}

export type TimedAction = { at: number; action: ShowcaseAction };

/**
 * Build, explode, close (ADR-0084): draw the garden, drop in the planting areas, plant
 * each crop group with its name, then lift the three layers apart and name each one,
 * and close them into the finished plan. Times are milliseconds from the start.
 */
export function showcaseTimeline(): TimedAction[] {
  const events: TimedAction[] = [];
  let t = 250;
  const at = (action: ShowcaseAction, time = t) => events.push({ at: time, action });

  at({ type: "activate", step: 0 });
  at({ type: "land", id: "ground" });
  t += 650; at({ type: "outline" });
  t += 900; at({ type: "rulers" }); at({ type: "land", id: gardenTag.id });
  t += 1000;

  at({ type: "activate", step: 1 });
  for (const area of sceneAreas) {
    at({ type: "land", id: area.id });
    at({ type: "land", id: `${area.id}-tag` }, t + 260);
    t += 420;
  }
  t += 700;

  at({ type: "activate", step: 2 });
  at({ type: "hideAreaTags" });
  for (const tag of plantTags) {
    at({ type: "land", id: tag.id });
    for (const plant of scenePlants.filter((candidate) => candidate.crop === tag.crop)) { at({ type: "land", id: plant.id }); t += 45; }
    t += 260;
  }
  t += 900;

  at({ type: "activate", step: null });
  at({ type: "explode" });
  t += 900;
  layerMarkers.forEach((_, index) => {
    at({ type: "marker", index });
    at({ type: "activate", step: index });
    t += 1100;
  });
  at({ type: "activate", step: null });
  t += 500; at({ type: "collapse" });
  t += 1000; at({ type: "finish" });
  return events.sort((first, second) => first.at - second.at);
}

/** Every item in the scene, in the order the timeline lands them. */
export const allSceneItemIds = ["ground", gardenTag.id, ...sceneAreas.flatMap((area) => [area.id, `${area.id}-tag`]), ...plantTags.flatMap((tag) => [tag.id, ...scenePlants.filter((plant) => plant.crop === tag.crop).map((plant) => plant.id)])];

/** The finished plan: shown at the end of the sequence and, with reduced motion, from the start. */
export const finalShowcaseState: ShowcaseState = {
  landed: allSceneItemIds, outline: true, rulers: true, active: null, reached: layerMarkers.length, exploded: false, markers: 0, areaTagsHidden: true, summary: true,
};
