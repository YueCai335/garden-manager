import { expect, type Page } from "@playwright/test";
import { fitCanvas, insetViewport, overlayInsets, type CanvasTransform, type OverlayCorner } from "../src/lib/canvasViewport";
import type { GardenPlanViewport } from "../src/lib/gardenWorkspace";

/** Switches the Garden Plan to a level (ADR-0075), keeping the open or selected area. */
export async function goToLevel(page: Page, name: "Garden" | "Planting areas" | "Plants") {
  const level = page.getByRole("navigation", { name: "Garden Plan levels" }).getByRole("button", { name, exact: true });
  await level.click();
  await expect(level).toHaveAttribute("aria-current", "true");
  // Leaving Garden reframes the canvas with a short zoom; wait two frames for it to start, then for it to end.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(planSurface(page)).toHaveAttribute("data-zooming", "false");
}

/**
 * Selects a planting area on the Planting areas level and shows its
 * properties. Wide layouts show them beside the plan; narrower layouts show
 * the area's card below it and open properties from "Edit area" (ADR-0075).
 */
export async function openAreaProperties(page: Page, areaName: string) {
  await goToLevel(page, "Planting areas");
  await page.getByRole("link", { name: `Edit ${areaName}` }).click();
  await expect(page).toHaveURL(/level=areas&area=/);
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
