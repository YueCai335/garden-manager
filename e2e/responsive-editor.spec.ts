import { expect, test } from "@playwright/test";
import { metresToCanvas } from "../src/lib/canvasViewport";
import { createDemoGardenWorkspace, gardenPlanViewport, type GardenWorkspace } from "../src/lib/gardenWorkspace";
import { goToLevel, openAreaProperties, planCanvas, planSurface, planTransform } from "./areaHelpers";
import { openWorkspace } from "./workspace";

// 820 px keeps the overlay editor; from 900 px the area panel sits in its own column beside the canvas.
for (const width of [390, 820, 900, 1440]) {
  test(`garden details and area editing preserve context at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    // The garden opens on Plants; its name, size, and Delete garden sit on the Garden level (ADR-0075).
    await expect(page.getByLabel("Garden name", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete garden", exact: true })).toHaveCount(0);
    await expect(page.getByText("Garden settings", { exact: true })).toHaveCount(0);
    await goToLevel(page, "Garden");
    await expect(page.getByRole("button", { name: "Delete garden", exact: true })).toBeVisible();
    await page.getByLabel("Garden name", { exact: true }).fill("Kitchen garden");
    await page.getByLabel("Garden name", { exact: true }).press("Enter");
    await expect(page.getByLabel("Garden name", { exact: true })).toHaveValue("Kitchen garden");
    if (width === 390) {
      // On a phone, a tapped bed opens on Plants; its card's "Edit area" opens the properties page.
      await goToLevel(page, "Plants");
      const canvas = planCanvas(page);
      await expect(canvas).toBeVisible();
      const [garden] = createDemoGardenWorkspace().gardens;
      const [area] = garden.growingAreas;
      const transform = await planTransform(page, gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"));
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
    } else if (width === 820) {
      await expect(panel).toHaveAttribute("aria-modal", "true");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
      const close = panel.getByRole("button", { name: "Done", exact: true });
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
      // The panel sits beside the canvas, 320 px wide, and covers none of it.
      const canvasBox = (await planSurface(page).boundingBox())!;
      const panelBox = (await panel.boundingBox())!;
      expect(Math.round(panelBox.width)).toBe(320);
      expect(panelBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width);
    }
    // A valid value applies when focus leaves its field (ADR-0072, phase G5).
    await page.getByLabel("Area X position (m)").fill("2.34");
    await page.getByLabel("Area Y position (m)").fill("");
    await page.getByLabel("Planting-area name").focus();
    await expect(page.getByLabel("Area X position (m)")).toHaveValue("2.3");
    // A blank value cannot apply: it stays as a draft with its error, across a layout change.
    await expect(page.getByText("Not applied yet: fix the highlighted values.", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`editor-${width}.png`), fullPage: true });
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
    await expect(page.getByLabel("Area Y position (m)")).toHaveValue("");
    const back = panel.getByRole("button", { name: "Done", exact: true });
    await back.click();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await page.getByLabel("Area Y position (m)").fill("1.27");
    await page.getByLabel("Area Y position (m)").press("Enter");
    await page.getByLabel("Area X position (m)").fill("2.4");
    await page.getByLabel("Area X position (m)").press("Enter");
    await expect(page.getByLabel("Area X position (m)")).toHaveValue("2.4");
    await expect(panel.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await back.click();
    if (width === 390) {
      // Now wide: Done closes the side panel and keeps the Planting areas level.
      await expect(page.getByRole("link", { name: "Edit Sample raised bed" })).toBeFocused();
      await expect(page).toHaveURL(/\/plan\?level=areas$/);
    } else {
      // Now a phone: closing the properties page returns to the area selected on Planting areas.
      await expect(page.getByRole("link", { name: "Edit area", exact: true })).toBeFocused();
      await expect(page).toHaveURL(/\?level=areas&area=demo-raised-bed$/);
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/plan\?level=areas$/);
    }
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    // "All changes saved" can still show from an earlier save; wait for the server copy before reloading.
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    await expect.poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
      const { x, y } = (await response.json()).gardens[0].growingAreas.find((area: { id: string }) => area.id === "demo-raised-bed").planPlacement;
      return `${x}, ${y}`;
    }).toBe("2.4, 1.3");
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
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).tap();
    await page.getByRole("link", { name: "Open Demo Garden" }).tap();
    const canvas = planCanvas(page);
    await canvas.scrollIntoViewIfNeeded();
    const transform = await planTransform(page, gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"));
    const position = metresToCanvas({ x: area.planPlacement.x + 0.2, y: area.planPlacement.y + 0.2 }, transform);
    await canvas.tap({ position });
    await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
    const selected = page.getByRole("region", { name: area.name });
    await expect(selected.getByRole("button", { name: "Edit Tomato" })).toBeVisible();
    await selected.getByRole("link", { name: "Edit area" }).tap();
    const panel = page.getByRole("region", { name: "Edit planting area" });
    await expect(panel).toHaveAttribute("data-mode", "mobile");
    await expect(panel.getByLabel("Planting-area name")).toHaveValue(area.name);
    await panel.getByRole("button", { name: "Done", exact: true }).tap();
    // Done returns to the bed selected on Planting areas, where its properties live (ADR-0075).
    await expect(page).toHaveURL(/\?level=areas&area=demo-raised-bed$/);
    await expect(selected).toBeVisible();
    await expect(selected.getByRole("button", { name: "Edit Tomato" })).toHaveCount(0);
  });

  test("a swipe over the canvas scrolls the page, and Move still moves an area", async ({ page }, testInfo) => {
    const [garden] = createDemoGardenWorkspace().gardens;
    const [area] = garden.growingAreas;
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).tap();
    await page.getByRole("link", { name: "Open Demo Garden" }).tap();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    // Plants locks the beds and offers no Move mode; Planting areas does (ADR-0075).
    await expect(page.getByRole("button", { name: "Move planting areas" })).toHaveCount(0);
    await goToLevel(page, "Planting areas");
    // Touch screens keep the explicit Move mode (ADR-0072, phase G4).
    const move = page.getByRole("button", { name: "Move planting areas" });
    await expect(move).toBeVisible();
    await expect(move).toHaveAttribute("aria-pressed", "false");
    const canvas = planCanvas(page);
    await canvas.evaluate((node) => node.scrollIntoView({ block: "start" }));
    const workspaceId = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    const placement = async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${workspaceId}`);
      expect(response.ok()).toBeTruthy();
      return ((await response.json()) as GardenWorkspace).gardens[0].growingAreas[0].planPlacement;
    };
    const original = await placement();
    const client = await page.context().newCDPSession(page);
    const swipe = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
      for (let step = 1; step <= 10; step++)
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + (to.x - from.x) * step / 10, y: from.y + (to.y - from.y) * step / 10 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    };
    // Waits until the page stops scrolling (a fling, or a tap that scrolled its button into view).
    const settle = () => expect.poll(async () => {
      const before = await page.evaluate(() => scrollY);
      await page.waitForTimeout(200);
      return (await page.evaluate(() => scrollY)) === before;
    }).toBe(true);
    const bedPoint = async () => {
      const box = (await canvas.boundingBox())!;
      const transform = await planTransform(page, gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"));
      const point = metresToCanvas({ x: area.planPlacement.x + 2, y: area.planPlacement.y + 0.6 }, transform);
      return { x: box.x + point.x, y: box.y + point.y, scale: transform.scale };
    };

    // Move is off: a vertical swipe that starts on the bed scrolls the page and leaves the bed alone.
    const start = await bedPoint();
    const scrollBefore = await page.evaluate(() => scrollY);
    await swipe(start, { x: start.x, y: start.y - 160 });
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore + 40);
    // A swipe that ends over the bed it started on is still a scroll, not a tap that opens the bed.
    await settle();
    await expect(page).toHaveURL(/\/plan\?level=areas$/);
    expect(await placement()).toEqual(original);

    // Move is on: the same gesture drags the bed and saves one position.
    await move.tap();
    await expect(planSurface(page)).toHaveAttribute("data-move", "true");
    await expect(canvas.locator("..")).toHaveCSS("touch-action", "none");
    await settle();
    await canvas.evaluate((node) => node.scrollIntoView({ block: "center" }));
    await settle();
    const from = await bedPoint();
    const scrollDuringMove = await page.evaluate(() => scrollY);
    await swipe(from, { x: from.x + 0.5 * from.scale, y: from.y + 0.3 * from.scale });
    await expect.poll(placement).toEqual({ x: original.x + 0.5, y: original.y + 0.3, rotationDegrees: original.rotationDegrees });
    expect(await page.evaluate(() => scrollY)).toBe(scrollDuringMove);
    await page.screenshot({ path: testInfo.outputPath("touch-move.png") });
  });
});
