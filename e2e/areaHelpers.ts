import { expect, type Page } from "@playwright/test";

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
