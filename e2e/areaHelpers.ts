import { expect, type Page } from "@playwright/test";
import { fitCanvas, insetViewport, overlayInsets, type CanvasTransform, type OverlayCorner } from "../src/lib/canvasViewport";
import type { GardenPlanViewport } from "../src/lib/gardenWorkspace";

/**
 * Opens a planting area from the area list and shows its properties. Wide
 * layouts show properties beside the plan; narrower layouts zoom the plan,
 * show plants below it, and open properties from "Edit area" (ADR-0072, G3).
 */
export async function openAreaProperties(page: Page, areaName: string) {
  await page.getByRole("link", { name: `Edit ${areaName}` }).click();
  await expect(page.getByRole("button", { name: "Whole garden" })).toBeVisible();
  const editArea = page.getByRole("link", { name: "Edit area", exact: true });
  if (await editArea.count()) await editArea.click();
  await expect(page.getByLabel("Planting-area name")).toBeVisible();
}

/** The Garden Plan canvas surface: carries data-focused-area, data-zooming, and data-placing. */
export function planSurface(page: Page) {
  return page.getByTestId("garden-plan-canvas");
}

/** The Konva content element inside the Garden Plan canvas; its box is the drawing area. */
export function planCanvas(page: Page) {
  return planSurface(page).locator(".konvajs-content");
}

/**
 * The canvas transform the app draws with when it frames `target`. From 900 px the
 * toolbar, zoom, legend, and area panel float over the canvas and framing keeps the
 * target clear of them (ADR-0073 S4), so this measures those layers and applies the
 * same pure functions the app uses. Without floating layers it is plain `fitCanvas`.
 */
export async function planTransform(page: Page, target: GardenPlanViewport): Promise<CanvasTransform> {
  const measured = await planSurface(page).evaluate((surface) => {
    const stage = surface.parentElement!;
    const base = stage.getBoundingClientRect();
    const size = surface.getBoundingClientRect();
    const layers = [...stage.querySelectorAll<HTMLElement>(":scope > [data-corner]")].map((layer) => {
      const box = layer.getBoundingClientRect();
      return { corner: layer.dataset.corner!, left: box.left - base.left, top: box.top - base.top, right: box.right - base.left, bottom: box.bottom - base.top };
    });
    return { stage: { width: base.width, height: base.height }, width: Math.floor(size.width), height: Math.floor(size.height), layers };
  });
  const raw = overlayInsets(measured.stage, measured.layers.map((layer) => ({ ...layer, corner: layer.corner as OverlayCorner })));
  const insets = { top: Math.ceil(raw.top), right: Math.ceil(raw.right), bottom: Math.ceil(raw.bottom), left: Math.ceil(raw.left) };
  return fitCanvas(insetViewport(target, measured.width, measured.height, 34, insets), measured.width, measured.height)!;
}
