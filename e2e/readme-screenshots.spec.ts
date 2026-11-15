import { expect, test } from "@playwright/test";
import { createDemoGardenWorkspace } from "../src/lib/gardenWorkspace";
import { planSurface } from "./areaHelpers";

/**
 * Refreshes the README screenshots in docs/screenshots from the demo garden.
 * It writes into the repository, so it runs only on request:
 *
 *   CAPTURE_README_SCREENSHOTS=1 npx playwright test e2e/readme-screenshots.spec.ts
 *
 * The Allocation Assistant capture answers the runtime-config request as the
 * public demo does, so the page shows the recorded run (ADR-0057). No AI
 * request is made.
 */
test.skip(!process.env.CAPTURE_README_SCREENSHOTS, "Set CAPTURE_README_SCREENSHOTS=1 to refresh the README images.");
test.use({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
  await page.route("**/ai/**", (route) => route.abort());
  // The Next.js development badge is not part of the product.
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  await page.addInitScript((value) => {
    if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(value));
  }, createDemoGardenWorkspace());
});

test("Garden Plan", async ({ page }) => {
  await page.goto("/gardens/demo-garden/plan");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(planSurface(page)).toHaveAttribute("data-zooming", "false");
  await page.locator('[data-mode="wide"]').screenshot({ path: "docs/screenshots/garden-plan.png" });
});

test("Next Season rotation details", async ({ page }) => {
  await page.goto("/season?garden=demo-garden");
  const plans = page.getByRole("region", { name: "Planting plans" });
  await expect(plans.getByRole("article")).toHaveCount(3);
  for (const summary of await plans.locator("summary", { hasText: "Rotation details" }).all()) await summary.click();
  await expect(plans.getByText("Good rotation fit", { exact: true }).first()).toBeVisible();
  await plans.screenshot({ path: "docs/screenshots/season-rotation.png" });
});

test("Allocation Assistant recorded run", async ({ page }) => {
  await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: true, careNotePublicAvailable: false, careNoteBatchAvailable: false } }));
  await page.goto("/season?garden=demo-garden");
  await page.locator("summary", { hasText: "Allocation Assistant · Demo Garden" }).click();
  await page.getByRole("button", { name: "View example run" }).click();
  const assistant = page.locator("section.allocation-assistant");
  await expect(assistant.getByRole("region", { name: "Example run" })).toBeVisible();
  await assistant.screenshot({ path: "docs/screenshots/allocation-assistant.png" });
});
