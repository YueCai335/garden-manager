import { expect, test, type Page } from "@playwright/test";
import { createDemoGardenWorkspace } from "../src/lib/gardenWorkspace";
import { planSurface } from "./areaHelpers";

/**
 * ADR-0072, phase G7: the single-canvas Garden Plan journey at the three
 * reference widths, plus a 720 × 450 viewport at device scale 2, which is
 * what a 1440 × 900 window shows at 200% browser zoom. Each step keeps a
 * viewport screenshot in the test output and checks for sideways scrolling.
 * The app has one (light) theme, so there is no dark run.
 */
const viewports = [
  { name: "1440px", width: 1440, height: 900, scale: 1 },
  { name: "768px", width: 768, height: 1024, scale: 1 },
  { name: "390px", width: 390, height: 844, scale: 1 },
  { name: "200% zoom", width: 720, height: 450, scale: 2 },
];

async function expectNoSideScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test.describe(`Garden Plan acceptance at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale });

    test("edits the demo garden on one canvas, then guides a new garden to Ready", async ({ page }, testInfo) => {
      const shot = (step: string) => page.screenshot({ path: testInfo.outputPath(`${step}-${viewport.name.replace(/\W+/g, "")}.png`) });
      await page.route("**/ai/**", (route) => route.abort());
      await page.addInitScript((value) => {
        if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(value));
      }, createDemoGardenWorkspace());
      await page.goto("/gardens/demo-garden/plan");
      await expect(page.getByRole("heading", { name: "Garden Plan" })).toBeVisible();
      await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
      const surface = planSurface(page);
      await expect(surface).toHaveAttribute("data-zooming", "false");
      await surface.scrollIntoViewIfNeeded();
      await shot("01-whole-garden");
      await expectNoSideScroll(page);

      // Opening an area zooms the same canvas; plants go straight onto it.
      await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
      await expect(surface).toHaveAttribute("data-focused-area", "demo-raised-bed");
      await expect(surface).toHaveAttribute("data-zooming", "false");
      await page.getByRole("button", { name: "Add plant", exact: true }).click();
      await page.getByLabel("Plant type", { exact: true }).fill("Lettuce");
      await page.getByRole("button", { name: "Fill area", exact: true }).click();
      await expect(page.getByText(/^Placed \d+ Lettuce\. Undo removes them\.$/)).toBeVisible();
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

      // A new garden starts the guide on the same canvas.
      await page.getByRole("link", { name: "All gardens", exact: true }).click();
      await page.getByRole("link", { name: "Add garden" }).click();
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
      await expect(page.getByRole("region", { name: "Garden properties" })).toContainText("Acceptance plot · 6 × 4 m");
    });
  });
}
