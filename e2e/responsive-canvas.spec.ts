import { expect, test, type Locator } from "@playwright/test";
import { fitCanvas, metresToCanvas } from "../src/lib/canvasViewport";
import { areaFocusViewport, createDemoGardenWorkspace, gardenPlanViewport, type GardenWorkspace } from "../src/lib/gardenWorkspace";
import { planCanvas, planSurface } from "./areaHelpers";

// Native canvas, pointer and touch behavior require a real browser run.
// These scenarios are prepared; test discovery alone is not acceptance.
async function expectFittedCanvas(content: Locator) {
  await expect.poll(() => content.evaluate((node) => {
    const canvas = node.querySelector("canvas")!;
    const surface = node.parentElement!.parentElement!;
    return Math.max(
      Math.abs(node.getBoundingClientRect().width - surface.clientWidth),
      Math.abs(parseFloat(canvas.style.width) - surface.clientWidth),
      Math.abs(parseFloat(canvas.style.height) - surface.clientHeight),
    );
  })).toBeLessThanOrEqual(1);
}

for (const width of [390, 900, 1440]) {
  test(`canvas fits, drags in metres, and retains position at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const plan = planCanvas(page);
    await expectFittedCanvas(plan);
    await page.getByRole("button", { name: "Edit garden details" }).click();
    await page.getByLabel("Garden width (m)").fill("10000");
    await page.getByLabel("Garden length (m)").fill("10000");
    await page.getByLabel("Garden length (m)").press("Enter");
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expectFittedCanvas(plan);
    await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
    // Plants move on the same canvas once it has zoomed into the bed.
    const surface = planSurface(page);
    await expect(surface).toHaveAttribute("data-focused-area", "demo-raised-bed");
    await expect(surface).toHaveCSS("touch-action", "pan-y");
    await expect(surface).toHaveAttribute("data-zooming", "false");
    await plan.scrollIntoViewIfNeeded();
    const box = (await plan.boundingBox())!;
    const [demo] = createDemoGardenWorkspace().gardens;
    const bed = demo.growingAreas[0];
    const zoomed = fitCanvas(areaFocusViewport(bed)!, box.width, box.height)!;
    // Demo bed is 3 × 1.2 m at (0.8, 1); the tomato begins at (0.6, 0.6) inside it.
    const from = metresToCanvas({ x: bed.planPlacement.x + 0.6, y: bed.planPlacement.y + 0.6 }, zoomed);
    const to = metresToCanvas({ x: bed.planPlacement.x + 1.1, y: bed.planPlacement.y + 0.7 }, zoomed);
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 10 });
    await expect(page.getByText("Tomato · 1.1, 0.7 m", { exact: true })).toBeVisible();
    await page.mouse.up();
    const plants = plan;
    const workspaceId = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    await expect.poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${workspaceId}`);
      expect(response.ok()).toBeTruthy();
      const workspace = await response.json() as GardenWorkspace;
      const plant = workspace.gardens.find((garden) => garden.id === "demo-garden")?.growingAreas
        .find((area) => area.id === "demo-raised-bed")?.layout?.allocations.find((allocation) => allocation.id === "demo-tomato");
      expect(plant, "The saved snapshot contains the demo tomato").toBeDefined();
      return { x: plant!.x, y: plant!.y };
    }).toEqual({ x: 1.1, y: 0.7 });
    await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 900 });
    await expectFittedCanvas(plants);
    await page.reload();
    await expect(surface).toHaveAttribute("data-focused-area", "demo-raised-bed");
    await page.getByRole("button", { name: "Edit Tomato", exact: true }).click();
    await expect(page.getByLabel("X position (m)", { exact: true })).toHaveValue("1.1");
    await expect(page.getByLabel("Y position (m)", { exact: true })).toHaveValue("0.7");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`canvas-${width}.png`), fullPage: true });
  });
}

