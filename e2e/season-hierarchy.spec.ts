import { expect, test } from "@playwright/test";
import { createDemoGardenWorkspace } from "../src/lib/gardenWorkspace";

for (const width of [390, 1440]) {
  test(`Next Season plans, disclosures and future-only saves at ${width}px`, async ({ page }, testInfo) => {
    const workspace = createDemoGardenWorkspace();
    await page.setViewportSize({ width, height: 900 });
    // This acceptance journey must never generate an AI request.
    const aiRequests: string[] = [];
    await page.route("**/ai/**", (route) => { aiRequests.push(route.request().url()); return route.abort(); });
    await page.addInitScript((value) => {
      if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(value));
    }, workspace);
    await page.goto("/gardens/demo-garden/season");
    await expect(page.getByRole("heading", { level: 1, name: /Next Season ·/ })).toBeVisible();
    await expect(page.getByText("0 of 3 areas planned")).toBeVisible();
    await expect(page.getByLabel("Garden", { exact: true })).toHaveValue("demo-garden");
    await expect(page.getByRole("region", { name: "Planting plans" }).getByLabel("Garden", { exact: true })).toHaveCount(0);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    const workspaceUrl = `http://127.0.0.1:8100/workspaces/${id}`;
    const initial = await page.request.get(workspaceUrl);
    expect(initial.ok()).toBe(true);
    const originalPlantings = (await initial.json()).gardens[0].plantings;
    const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Sample raised bed", exact: true }) });
    await expect(card.getByText("Good rotation fit", { exact: true })).toBeHidden();
    await card.locator("summary", { hasText: "Rotation details" }).focus();
    await page.keyboard.press("Enter");
    await expect(card.getByText("Good rotation fit", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: "Choose a plant" }).click();
    await card.getByLabel("Plant type", { exact: true }).fill("Kale");
    await card.getByRole("button", { name: /Add to .* plan/ }).click();
    await expect(page.getByText("1 of 3 areas planned")).toBeVisible();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    const response = await page.request.get(workspaceUrl);
    expect(response.ok()).toBe(true);
    const saved = await response.json();
    expect(saved.gardens[0].plantings).toEqual(originalPlantings);
    expect(saved.gardens[0].seasonPlans[0].plantings[0].commonName).toBe("Kale");
    await page.reload();
    await expect(card.getByText("Kale", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Add a plant" })).toBeVisible();
    await page.locator("summary", { hasText: "Plan preview · Demo Garden" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(aiRequests).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`season-${width}.png`), fullPage: true });
  });
}
