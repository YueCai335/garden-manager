import { expect, test } from "@playwright/test";
import { metresToCanvas } from "../src/lib/canvasViewport";
import { areaKindDefaults, findFreeAreaSpot } from "../src/lib/areaPlacement";
import { areaFocusViewport, createDemoGardenWorkspace, createRectangularLayout, type GardenWorkspace, type GrowingArea } from "../src/lib/gardenWorkspace";
import { planCanvas, planSurface, planTransform } from "./areaHelpers";
import { openWorkspace, workspaceHome } from "./workspace";

/**
 * The one flow that has to work end to end: a gardener creates a garden,
 * edits and saves it, adds and arranges a planting area on the plan, plans
 * next season, and finds everything still there
 * after a reload — served back by the real API and database, not by the
 * browser's local copy.
 */
test("create a garden, save an edit, add and arrange an area, plan next season, and find it all after a reload", async ({ page }, testInfo) => {
  const nextYear = new Date().getFullYear() + 1;

  await openWorkspace(page);

  // Load the demo garden so there is a planting area to plan against.
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByRole("link", { name: "Open Demo Garden" })).toBeVisible();

  // Rename the garden and save.
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByRole("heading", { name: "Garden Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  await page.getByLabel("Garden name").fill("E2E Kitchen Garden");
  // Garden details apply on Enter or when a field loses focus; there is no Save button (ADR-0072, G6).
  await page.getByLabel("Garden name").press("Enter");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();

  // One click adds a standard raised bed in the first free spot and zooms into it (ADR-0072, G4).
  const [demo] = createDemoGardenWorkspace().gardens;
  const spot = findFreeAreaSpot(demo.plan, demo.growingAreas, areaKindDefaults["raised-bed"]);
  await page.getByRole("button", { name: "Add Raised bed, 1.2 × 2.4 m" }).click();
  await expect(page.getByText(`Raised bed 1 added at ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} m. Drag it to move it, or drag its corner to resize it.`)).toBeVisible();
  const surface = planSurface(page);
  await expect(surface).toHaveAttribute("data-focused-area", /.+/);
  await expect(surface).toHaveAttribute("data-zooming", "false");
  const canvas = planCanvas(page);
  await canvas.scrollIntoViewIfNeeded();
  const added = (x: number, y: number, width: number, length: number): GrowingArea => ({
    id: "added", name: "Raised bed 1", kind: "raised-bed", planPlacement: { x, y, rotationDegrees: 0 }, layout: createRectangularLayout(width, length),
  });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }, readout: string) => {
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 10 });
    await expect(page.getByText(readout, { exact: true })).toBeVisible();
    await page.mouse.up();
    await expect(surface).toHaveAttribute("data-dragging", "false");
  };

  // A mouse drags the body to move it, with no Move mode.
  let view = await planTransform(page, areaFocusViewport(added(spot.x, spot.y, 1.2, 2.4))!);
  const moved = { x: Math.round((spot.x - 0.5) * 10) / 10, y: Math.round((spot.y + 0.3) * 10) / 10 };
  await drag(
    metresToCanvas({ x: spot.x + 0.6, y: spot.y + 1.2 }, view),
    metresToCanvas({ x: spot.x + 0.1, y: spot.y + 1.5 }, view),
    `Raised bed 1 · ${moved.x.toFixed(1)}, ${moved.y.toFixed(1)} m`,
  );

  // Dragging the bottom-right corner handle resizes it on the re-centred view.
  view = await planTransform(page, areaFocusViewport(added(moved.x, moved.y, 1.2, 2.4))!);
  await drag(
    metresToCanvas({ x: moved.x + 1.2, y: moved.y + 2.4 }, view),
    metresToCanvas({ x: moved.x + 1.5, y: moved.y + 2.6 }, view),
    "Raised bed 1 · 1.5 × 2.6 m",
  );
  await page.screenshot({ path: testInfo.outputPath("area-added-moved-resized.png") });
  await expect.poll(async () => {
    const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${await serverWorkspaceId(page)}`);
    const workspace = await response.json() as GardenWorkspace;
    const area = workspace.gardens[0].growingAreas.find((candidate) => candidate.name === "Raised bed 1");
    return area && { kind: area.kind, placement: area.planPlacement, size: [area.layout?.widthMeters, area.layout?.depthMeters] };
  }).toEqual({ kind: "raised-bed", placement: { ...moved, rotationDegrees: 0 }, size: [1.5, 2.6] });

  // Plan a plant for next season in the raised bed.
  await page.getByRole("link", { name: "All gardens", exact: true }).click();
  await expect(page).toHaveURL(workspaceHome);
  await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Next Season", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Next Season ·/ })).toBeVisible();
  const raisedBed = page.locator("article", { has: page.getByRole("heading", { name: "Sample raised bed" }) });
  await raisedBed.getByRole("button", { name: "Choose a plant" }).click();
  await raisedBed.getByLabel("Plant type").fill("Kale");
  await raisedBed.getByRole("button", { name: `Add to ${nextYear} plan` }).click();
  await expect(page.getByRole("region", { name: "plan for Sample raised bed" }).getByText("Kale", { exact: true })).toBeVisible();

  // Verify both edits directly at the API: both edits must
  // be on the server before we reload.
  await expect
    .poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${await serverWorkspaceId(page)}`);
      const workspace = await response.json();
      return {
        name: workspace.gardens[0].name,
        planned: workspace.gardens[0].seasonPlans?.[0]?.plantings?.map((planting: { commonName: string }) => planting.commonName),
      };
    })
    .toEqual({ name: "E2E Kitchen Garden", planned: ["Kale"] });

  // Reload: the app restores from PostgreSQL (a server id is remembered).
  await page.reload();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await expect(page).toHaveURL(/\/season$/);
  await expect(page.getByRole("region", { name: "plan for Sample raised bed" }).getByText("Kale", { exact: true })).toBeVisible();
});

async function serverWorkspaceId(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
}