test("a mouse drags an area without a mode: snapped preview, Escape cancel, and one saved drag", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Garden area summary" })).toContainText("Sample raised bed");
  // A mouse drags an area directly; only touch screens show the Move mode (ADR-0072, G4).
  await expect(page.getByRole("button", { name: "Move planting areas" })).toHaveCount(0);
  const canvas = planCanvas(page);
  await expectFittedCanvas(canvas);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const [garden] = createDemoGardenWorkspace().gardens;
  const [area] = garden.growingAreas;
  const transform = fitCanvas(gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"), box.width, box.height)!;
  const start = metresToCanvas({ x: area.planPlacement.x + 0.2, y: area.planPlacement.y + 0.2 }, transform);
  const workspaceId = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  const read = async () => {
    const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${workspaceId}`);
    expect(response.ok()).toBeTruthy();
    const workspace = await response.json() as GardenWorkspace & { revision: number };
    return { revision: workspace.revision, position: workspace.gardens[0].growingAreas[0].planPlacement };
  };
  const original = await read();
  const drag = async () => {
    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + start.x + 0.74 * transform.scale, box.y + start.y + 0.26 * transform.scale, { steps: 8 });
    await expect(page.getByText("Sample raised bed · 1.5, 1.3 m", { exact: true })).toBeVisible();
  };
  await drag();
  await page.screenshot({ path: testInfo.outputPath("area-drag-preview.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByText("Sample raised bed · 1.5, 1.3 m", { exact: true })).toBeHidden();
  expect(await read()).toEqual(original);
  await drag();
  await page.mouse.up();
  await expect.poll(read).toEqual({ revision: original.revision + 1, position: { x: 1.5, y: 1.3, rotationDegrees: area.planPlacement.rotationDegrees } });
  await expect(page).toHaveURL(/\/plan$/);
  // Undo puts a mistaken drag back with a new forward revision (ADR-0072, phase G5).
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByText("Undid move Sample raised bed.", { exact: true })).toBeVisible();
  await expect.poll(read).toEqual({ revision: original.revision + 2, position: original.position });
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect.poll(read).toEqual({ revision: original.revision + 3, position: { x: 1.5, y: 1.3, rotationDegrees: area.planPlacement.rotationDegrees } });
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await expect(page.getByLabel("Area X position (m)")).toHaveValue("1.5");
  await expect(page.getByLabel("Area Y position (m)")).toHaveValue("1.3");
});

for (const width of [390, 1440]) {
  test(`zooms into a planting area on the same canvas and returns to the whole garden at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const surface = planSurface(page);
    const canvas = surface.locator(".konvajs-content");
    await expectFittedCanvas(canvas);
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const [garden] = createDemoGardenWorkspace().gardens;
    const [area] = garden.growingAreas;
    const whole = fitCanvas(gardenPlanViewport(garden.plan, garden.growingAreas, "growing-areas"), box.width, box.height)!;
    // A point inside the bed, clear of the tomato at (0.6, 0.6).
    const inside = { x: area.planPlacement.x + 2.6, y: area.planPlacement.y + 0.3 };
    const wholePoint = metresToCanvas(inside, whole);
    await page.mouse.click(box.x + wholePoint.x, box.y + wholePoint.y);
    await expect(surface).toHaveAttribute("data-focused-area", area.id);
    const back = page.getByRole("button", { name: "Whole garden" });
    await expect(back).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`area=${area.id}$`));
    if (width === 390) await expect(page.getByRole("region", { name: area.name })).toContainText("Raised bed · 3 × 1.2 m");
    // After the 0.4 s zoom, the same bed point is drawn where the area frame puts it.
    const zoomed = fitCanvas(areaFocusViewport(area)!, box.width, box.height)!;
    expect(zoomed.scale).toBeGreaterThan(whole.scale * 1.5);
    await expect(surface).toHaveAttribute("data-zooming", "false");
    await page.screenshot({ path: testInfo.outputPath(`area-zoom-${width}.png`) });
    await back.click();
    await expect(surface).not.toHaveAttribute("data-focused-area", /.+/);
    await expect(back).toBeHidden();
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.locator(`#area-link-${area.id}`)).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("a rotated area stays zoomed after reload and Escape returns to the whole garden", async ({ page }, testInfo) => {
  await page.route("**/ai/**", (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await page.getByLabel("Rotation (degrees)").fill("30");
  await page.getByLabel("Rotation (degrees)").press("Enter");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  const surface = planSurface(page);
  await expect(surface).toHaveAttribute("data-focused-area", "demo-raised-bed");
  await expect(page.getByRole("heading", { name: "Edit planting area" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("area-zoom-rotated.png") });
  await page.getByRole("heading", { name: "Edit planting area" }).focus();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/plan$/);
  await expect(surface).not.toHaveAttribute("data-focused-area", /.+/);
  await expect(page.locator("#area-link-demo-raised-bed")).toBeFocused();
});
