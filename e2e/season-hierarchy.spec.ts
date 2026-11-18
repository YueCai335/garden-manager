import { expect, test } from "@playwright/test";
import { createSampleGardenWorkspace } from "../src/lib/gardenWorkspace";

for (const width of [390, 1440]) {
  test(`Next Season rotation sheet, Plan with AI drawer and future-only saves at ${width}px`, async ({ page }, testInfo) => {
    const workspace = createSampleGardenWorkspace();
    await page.setViewportSize({ width, height: 900 });
    // This acceptance journey must never generate an AI request.
    const aiRequests: string[] = [];
    await page.route("**/ai/**", (route) => { aiRequests.push(route.request().url()); return route.abort(); });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(value));
    }, workspace);
    // The old garden route lands on Next Season for that garden (ADR-0073, phase S3).
    await page.goto("/gardens/demo-garden/season");
    await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
    await expect(page.getByRole("heading", { level: 1, name: "Next Season" })).toBeVisible();
    const sheet = page.getByRole("region", { name: /rotation sheet for Demo Garden$/ });
    await expect(sheet.getByText("0 of 3 areas planned")).toBeVisible();
    // One garden at a time: a switch with progress, no "All gardens" select (ADR-0082).
    const switcher = page.getByRole("navigation", { name: "Garden" });
    await expect(switcher.getByRole("link", { name: "Demo Garden, 0 of 3 areas planned" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("combobox", { name: "Garden", exact: true })).toHaveCount(0);
    // An L1 page has no plan-level garden switcher or breadcrumb, and nothing folds.
    await expect(page.locator("#workspace-garden")).toHaveCount(0);
    await expect(page.locator("#workspace-content summary")).toHaveCount(0);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    const workspaceUrl = `http://127.0.0.1:8100/workspaces/${id}`;
    const initial = await page.request.get(workspaceUrl);
    expect(initial.ok()).toBe(true);
    const originalPlantings = (await initial.json()).gardens[0].plantings;

    const row = sheet.getByRole("group", { name: "Sample raised bed", exact: true });
    await expect(row.getByText("Tomato · Sun Gold")).toBeVisible();
    await expect(row.getByText("Nightshade", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Choose a plant for Sample raised bed" }).click();
    await row.getByLabel("Plant type", { exact: true }).fill("Tomato");
    await expect(row.getByText(/^Nightshade grew here in \d{4}$/)).toBeVisible();
    await row.getByLabel("Plant type", { exact: true }).fill("Kale");
    await expect(row.getByText(/^Good fit here:/)).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(sheet.getByText("1 of 3 areas planned")).toBeVisible();
    await expect(row.getByRole("button", { name: "Add a plant to Sample raised bed" })).toBeFocused();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const response = await page.request.get(workspaceUrl);
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(saved.gardens[0].plantings).toEqual(originalPlantings);
    expect(saved.gardens[0].seasonPlans[0].plantings[0].commonName).toBe("Kale");
    await page.reload();
    await expect(row.getByText("Kale", { exact: true })).toBeVisible();
    await expect(switcher.getByRole("link", { name: "Demo Garden, 1 of 3 areas planned" })).toBeVisible();
    // The map numbers the bed like its row and fills it once planned.
    await expect(page.getByTestId("season-area-label-demo-raised-bed")).toHaveText("1");

    // Plan with AI opens a drawer only on request; Escape closes it and focus returns.
    const opener = sheet.getByRole("button", { name: "Plan with AI" });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await opener.click();
    const drawer = page.getByRole("dialog", { name: "Plan with AI" });
    await expect(drawer).toBeVisible();
    // Each crop pill stays on one line with a 44px-class target.
    const crops = drawer.getByRole("group", { name: "Crops" });
    for (const crop of ["Tomato", "Bean", "Lettuce", "Cucumber", "Carrot"]) {
      const pill = crops.locator("label", { hasText: crop });
      expect((await pill.boundingBox())!.height).toBeLessThanOrEqual(48);
    }
    await crops.getByRole("checkbox", { name: "Bean" }).check();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(crops.getByRole("checkbox", { name: "Bean" })).toBeChecked();
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toBeHidden();

    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(aiRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`season-${width}.png`), fullPage: true });
  });
}
