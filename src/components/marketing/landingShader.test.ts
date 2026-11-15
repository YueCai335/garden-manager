import { describe, expect, it } from "vitest";
import {
  bandToPhoto,
  canvasPixelRatio,
  footerPreset,
  heroPreset,
  idleLight,
  luminanceRange,
  nodeOpacity,
  photoToBand,
  pickVeinNodes,
  placeVeinNodes,
  textureScale,
} from "./landingShader";

const band = { width: 1200, height: 640 };
const photo = { width: 2000, height: 2667 };

describe("band and photo coordinates", () => {
  it("maps the band centre to the photo centre", () => {
    expect(bandToPhoto([600, 320], heroPreset.angle, band, photo)).toEqual([0.5, 0.5]);
  });

  it("round-trips a band point through the photo for a rotated preset", () => {
    for (const point of [[0, 0], [1200, 640], [180, 520], [900, 40]] as Array<[number, number]>) {
      const [x, y] = photoToBand(bandToPhoto(point, heroPreset.angle, band, photo), heroPreset.angle, band, photo);
      expect(x).toBeCloseTo(point[0], 6);
      expect(y).toBeCloseTo(point[1], 6);
    }
  });

  it("covers the band: every band corner lands inside the photo", () => {
    for (const corner of [[0, 0], [1200, 0], [0, 640], [1200, 640]] as Array<[number, number]>) {
      const [u, v] = bandToPhoto(corner, heroPreset.angle, band, photo);
      expect(u).toBeGreaterThanOrEqual(-1e-9);
      expect(u).toBeLessThanOrEqual(1 + 1e-9);
      expect(v).toBeGreaterThanOrEqual(-1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe("vein nodes", () => {
  it("picks the brightest local peaks and keeps them apart", () => {
    const width = 60;
    const height = 40;
    const luminance = new Float32Array(width * height).fill(0.2);
    luminance[20 * width + 15] = 0.9;
    luminance[20 * width + 17] = 0.8; // too close to the first peak
    luminance[25 * width + 45] = 0.7;
    const nodes = pickVeinNodes({ width, height, luminance });
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ u: 15.5 / width, v: 20.5 / height });
    expect(nodes[1]).toMatchObject({ u: 45.5 / width, v: 25.5 / height });
    expect(nodes[0].strength).toBeGreaterThan(nodes[1].strength);
  });

  it("returns no nodes for a flat photo and respects the limit", () => {
    const flat = { width: 40, height: 40, luminance: new Float32Array(1600).fill(0.5) };
    expect(pickVeinNodes(flat)).toEqual([]);
    const width = 200;
    const luminance = new Float32Array(width * width).fill(0.1);
    for (let y = 10; y < 190; y += 12) for (let x = 10; x < 190; x += 12) luminance[y * width + x] = 0.9;
    expect(pickVeinNodes({ width, height: width, luminance }, { limit: 5 })).toHaveLength(5);
  });

  it("places nodes on the band and drops the ones outside it", () => {
    const placed = placeVeinNodes([{ u: 0.5, v: 0.5 }, { u: 0.001, v: 0.001 }], footerPreset.angle, band, photo);
    expect(placed).toHaveLength(1);
    expect(placed[0][0]).toBeCloseTo(600, 6);
    expect(placed[0][1]).toBeCloseTo(320, 6);
  });

  it("caps the node count by the band area", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ u: 0.3 + i * 0.01, v: 0.5 }));
    expect(placeVeinNodes(many, 0, { width: 1100, height: 400 }, photo)).toHaveLength(20);
    expect(placeVeinNodes(many, 0, { width: 360, height: 300 }, photo)).toHaveLength(5);
  });

  it("glows a node under the light and dims it far away", () => {
    expect(nodeOpacity([100, 100], [100, 100], 400)).toBeCloseTo(1, 6);
    expect(nodeOpacity([100, 100], [1100, 600], 400)).toBeCloseTo(0.12, 2);
  });
});

describe("render settings", () => {
  it("caps the canvas pixel ratio at 2 and defaults to 1", () => {
    expect(canvasPixelRatio(3)).toBe(2);
    expect(canvasPixelRatio(1.5)).toBe(1.5);
    expect(canvasPixelRatio(undefined)).toBe(1);
    expect(canvasPixelRatio(0)).toBe(1);
  });

  it("keeps the tuned look on a larger export by shifting mip levels", () => {
    expect(textureScale(footerPreset, 2000)).toEqual({ lodShift: 1, sampleStep: 6 });
    expect(textureScale(heroPreset, 1500)).toEqual({ lodShift: 0, sampleStep: 10 });
  });

  it("stretches the gradient map between the 3rd and 97th percentiles", () => {
    const values = Array.from({ length: 100 }, (_, i) => i / 100);
    expect(luminanceRange(values)).toEqual({ low: 0.03, high: 0.97 });
    expect(luminanceRange([])).toEqual({ low: 0, high: 1 });
    const flat = luminanceRange([0.4, 0.4, 0.4]);
    expect(flat.high).toBeGreaterThan(flat.low);
  });

  it("keeps the idle light inside the band", () => {
    for (let t = 0; t < 60; t += 0.7) {
      const [x, y] = idleLight(t, 1000, 500);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1000);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(500);
    }
  });
});
