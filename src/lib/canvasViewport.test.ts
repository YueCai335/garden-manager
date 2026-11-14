import { describe, expect, it } from "vitest";
import { canvasGridTicks, canvasToMetres, fitCanvas, interpolateViewport, metresToCanvas } from "./canvasViewport";
import { createRectangularLayout, gardenPlanViewport, type GrowingArea } from "./gardenWorkspace";

describe("canvas transforms", () => {
  it("does not divide by unmeasured, nonfinite, or invalid sizes", () => {
    const bounds = { x: 0, y: 0, widthMeters: 10, depthMeters: 5 };
    expect(fitCanvas(bounds, 0, 320)).toBeUndefined();
    expect(fitCanvas(bounds, 390, 0)).toBeUndefined();
    expect(fitCanvas(bounds, NaN, 320)).toBeUndefined();
    expect(fitCanvas({ ...bounds, depthMeters: 0 }, 390, 320)).toBeUndefined();
  });
  it.each([[358, 320], [680, 420], [1100, 480]])("fits both dimensions and round-trips real coordinates at %sx%s", (width, height) => {
    const bounds = { x: -5, y: -3, widthMeters: 60, depthMeters: 45 };
    const transform = fitCanvas(bounds, width, height)!;
    const edge = metresToCanvas({ x: 55, y: 42 }, transform);
    expect(edge.x).toBeLessThanOrEqual(width - transform.padding);
    expect(edge.y).toBeLessThanOrEqual(height - transform.padding);
    const point = { x: -2.4, y: 4.7 };
    const restored = canvasToMetres(metresToCanvas(point, transform), transform);
    expect(restored.x).toBeCloseTo(point.x);
    expect(restored.y).toBeCloseTo(point.y);
  });
  it("fits rotated beds crossing negative bounds and keeps a huge empty garden bounded", () => {
    const area: GrowingArea = { id: "bed", name: "Bed", kind: "raised-bed", planPlacement: { x: 0, y: 0, rotationDegrees: 135 }, layout: createRectangularLayout(4, 2) };
    const plan = { widthMeters: 100000, depthMeters: 100000 };
    const focus = fitCanvas(gardenPlanViewport(plan, [area], "growing-areas"), 358, 320)!;
    expect(focus.bounds.x).toBeLessThan(0);
    for (const point of area.layout!.boundary) {
      const angle = 135 * Math.PI / 180;
      const pixel = metresToCanvas({ x: point.x * Math.cos(angle) - point.y * Math.sin(angle), y: point.x * Math.sin(angle) + point.y * Math.cos(angle) }, focus);
      expect(pixel.x).toBeGreaterThanOrEqual(34);
      expect(pixel.x).toBeLessThanOrEqual(324);
      expect(pixel.y).toBeGreaterThanOrEqual(34);
      expect(pixel.y).toBeLessThanOrEqual(286);
    }
    const full = fitCanvas(gardenPlanViewport(plan, [], "full"), 358, 320)!;
    expect(full.scale).toBeLessThan(1);
    expect(canvasGridTicks(0, plan.widthMeters, full.scale).length).toBeLessThan(10);
    expect(canvasGridTicks(0, plan.widthMeters, full.scale)).toContain(0);
  });
});

describe("viewport zoom animation", () => {
  const from = { x: 0, y: 0, widthMeters: 10, depthMeters: 8 };
  const to = { x: 2, y: 3, widthMeters: 2, depthMeters: 1 };
  it("starts at the current frame, ends at the target, and eases through the middle", () => {
    expect(interpolateViewport(from, to, 0)).toEqual(from);
    expect(interpolateViewport(from, to, 1)).toEqual(to);
    expect(interpolateViewport(from, to, 0.5)).toEqual({ x: 1, y: 1.5, widthMeters: 6, depthMeters: 4.5 });
    expect(interpolateViewport(from, to, 0.1).x).toBeLessThan(0.2);
  });
  it("clamps progress outside 0 to 1", () => {
    expect(interpolateViewport(from, to, -1)).toEqual(from);
    expect(interpolateViewport(from, to, 3)).toEqual(to);
  });
});
