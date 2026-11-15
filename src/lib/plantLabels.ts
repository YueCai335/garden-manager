/**
 * Plant-group labels on the Garden Plan (ADR-0073 S4). Every group of the same
 * plant in an area gets one label, such as "Tomato ×2". Labels follow the G1
 * rule of ADR-0072: they never cover a plant. A label tries a few spots around
 * its group; when the full text fits nowhere it shows only the count ("×2"),
 * and when even that fits nowhere it is left out (the legend and the plant
 * panel still say what grows there).
 *
 * Everything here is in canvas pixels and has no React or Konva dependency.
 */

export type Box = { left: number; top: number; right: number; bottom: number };
export type PlantCircle = { x: number; y: number; radius: number };
export type PlantGroup = {
  key: string;
  /** The plant name, such as "Tomato". */
  name: string;
  circles: PlantCircle[];
};
export type PlacedPlantLabel = {
  key: string;
  text: string;
  /** True when only the count fitted. */
  countOnly: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PLANT_LABEL_HEIGHT = 16;
const GAP = 3;

/** Rough width of 12 px semibold text; generous so collision boxes never undercount. */
export function estimateLabelWidth(text: string) {
  return Array.from(text).reduce((pixels, character) => pixels + (character.charCodeAt(0) < 128 ? 7 : 12), 6);
}

export function plantGroupText(name: string, count: number) {
  return count > 1 ? `${name} ×${count}` : name;
}

export function boxesOverlap(first: Box, second: Box) {
  return first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
}

/** True when the circle reaches into the box (touching edges do not count). */
export function circleOverlapsBox(circle: PlantCircle, box: Box) {
  const nearestX = Math.max(box.left, Math.min(circle.x, box.right));
  const nearestY = Math.max(box.top, Math.min(circle.y, box.bottom));
  return Math.hypot(circle.x - nearestX, circle.y - nearestY) < circle.radius;
}

function groupBounds(circles: PlantCircle[]): Box {
  return {
    left: Math.min(...circles.map(({ x, radius }) => x - radius)),
    right: Math.max(...circles.map(({ x, radius }) => x + radius)),
    top: Math.min(...circles.map(({ y, radius }) => y - radius)),
    bottom: Math.max(...circles.map(({ y, radius }) => y + radius)),
  };
}

/** Spots to try, best first: under the group, above it, then to its right and left. */
function candidates(group: Box, width: number, height: number): Box[] {
  const centreX = (group.left + group.right) / 2 - width / 2;
  const centreY = (group.top + group.bottom) / 2 - height / 2;
  return [
    { left: centreX, top: group.bottom + GAP },
    { left: centreX, top: group.top - GAP - height },
    { left: group.right + GAP + 1, top: centreY },
    { left: group.left - GAP - 1 - width, top: centreY },
  ].map(({ left, top }) => ({ left, top, right: left + width, bottom: top + height }));
}

/**
 * Places one label per group. `circles` lists every plant drawn on the canvas,
 * `obstacles` lists other text (area names and sizes), and `bounds` is the part of
 * the canvas a label may use (inside the canvas and clear of floating layers).
 */
export function placePlantLabels({
  groups,
  circles,
  obstacles = [],
  bounds,
  measure = estimateLabelWidth,
}: {
  groups: PlantGroup[];
  circles: PlantCircle[];
  obstacles?: Box[];
  bounds: Box;
  measure?: (text: string) => number;
}): PlacedPlantLabel[] {
  const taken = [...obstacles];
  const placed: PlacedPlantLabel[] = [];
  const fits = (box: Box) =>
    box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom &&
    !circles.some((circle) => circleOverlapsBox(circle, box)) &&
    !taken.some((other) => boxesOverlap(other, box));
  for (const group of groups) {
    if (!group.circles.length) continue;
    const area = groupBounds(group.circles);
    const count = group.circles.length;
    const texts = [{ text: plantGroupText(group.name, count), countOnly: false }];
    if (count > 1) texts.push({ text: `×${count}`, countOnly: true });
    for (const { text, countOnly } of texts) {
      const width = measure(text);
      const spot = candidates(area, width, PLANT_LABEL_HEIGHT).find(fits);
      if (!spot) continue;
      taken.push(spot);
      placed.push({ key: group.key, text, countOnly, x: spot.left, y: spot.top, width, height: PLANT_LABEL_HEIGHT });
      break;
    }
  }
  return placed;
}
