import { expect, test, type Page } from "@playwright/test";
import { createSampleGardenWorkspace } from "../src/lib/gardenWorkspace";
import { goToLevel, planSurface } from "./areaHelpers";

/**
 * ADR-0072, phase G7: the single-canvas Garden Plan journey at the reference
 * widths, plus a 720 × 450 viewport at device scale 2, which is what a
 * 1440 × 900 window shows at 200% browser zoom. Each step keeps a viewport
 * screenshot in the test output and checks for sideways scrolling. The app has
 * one (light) theme, so there is no dark run.
 *
 * ADR-0073 S4 adds 1080 and 900 px: from 900 px the toolbar, zoom, legend, and
 * area panel float over the canvas, and a geometry check confirms that none of
 * them covers the selected area.
 */
const viewports = [
  { name: "1440px", width: 1440, height: 900, scale: 1 },
  { name: "1080px", width: 1080, height: 900, scale: 1 },
  { name: "900px", width: 900, height: 900, scale: 1 },
  { name: "768px", width: 768, height: 1024, scale: 1 },
  { name: "390px", width: 390, height: 844, scale: 1 },
  { name: "200% zoom", width: 720, height: 450, scale: 2 },
];

async function expectNoSideScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * The selected area as Konva drew it (its outline, plants, and selection ring) and
 * the floating layers, all in page pixels. Konva's own scene graph gives the area's
 * box, so the check does not reuse the app's framing maths.
 */
