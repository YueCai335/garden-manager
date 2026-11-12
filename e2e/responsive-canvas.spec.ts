import { expect, test, type Locator } from "@playwright/test";
import { fitCanvas, metresToCanvas } from "../src/lib/canvasViewport";
import { createDemoGardenWorkspace, gardenPlanViewport, type GardenWorkspace } from "../src/lib/gardenWorkspace";

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
    const plan = page.getByRole("button", { name: "Move planting areas" }).locator("..").locator("..").locator(".konvajs-content");
    await expectFittedCanvas(plan);
    await page.getByRole("button", { name: "Edit garden details" }).click();
    await page.getByLabel("Garden width (m)").fill("10000");
    await page.getByLabel("Garden length (m)").fill("10000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Full garden", exact: true }).click();
    await expectFittedCanvas(plan);
    await page.getByRole("button", { name: "Focus beds", exact: true }).click();
    await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
    const move = page.getByRole("button", { name: "Move plants", exact: true });
    const plants = move.locator("..").locator("..").locator(".konvajs-content");
    await expectFittedCanvas(plants);
    await expect(move).toHaveAttribute("aria-pressed", "false");
    await expect(plants.locator("..")).toHaveCSS("touch-action", "pan-y");
    await move.click();
    await expect(plants.locator("..")).toHaveCSS("touch-action", "none");
    await plants.scrollIntoViewIfNeeded();
    const box = (await plants.boundingBox())!;
    // Demo bed is 3 × 1.2m; the tomato begins at (0.6, 0.6).
    const scale = Math.min((box.width - 68) / 3, (box.height - 68) / 1.2);
    await page.mouse.move(box.x + 34 + 0.6 * scale, box.y + 34 + 0.6 * scale);
    await page.mouse.down();
    await page.mouse.move(box.x + 34 + 1.1 * scale, box.y + 34 + 0.7 * scale, { steps: 10 });
    await page.mouse.up();
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
    await page.getByRole("button", { name: "Edit Tomato", exact: true }).click();
    await expect(page.getByLabel("X position (m)", { exact: true })).toHaveValue("1.1");
    await expect(page.getByLabel("Y position (m)", { exact: true })).toHaveValue("0.7");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`canvas-${width}.png`), fullPage: true });
  });
}

test("map movement previews a snapped area, cancels on Escape, and saves one completed drag", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Garden area summary" })).toContainText("Sample raised bed");
  const move = page.getByRole("button", { name: "Move planting areas" });
  const canvas = move.locator("..").locator("..").locator(".konvajs-content");
  await expectFittedCanvas(canvas);
  await move.click();
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
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await expect(page.getByLabel("Area X position (m)")).toHaveValue("1.5");
  await expect(page.getByLabel("Area Y position (m)")).toHaveValue("1.3");
});
