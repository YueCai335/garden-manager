import { expect, test, type Page } from "@playwright/test";
import { metresToCanvas } from "../src/lib/canvasViewport";
import { goToLevel, planCanvas, planSurface, planTransform } from "./areaHelpers";
import { openWorkspace } from "./workspace";

/**
 * ADR-0072, phase G6: a new garden walks through four steps on the normal
 * Garden Plan canvas (Garden size, Planting areas, Plants, Ready), survives a
 * reload mid-guide, and ends on Ready with links into this garden's care,
 * a Garden Note, and next season's plan.
 */
async function expectNoSideScroll(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

for (const width of [1440, 390]) {
  test(`guides a new garden from Add garden to Ready at ${width}px`, async ({ page }, testInfo) => {
    await page.route("**/ai/**", (route) => route.abort());
    await page.setViewportSize({ width, height: 900 });
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await expect(page.getByRole("link", { name: "Open Demo Garden" })).toBeVisible();
    await page.getByRole("link", { name: "Add garden" }).click();
    const name = `Guided ${width}`;
    await page.getByLabel("Garden name").fill(name);
    await page.getByRole("button", { name: "Continue setup" }).click();

    // Step 1: Garden size, on the same Garden Plan canvas.
    const track = page.getByRole("navigation", { name: "Guided setup" });
    await expect(track).toContainText("Step 1 of 4 · Garden size");
    for (const step of ["Garden size, current step", "Planting areas, not started", "Plants, not started", "Ready, not started"])
      await expect(track.getByText(step, { exact: true })).toBeAttached();
    await expect(track.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Add a planting area" })).toHaveCount(0);
    const surface = planSurface(page);
    await expect(surface).toHaveAttribute("data-zooming", "false");
    const gardenBase = new URL(page.url()).pathname.replace(/\/plan$/, "");
    if (width === 1440) {
      // A mouse drags the garden's corner from 10 × 6 m (the new-garden size) to 8 × 5 m.
      const canvas = planCanvas(page);
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      const view = await planTransform(page, { x: 0, y: 0, widthMeters: 14, depthMeters: 10 });
      const from = metresToCanvas({ x: 10, y: 6 }, view);
      const to = metresToCanvas({ x: 8, y: 5 }, view);
      await page.mouse.move(box.x + from.x, box.y + from.y);
      await page.mouse.down();
      await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 12 });
      await expect(page.getByText("Garden · 8 × 5 m", { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`size-drag-${width}.png`) });
      await page.mouse.up();
    } else {
      await page.getByRole("button", { name: "6 × 4 m" }).click();
      await expect(page.getByText("Garden size set to 6 × 4 m.", { exact: true })).toBeVisible();
      await page.getByLabel("Garden width (m)").fill("8");
      await page.getByLabel("Garden length (m)").fill("5");
      await page.getByLabel("Garden length (m)").press("Enter");
    }
    await expect(page.getByText("Garden size set to 8 × 5 m.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeEnabled();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`size-${width}.png`) });
    await expectNoSideScroll(page);
    await page.getByRole("button", { name: "Continue to planting areas" }).click();

    // A reload mid-guide returns to the same step.
    await expect(track).toContainText("Step 2 of 4 · Planting areas");
    await page.reload();
    await expect(track).toContainText("Step 2 of 4 · Planting areas");
    await expect(track.getByRole("button", { name: "Garden size, completed" })).toBeVisible();

    // Step 2: Planting areas.
    await expect(page.getByRole("button", { name: "Continue to plants" })).toBeDisabled();
    await page.getByRole("button", { name: "Add Raised bed, 1.2 × 2.4 m" }).click();
    await expect(page.getByText("Raised bed 1 added at 0.5, 0.5 m. Drag it to move it, or drag its corner to resize it.", { exact: true })).toBeVisible();
    // The new bed is selected but not zoomed, so it can be placed against the garden (ADR-0075).
    await expect(page).toHaveURL(/\?area=/);
    await expect(surface).not.toHaveAttribute("data-focused-area", /.+/);
    await expect(page.getByRole("button", { name: "Add plant", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`areas-${width}.png`) });
    await expectNoSideScroll(page);
    await page.getByRole("button", { name: "Continue to plants" }).click();

    // Step 3: Plants, placed on the canvas zoomed into the same bed.
    await expect(track).toContainText("Step 3 of 4 · Plants");
    await expect(surface).toHaveAttribute("data-focused-area", /.+/);
    await expect(page.getByRole("button", { name: "Continue to Ready" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Skip plants for now" })).toBeEnabled();
    await expect(page.getByRole("group", { name: "Add a planting area" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add plant", exact: true }).click();
    await page.getByLabel("Plant type", { exact: true }).fill("Pepper");
    await page.getByRole("button", { name: "Fill area", exact: true }).click();
    await expect(page.getByText(/^Placed \d+ Pepper\. Undo removes them\.$/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`plants-${width}.png`) });
    await expectNoSideScroll(page);
    await page.getByRole("button", { name: "Continue to Ready" }).click();

    // Step 4: Ready summarises the garden and links into its context.
    await expect(track).toContainText("Step 4 of 4 · Ready");
    await expect(page).toHaveURL(new RegExp(`${gardenBase}/plan$`));
    await expect(page.getByRole("heading", { name: `${name} is ready` })).toBeVisible();
    const summary = page.getByRole("list", { name: "Garden summary" });
    await expect(summary).toContainText("1 planting area");
    await expect(summary).toContainText("1 plant group");
    const gardenId = decodeURIComponent(gardenBase.split("/")[2]);
    await expect(page.getByRole("link", { name: "Log the first watering" })).toHaveAttribute("href", `/care?${new URLSearchParams({ view: "history", location: gardenId })}`);
    await expect(page.getByRole("link", { name: "Plan next season" })).toHaveAttribute("href", `/season?${new URLSearchParams({ garden: gardenId })}`);
    await page.screenshot({ path: testInfo.outputPath(`ready-${width}.png`) });
    await expectNoSideScroll(page);

    // The Garden Note opens in the same dialog as Overview and returns to Ready.
    await page.getByRole("button", { name: "Write a Garden Note" }).click();
    const note = page.getByRole("dialog", { name: "Garden Note" });
    await expect(note).toBeVisible();
    await note.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(note).toHaveCount(0);
    await expect(page.getByRole("heading", { name: `${name} is ready` })).toBeVisible();

    // Each width follows a different Ready link into the L1 module filtered to this garden; leaving Ready ends the guide.
    if (width === 1440) {
      await page.getByRole("link", { name: "Log the first watering" }).click();
      await expect(page).toHaveURL(/\/care\?view=history&location=/);
      await expect(page.getByRole("combobox", { name: "Location", exact: true })).toHaveValue(gardenId);
      await expect(page.getByRole("button", { name: "Add care event" })).toBeVisible();
    } else {
      await page.getByRole("link", { name: "Plan next season" }).click();
      await expect(page).toHaveURL(/\/season\?garden=/);
      await expect(page.getByRole("region", { name: "Planting plans" }).getByRole("combobox", { name: "Garden", exact: true })).toHaveValue(gardenId);
      await expect(page.getByText(`Only ${name} ·`)).toBeVisible();
    }
    // Back returns to this garden's plan, and the finished guide stays closed.
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`${gardenBase}/plan$`));
    await expect(track).toHaveCount(0);
    // The finished garden switches levels instead; the Garden level holds its name and size (ADR-0075).
    await goToLevel(page, "Garden");
    await expect(page.getByLabel("Garden name")).toHaveValue(name);
    await expect(page.getByLabel("Garden width (m)")).toHaveValue("8");
    await expect(page.getByLabel("Garden length (m)")).toHaveValue("5");
  });
}
