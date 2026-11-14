import { expect, test } from "@playwright/test";
import { openAreaProperties } from "./areaHelpers";

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`area drafts survive plant creation and navigation at ${viewport.width}px`, async ({ page }, testInfo) => {
    const narrow = viewport.width < 768;
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await openAreaProperties(page, "Sample raised bed");
    await page.getByLabel("Planting-area name").fill("Draft kitchen bed");
    if (narrow) {
      // On a phone the properties page covers the plan; plants are added below the zoomed plan.
      await page.getByRole("link", { name: "Back to gardens" }).click();
      await page.getByRole("link", { name: "Open Demo Garden" }).click();
      await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
      // An unsaved properties draft reopens its editor with the area.
      await expect(page.getByLabel("Planting-area name")).toHaveValue("Draft kitchen bed");
    }
    const addPlant = page.getByRole("button", { name: "Add plant", exact: true });
    if (!narrow) {
      await addPlant.click();
      await page.getByLabel("Plant type", { exact: true }).fill("Kale");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.getByLabel("Planting-area name")).toHaveValue("Draft kitchen bed");
    }
    await page.getByRole("link", { name: "Back to gardens" }).click();
    await expect(page).toHaveURL("/");
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (narrow) await menu.click();
    await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Next Season", exact: true }).click();
    await expect(page).toHaveURL("/season");
    await page.getByRole("link", { name: "Back to gardens" }).click();
    await expect(page).toHaveURL("/");
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
    await expect(page.getByLabel("Planting-area name")).toHaveValue("Draft kitchen bed");
    if (narrow) {
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("button", { name: "Back to plan", exact: true }).click();
      await addPlant.click();
      await page.getByLabel("Plant type", { exact: true }).fill("Kale");
      await page.getByRole("button", { name: "Add", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Save", exact: true }).click();
    }
    await expect(page.getByText("All changes saved")).toBeVisible();
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    await expect.poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
      const workspace = await response.json();
      const area = workspace.gardens[0].growingAreas[0];
      return { name: area.name, hasKale: area.layout.allocations.some((plant: { plantType: string }) => plant.plantType === "Kale") };
    }).toEqual({ name: "Draft kitchen bed", hasKale: true });
    await page.reload();
    await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan\?area=/);
    await expect(page.getByRole("button", { name: "Edit Kale", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`editor-${viewport.width}.png`), fullPage: true });
  });
}
