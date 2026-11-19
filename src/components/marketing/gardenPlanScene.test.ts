import { expect, it } from "vitest";
import { plantSwatches } from "@/lib/planAppearance";
import {
  allSceneItemIds,
  applyShowcaseAction,
  cropColors,
  finalShowcaseState,
  initialShowcaseState,
  plantTags,
  sceneAreas,
  scenePlants,
  showcaseTimeline,
} from "./gardenPlanScene";

function runTimeline() {
  const states = [initialShowcaseState];
  for (const { action } of showcaseTimeline()) states.push(applyShowcaseAction(states.at(-1)!, action));
  return states;
}

it("ends the sequence on the finished plan with every item landed", () => {
  const end = runTimeline().at(-1)!;
  expect({ ...end, landed: [...end.landed].sort() }).toEqual({ ...finalShowcaseState, landed: [...allSceneItemIds].sort() });
  expect(new Set(allSceneItemIds).size).toBe(allSceneItemIds.length);
});

it("builds the three steps in order, then lights each layer in turn while apart, then closes", () => {
  const timeline = showcaseTimeline();
  const actives = timeline.filter(({ action }) => action.type === "activate").map(({ action }) => action.type === "activate" && action.step);
  expect(actives).toEqual([0, 1, 2, null, 0, 1, 2, null]);
  const kinds = timeline.map(({ action }) => action.type);
  const explode = kinds.indexOf("explode");
  const markerIndices = kinds.flatMap((kind, index) => kind === "marker" ? [index] : []);
  expect(markerIndices).toHaveLength(3);
  expect(markerIndices.every((index) => index > explode && index < kinds.indexOf("collapse"))).toBe(true);
  expect(kinds.at(-1)).toBe("finish");
  // Times only move forward.
  expect(timeline.every((event, index) => index === 0 || event.at >= timeline[index - 1].at)).toBe(true);
});

it("lands each planting area before plants, and each crop group with its name", () => {
  const states = runTimeline();
  const firstPlantState = states.findIndex((state) => state.landed.some((id) => id.startsWith("plant-")));
  for (const area of sceneAreas) expect(states[firstPlantState - 1].landed).toContain(area.id);
  // A name tag lands no later than the first plant of its group.
  const landOrder = showcaseTimeline().flatMap(({ action }) => action.type === "land" ? [action.id] : []);
  for (const tag of plantTags) {
    const group = scenePlants.filter((plant) => plant.crop === tag.crop).map((plant) => landOrder.indexOf(plant.id));
    expect(landOrder.indexOf(tag.id)).toBeLessThan(Math.min(...group));
  }
});

it("colors the sample plants with the plan's own palette", () => {
  expect(cropColors.tomato).toEqual(plantSwatches.red);
  for (const color of Object.values(cropColors)) expect(color.stroke).toMatch(/^#[0-9a-f]{6}$/);
  expect(new Set(Object.values(cropColors).map((color) => color.stroke)).size).toBe(5);
});
