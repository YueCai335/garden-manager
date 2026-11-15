import { expect, test, type Page } from "@playwright/test";
import { fitCanvas, metresToCanvas } from "../src/lib/canvasViewport";
import { areaFocusViewport, createDemoGardenWorkspace, type GardenWorkspace, type PlantAllocation } from "../src/lib/gardenWorkspace";
import { planCanvas, planSurface } from "./areaHelpers";
import { openWorkspace } from "./workspace";

// ADR-0072, phase G3: plants are placed, filled, and moved on the Garden Plan canvas itself.
async function savedPlants(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
  expect(response.ok()).toBeTruthy();
  const workspace = await response.json() as GardenWorkspace;
  return workspace.gardens[0].growingAreas[0].layout!.allocations as PlantAllocation[];
}

for (const width of [390, 1440]) {
  test(`places, fills, and undoes plants on the zoomed canvas at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
    await expect(page.getByRole("button", { name: "Whole garden" })).toBeVisible();

    await page.getByRole("button", { name: "Add plant", exact: true }).click();
    await page.getByLabel("Plant type", { exact: true }).fill("Pepper");
    await expect(page.getByLabel("Plant spacing (m)", { exact: true })).toHaveValue("0.5");
    await expect(page.getByText(/Suggested for Pepper: 0.5 m/)).toContainText("Missouri Extension G6201");

    const canvas = planCanvas(page);
    await expect(planSurface(page)).toHaveAttribute("data-placing", "true");
    await expect(planSurface(page)).toHaveAttribute("data-zooming", "false");
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    const bed = createDemoGardenWorkspace().gardens[0].growingAreas[0];
    const zoomed = fitCanvas(areaFocusViewport(bed)!, box.width, box.height)!;
    const at = (x: number, y: number) => metresToCanvas({ x: bed.planPlacement.x + x, y: bed.planPlacement.y + y }, zoomed);
    const target = at(2.03, 0.38);
    await page.mouse.move(box.x + target.x, box.y + target.y);
    await page.screenshot({ path: testInfo.outputPath(`placing-${width}.png`) });
    await page.mouse.click(box.x + target.x, box.y + target.y);
    await expect(page.getByText("Pepper placed at 2.0, 0.4 m. Click to place another; Escape stops.")).toBeVisible();
    await expect.poll(async () => (await savedPlants(page)).filter((plant) => plant.plantType === "Pepper").map(({ x, y }) => [x, y])).toEqual([[2, 0.4]]);

    await page.getByRole("button", { name: "Fill area", exact: true }).click();
    const placed = page.getByText(/^Placed \d+ Pepper\. Undo removes them\.$/);
    await expect(placed).toBeVisible();
    const filled = Number((await placed.textContent())!.match(/\d+/)![0]);
    expect(filled).toBeGreaterThan(0);
    await expect.poll(async () => (await savedPlants(page)).filter((plant) => plant.plantType === "Pepper").length).toBe(filled + 1);
    // A viewport-sized screenshot: a full-page capture resizes the page and can switch the editor layout.
    await page.screenshot({ path: testInfo.outputPath(`filled-${width}.png`) });
    // The plan's Undo removes the whole Fill as one step (ADR-0072, phase G5).
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByText("Undid fill Sample raised bed with Pepper.", { exact: true })).toBeVisible();
    await expect.poll(async () => (await savedPlants(page)).filter((plant) => plant.plantType === "Pepper").length).toBe(1);

    // Escape outside a text field stops placing but keeps the area zoomed.
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Plant type", { exact: true })).toHaveCount(0);
    await expect(planSurface(page)).toHaveAttribute("data-placing", "false");
    await expect(page).toHaveURL(/\?area=demo-raised-bed$/);
    await expect(page.getByRole("region", { name: "Plant groups" })).toContainText("Pepper × 1");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