async function selectedAreaAndLayers(page: Page, areaName: string) {
  return page.evaluate((label) => {
    type KonvaNode = { getAttr: (name: string) => unknown; getClientRect: () => { x: number; y: number; width: number; height: number } };
    type KonvaStage = { container: () => HTMLElement; findOne: (test: (node: KonvaNode) => boolean) => KonvaNode | undefined };
    const surface = document.querySelector<HTMLElement>('[data-testid="garden-plan-canvas"]')!;
    const stage = (window as unknown as { Konva: { stages: KonvaStage[] } }).Konva.stages.find((candidate) => surface.contains(candidate.container()))!;
    const node = stage.findOne((candidate) => candidate.getAttr("aria-label") === label)!;
    const rect = node.getClientRect();
    const origin = stage.container().getBoundingClientRect();
    const toBox = (box: DOMRect) => ({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
    return {
      area: { left: origin.left + rect.x, top: origin.top + rect.y, right: origin.left + rect.x + rect.width, bottom: origin.top + rect.y + rect.height },
      canvas: toBox(surface.getBoundingClientRect()),
      layers: [...surface.parentElement!.querySelectorAll<HTMLElement>(":scope > [data-corner]")].map((layer) => ({ corner: layer.dataset.corner!, ...toBox(layer.getBoundingClientRect()) })),
    };
  }, `Open ${areaName} on Garden Plan`);
}

const overlaps = (first: Box, second: Box) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;

async function expectSelectedAreaClear(page: Page, areaName: string, floating: boolean) {
  const { area, canvas, layers } = await selectedAreaAndLayers(page, areaName);
  // The whole area is on the canvas.
  expect(area.left).toBeGreaterThanOrEqual(canvas.left);
  expect(area.right).toBeLessThanOrEqual(canvas.right);
  expect(area.top).toBeGreaterThanOrEqual(canvas.top);
  expect(area.bottom).toBeLessThanOrEqual(canvas.bottom);
  if (!floating) { expect(layers).toEqual([]); return; }
  // Toolbar, zoom, and legend float, and none of them covers the area.
  expect(layers.map(({ corner }) => corner).sort()).toEqual(["bottom-left", "bottom-right", "top-left"]);
  for (const layer of layers) expect(overlaps(area, layer), `${layer.corner} layer covers ${areaName}`).toBe(false);
  // The area panel sits beside the canvas, not over it.
  const panel = await page.locator('dialog[open][aria-labelledby="edit-planting-area-heading"]').boundingBox();
  expect(panel, "the area panel is open").not.toBeNull();
  expect(panel!.x).toBeGreaterThanOrEqual(canvas.right);
}

for (const viewport of viewports) {
  test.describe(`Garden Plan acceptance at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale });

    test("edits the demo garden on one canvas, then guides a new garden to Ready", async ({ page }, testInfo) => {
      const shot = (step: string) => page.screenshot({ path: testInfo.outputPath(`${step}-${viewport.name.replace(/\W+/g, "")}.png`) });
      await page.route("**/ai/**", (route) => route.abort());
      await page.addInitScript((value) => {
        if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(value));
      }, createSampleGardenWorkspace());
      // Plants is one click from Garden, where a garden opens (ADR-0078); this run starts there.
      await page.goto("/gardens/demo-garden/plan?level=plants");
      await expect(page.getByRole("heading", { name: "Garden Plan" })).toBeVisible();
      await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
      const surface = planSurface(page);
      await expect(surface).toHaveAttribute("data-zooming", "false");
      await surface.scrollIntoViewIfNeeded();
      await shot("01-whole-garden");
      await expectNoSideScroll(page);

      // Opening an area zooms the same canvas; plants go straight onto it.
      // The legend names the plants in view (ADR-0076).
      await expect(page.getByTestId("plan-legend")).toContainText("Plants");
      await expect(page.getByTestId("plan-legend")).toContainText("Tomato");
      await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
      await expect(surface).toHaveAttribute("data-focused-area", "demo-raised-bed");
      await expect(surface).toHaveAttribute("data-zooming", "false");
      const floating = viewport.width >= 900;
      await expectSelectedAreaClear(page, "Sample raised bed", floating);
      await page.getByRole("button", { name: "Add plant", exact: true }).click();
      await page.getByLabel("Plant type", { exact: true }).fill("Lettuce");
      await page.getByRole("button", { name: "Fill area", exact: true }).click();
      await expect(page.getByText(/^Placed \d+ Lettuce\. Undo removes them\.$/)).toBeVisible();
      // The legend gains Lettuce; the area stays clear of the layers.
      await expect(page.getByTestId("plan-legend")).toContainText("Lettuce");
      await expectSelectedAreaClear(page, "Sample raised bed", floating);
      await surface.scrollIntoViewIfNeeded();
      await shot("02-zoomed-area");
      await expectNoSideScroll(page);
      // The plant panel's rows fit its width, so wider fonts (Linux CI) never push the page sideways.
      const plantPanel = page.locator("section.layout-editor");
      expect(await plantPanel.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Undo", exact: true }).click();
      await expect(page.getByText("Undid fill Sample raised bed with Lettuce.", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByLabel("Plant type", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Whole garden" }).click();
      await expect(surface).not.toHaveAttribute("data-focused-area", /.+/);
      await expect(page.getByRole("button", { name: "Zoom to Sample raised bed" })).toBeVisible();

      // A new garden starts the guide on the same canvas.
      await page.getByRole("link", { name: "All gardens", exact: true }).click();
      await page.getByRole("link", { name: "New garden" }).click();
      await page.getByLabel("Garden name").fill("Acceptance plot");
      await page.getByRole("button", { name: "Continue setup" }).click();
      const track = page.getByRole("navigation", { name: "Guided setup" });
      await expect(track).toContainText("Step 1 of 4 · Garden size");
      await page.getByRole("button", { name: "6 × 4 m" }).click();
      await expect(page.getByText("Garden size set to 6 × 4 m.", { exact: true })).toBeVisible();
      await track.scrollIntoViewIfNeeded();
      await shot("03-guide-size");
      await expectNoSideScroll(page);
      await page.getByRole("button", { name: "Continue to planting areas" }).click();
      await page.getByRole("button", { name: "Add In-ground bed, 2 × 3 m" }).click();
      await expect(surface).toHaveAttribute("data-zooming", "false");
      await track.scrollIntoViewIfNeeded();
      await shot("04-guide-areas");
      await expectNoSideScroll(page);
      await page.getByRole("button", { name: "Continue to plants" }).click();
      await page.getByRole("button", { name: "Skip plants for now" }).click();
      await expect(page.getByRole("heading", { name: "Acceptance plot is ready" })).toBeVisible();
      await track.scrollIntoViewIfNeeded();
      await shot("05-guide-ready");
      await expectNoSideScroll(page);
      await page.getByRole("button", { name: "Finish setup" }).click();
      await expect(track).toHaveCount(0);
      // After the guide the same three parts switch levels (ADR-0075) and open on Garden, which holds the size (ADR-0078).
      const levels = page.getByRole("navigation", { name: "Garden Plan levels" });
      await expect(levels.getByRole("button", { name: "Garden", exact: true })).toHaveAttribute("aria-current", "true");
      await expect(page.getByLabel("Garden name")).toHaveValue("Acceptance plot");
      await expect(page.getByLabel("Garden width (m)")).toHaveValue("6");
      await expect(page.getByLabel("Garden length (m)")).toHaveValue("4");
      await levels.scrollIntoViewIfNeeded();
      await shot("06-garden-level");
      await expectNoSideScroll(page);
    });
  });
}
