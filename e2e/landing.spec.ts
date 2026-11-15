import { expect, test } from "@playwright/test";
import { workspaceHome } from "./workspace";

test("the landing page loads without the API and every entry point opens the app", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("http://127.0.0.1:8100")) apiRequests.push(request.url()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The landing frame has its own header, not the workspace navigation.
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.waitForLoadState("networkidle");
  expect(apiRequests).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Open app" }).click();
  await expect(page).toHaveURL(workspaceHome);
  // The app frame: its Gardens heading shows at every width (the phone width folds the navigation into Menu).
  await expect(page.getByRole("heading", { name: "Gardens", level: 1 })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(workspaceHome);

  await page.goto("/");
  const features = page.getByRole("region", { name: "Features" });
  await features.getByRole("link", { name: "Try it" }).first().click();
  await expect(page).toHaveURL(workspaceHome);

  await page.goto("/");
  await features.getByRole("link", { name: "Try it" }).last().click();
  await expect(page).toHaveURL(/\/notes$/);

  // Inside the app, the brand link stays in the app.
  await page.getByRole("link", { name: "Garden Manager" }).click();
  await expect(page).toHaveURL(workspaceHome);
});
