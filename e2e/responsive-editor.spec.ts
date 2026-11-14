import { expect, test } from "@playwright/test";
import { fitCanvas, metresToCanvas } from "../src/lib/canvasViewport";
import { createDemoGardenWorkspace, gardenPlanViewport } from "../src/lib/gardenWorkspace";
import { openAreaProperties } from "./areaHelpers";

for (const width of [390, 900, 1280, 1440]) {
  test(`garden details and area editing preserve context at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await expect(page.getByLabel("Garden name", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete garden", exact: true })).not.toBeVisible();
    await page.getByText("Garden settings", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete garden", exact: true })).toBeVisible();
    await page.getByText("Garden settings", { exact: true }).click();
    await page.getByRole("button", { name: "Edit garden details" }).click();
    await page.getByLabel("Garden name", { exact: true }).fill("Kitchen garden");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("region", { name: "Garden properties" })).toContainText("Kitchen garden");
    if (width === 390) {
      const canvas = page.getByRole("button", { name: "Move planting areas" }).locator("..").locator("..").locator(".konvajs-content");
      await expect(canvas).toBeVisible();
      const box = (await canvas.boundingBox())!;
      const [garden] = createDemoGardenWorkspace().gardens;
      const [area] = garden.growingAreas;
      const transform = fitCanvas(gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"), box.width, box.height)!;
      await canvas.click({ position: metresToCanvas({ x: area.planPlacement.x + 0.2, y: area.planPlacement.y + 0.2 }, transform) });
      await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
      const selected = page.getByRole("region", { name: "Sample raised bed" });
      await expect(selected).toContainText("Raised bed · 3 × 1.2 m");
      await selected.getByRole("link", { name: "Edit area" }).click();
    } else {
      await openAreaProperties(page, "Sample raised bed");
    }
    const panel = page.locator('dialog[aria-labelledby="edit-planting-area-heading"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Edit planting area", exact: true })).toBeInViewport();
    if (width === 390) {
      await expect(panel).toHaveAttribute("data-mode", "mobile");
      await expect(page.getByRole("button", { name: "Move planting areas" })).not.toBeVisible();
    } else if (width === 900) {
      await expect(panel).toHaveAttribute("aria-modal", "true");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      const close = panel.getByRole("button", { name: "Close", exact: true });
      await close.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(panel.getByRole("button", { name: "Delete area", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      for (let index = 0; index < 20; index++) {
        await page.keyboard.press("Tab");
        expect(await panel.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
    } else {
      await expect(panel).toHaveAttribute("data-mode", "wide");
      const plan = page.getByRole("button", { name: "Move planting areas" }).locator("..").locator("..");
      const canvasBox = (await plan.boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      expect(canvasBox.width).toBeGreaterThanOrEqual(640);
      expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(panelBox.x);
    }
    await page.getByLabel("Area X position (m)").fill("2.34");
    await page.getByLabel("Area Y position (m)").fill("1.27");
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true });
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
    await expect(page.getByLabel("Area X position (m)")).toHaveValue("2.34");
    const back = panel.getByRole("button", { name: /^(Close|Back to plan)$/ });
    await back.click();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Area Y position (m)")).toHaveValue("1.27");
    await page.getByRole("button", { name: "Move right 0.1 m" }).click();
    await expect(page.getByLabel("Area X position (m)")).toHaveValue("2.4");
    await panel.getByRole("button", { name: "Save", exact: true }).click();
    await back.click();
    if (width === 390) {
      // Now wide: closing the side panel returns to the whole garden.
      await expect(page.getByRole("link", { name: "Edit Sample raised bed" })).toBeFocused();
      await expect(page).toHaveURL(/\/plan$/);
    } else {
      // Now a phone: closing the properties page returns to the zoomed area.
      await expect(page.getByRole("link", { name: "Edit area", exact: true })).toBeFocused();
      await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
      await page.getByRole("button", { name: "Whole garden" }).click();
    }
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await page.reload();
    await openAreaProperties(page, "Sample raised bed");
    await expect(page.getByLabel("Area X position (m)")).toHaveValue("2.4");
    await expect(page.getByLabel("Area Y position (m)")).toHaveValue("1.3");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test.describe("touch editing", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("tap selects a planting area and opens the mobile editor", async ({ page }) => {
    const [garden] = createDemoGardenWorkspace().gardens;
    const [area] = garden.growingAreas;
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).tap();
    await page.getByRole("link", { name: "Open Demo Garden" }).tap();
    const canvas = page.getByRole("button", { name: "Move planting areas" }).locator("..").locator("..").locator(".konvajs-content");
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const transform = fitCanvas(gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"), box.width, box.height)!;
    const position = metresToCanvas({ x: area.planPlacement.x + 0.2, y: area.planPlacement.y + 0.2 }, transform);
    await canvas.tap({ position });
    await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
    const selected = page.getByRole("region", { name: area.name });
    await expect(selected.getByRole("button", { name: "Edit Tomato" })).toBeVisible();
    await selected.getByRole("link", { name: "Edit area" }).tap();
    const panel = page.getByRole("region", { name: "Edit planting area" });
    await expect(panel).toHaveAttribute("data-mode", "mobile");
    await expect(panel.getByLabel("Planting-area name")).toHaveValue(area.name);
    await panel.getByRole("button", { name: "Back to plan", exact: true }).tap();
    await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
    await expect(selected).toBeVisible();
  });
});
