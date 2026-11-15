import { describe, expect, it } from "vitest";
import { boxesOverlap, circleOverlapsBox, estimateLabelWidth, PLANT_LABEL_HEIGHT, placePlantLabels, plantGroupText, type PlantCircle } from "@/lib/plantLabels";

const bounds = { left: 0, top: 0, right: 600, bottom: 400 };
const width = (text: string) => text.length * 7;
const box = ({ x, y, width: w, height }: { x: number; y: number; width: number; height: number }) => ({ left: x, top: y, right: x + w, bottom: y + height });
const coversNoPlant = (label: Parameters<typeof box>[0], circles: PlantCircle[]) => circles.every((circle) => !circleOverlapsBox(circle, box(label)));

describe("plant-group labels", () => {
  it("names a group with its count, and a single plant by name alone", () => {
    expect(plantGroupText("Tomato", 2)).toBe("Tomato ×2");
    expect(plantGroupText("Tomato", 1)).toBe("Tomato");
  });

  it("puts one label under each group, centred, without covering a plant", () => {
    const tomatoes = [{ x: 100, y: 100, radius: 30 }, { x: 170, y: 100, radius: 30 }];
    const basil = [{ x: 300, y: 100, radius: 12 }];
    const labels = placePlantLabels({ groups: [{ key: "tomato", name: "Tomato", circles: tomatoes }, { key: "basil", name: "Basil", circles: basil }], circles: [...tomatoes, ...basil], bounds, measure: width });
    expect(labels.map(({ key, text }) => [key, text])).toEqual([["tomato", "Tomato ×2"], ["basil", "Basil"]]);
    const [tomato] = labels;
    expect(tomato.y).toBeGreaterThanOrEqual(130);
    expect(tomato.x + tomato.width / 2).toBeCloseTo(135);
    expect(tomato.height).toBe(PLANT_LABEL_HEIGHT);
    for (const label of labels) expect(coversNoPlant(label, [...tomatoes, ...basil])).toBe(true);
  });

  it("moves above the group when another plant fills the space below", () => {
    const group = [{ x: 100, y: 100, radius: 20 }];
    const below = { x: 100, y: 140, radius: 15 };
    const [label] = placePlantLabels({ groups: [{ key: "a", name: "Kale", circles: group }], circles: [...group, below], bounds, measure: width });
    expect(label.y + label.height).toBeLessThanOrEqual(80);
    expect(coversNoPlant(label, [...group, below])).toBe(true);
  });

  it("shows only the count when the full name fits nowhere", () => {
    // A narrow pot between two neighbours: "Lettuce ×2" is wider than the free space, "×2" is not.
    const group = [{ x: 50, y: 50, radius: 10 }, { x: 70, y: 50, radius: 10 }];
    const neighbours = [{ x: 18, y: 72, radius: 12 }, { x: 102, y: 72, radius: 12 }];
    const circles = [...group, ...neighbours];
    const [label] = placePlantLabels({ groups: [{ key: "lettuce", name: "Lettuce", circles: group }], circles, bounds: { left: 0, top: 30, right: 140, bottom: 140 }, measure: width });
    expect(label).toMatchObject({ text: "×2", countOnly: true });
    expect(coversNoPlant(label, circles)).toBe(true);
  });

  it("leaves a label out when even the count would cover a plant", () => {
    const group = [{ x: 50, y: 50, radius: 10 }, { x: 70, y: 50, radius: 10 }];
    const wall = [{ x: 60, y: 90, radius: 30 }, { x: 60, y: 10, radius: 30 }, { x: 120, y: 50, radius: 30 }, { x: 0, y: 50, radius: 30 }];
    expect(placePlantLabels({ groups: [{ key: "pea", name: "Pea", circles: group }], circles: [...group, ...wall], bounds, measure: width })).toEqual([]);
  });

  it("keeps labels apart from each other, from other text, and inside the allowed bounds", () => {
    const first = [{ x: 100, y: 100, radius: 10 }];
    const second = [{ x: 104, y: 60, radius: 10 }];
    const areaName = { left: 60, top: 140, right: 160, bottom: 156 };
    const labels = placePlantLabels({
      groups: [{ key: "first", name: "Thyme", circles: first }, { key: "second", name: "Sage", circles: second }],
      circles: [...first, ...second], obstacles: [areaName], bounds: { left: 0, top: 30, right: 600, bottom: 400 }, measure: width,
    });
    expect(labels).toHaveLength(2);
    expect(boxesOverlap(box(labels[0]), box(labels[1]))).toBe(false);
    for (const label of labels) {
      expect(boxesOverlap(box(label), areaName)).toBe(false);
      expect(label.y).toBeGreaterThanOrEqual(30);
    }
  });

  it("measures non-Latin names wider than Latin ones", () => {
    expect(estimateLabelWidth("番茄")).toBeGreaterThan(estimateLabelWidth("ab"));
  });
});
