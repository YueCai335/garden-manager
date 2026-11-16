import { expect, test } from "@playwright/test";
import { goToLevel, openAreaProperties } from "./areaHelpers";
import { openWorkspace, workspaceHome } from "./workspace";

// Area properties apply on blur or Enter (ADR-0072, phase G5). A value that
// cannot apply stays as a draft, and that draft survives navigation (ADR-0062).
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`applied edits and an invalid area draft survive plant creation and navigation at ${viewport.width}px`, async ({ page }, testInfo) => {
    const narrow = viewport.width < 768;
    await page.setViewportSize(viewport);
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await openAreaProperties(page, "Sample raised bed");
    const name = page.getByLabel("Planting-area name");
    const width = page.getByLabel("Width (m)", { exact: true });
    await name.fill("Draft kitchen bed");
    await name.press("Enter");
    await width.fill("");
    await name.focus();
    await expect(page.getByText("Not applied yet: fix the highlighted values.", { exact: true })).toBeVisible();
    if (narrow) {
      // On a phone the properties page covers the plan; plants are added on the Plants level later.
      await page.getByRole("link", { name: "All gardens", exact: true }).click();
      await page.getByRole("link", { name: "Open Demo Garden" }).click();
      await goToLevel(page, "Planting areas");
      await page.getByRole("link", { name: "Edit Draft kitchen bed" }).click();
      // The draft that could not apply reopens its editor with the area.
      await expect(width).toHaveValue("");
    } else {
      // Plants are added on the Plants level; the area's draft waits on Planting areas (ADR-0075).
      await goToLevel(page, "Plants");
      await page.getByRole("button", { name: "Add plant", exact: true }).click();
      await page.getByLabel("Plant type", { exact: true }).fill("Kale");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await goToLevel(page, "Planting areas");
      await expect(width).toHaveValue("");
    }
    await page.getByRole("link", { name: "All gardens", exact: true }).click();
    await expect(page).toHaveURL(workspaceHome);
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (narrow) await menu.click();
    await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Next Season", exact: true }).click();
    await expect(page).toHaveURL("/season");
    if (narrow) await menu.click();
    await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Gardens", exact: true }).click();
    await expect(page).toHaveURL(workspaceHome);
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await goToLevel(page, "Planting areas");
    await page.getByRole("link", { name: "Edit Draft kitchen bed" }).click();
    await expect(name).toHaveValue("Draft kitchen bed");
    await expect(width).toHaveValue("");
    await width.fill("3");
    await width.press("Enter");
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    if (narrow) {
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await goToLevel(page, "Plants");
      await page.getByRole("button", { name: "Add plant", exact: true }).click();
      await page.getByLabel("Plant type", { exact: true }).fill("Kale");
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }
    await expect(page.getByText("All changes saved")).toBeVisible();
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    await expect.poll(async () => {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
      const workspace = await response.json();
      const area = workspace.gardens[0].growingAreas[0];
      return { name: area.name, width: area.layout.widthMeters, hasKale: area.layout.allocations.some((plant: { plantType: string }) => plant.plantType === "Kale") };
    }).toEqual({ name: "Draft kitchen bed", width: 3, hasKale: true });
    if (!narrow) await goToLevel(page, "Plants");
    await page.reload();
    await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan\?area=/);
    await expect(page.getByRole("button", { name: "Edit Kale", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`editor-${viewport.width}.png`) });
  });
}
