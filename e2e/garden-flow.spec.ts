import { expect, test } from "@playwright/test";

/**
 * The one flow that has to work end to end: a gardener creates a garden,
 * edits and saves it, plans next season, and finds everything still there
 * after a reload — served back by the real API and database, not by the
 * browser's local copy.
 */
test("create a garden, save an edit, plan next season, and find both after a reload", async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;

  await page.goto("/");

  // Load the demo garden so there is a planting area to plan against.
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByRole("link", { name: "Open Demo Garden" })).toBeVisible();

  // Rename the garden and save.
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByRole("heading", { name: "Garden Plan" })).toBeVisible();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  await page.getByLabel("Garden name").fill("E2E Kitchen Garden");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();

  // Plan a plant for next season in the raised bed.
  await page.getByRole("link", { name: "Back to gardens" }).click();
  await expect(page).toHaveURL("/");
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
