import { expect, test } from "@playwright/test";
import { createSampleGardenWorkspace } from "../src/lib/gardenWorkspace";
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
  }, createSampleGardenWorkspace());
});

test("Garden Plan", async ({ page }) => {
  await page.goto("/gardens/demo-garden/plan");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(planSurface(page)).toHaveAttribute("data-zooming", "false");
  await page.locator('[data-mode="wide"]').screenshot({ path: "docs/screenshots/garden-plan.png" });
});

test("Next Season rotation sheet", async ({ page }) => {
  await page.goto("/season?garden=demo-garden");
  const plans = page.getByRole("region", { name: "Planting plans" });
  await expect(plans.getByRole("group")).toHaveCount(3);
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await plans.screenshot({ path: "docs/screenshots/season-rotation.png" });
});

test("Allocation Assistant recorded run", async ({ page }) => {
  await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: true, careNotePublicAvailable: false, careNoteBatchAvailable: false } }));
  await page.goto("/season?garden=demo-garden");
  await page.getByRole("button", { name: "Plan with AI" }).click();
  const drawer = page.getByRole("dialog", { name: "Plan with AI" });
  await drawer.getByRole("button", { name: "View example run" }).click();
  await expect(drawer.getByRole("region", { name: "Example run" })).toBeVisible();
  await drawer.screenshot({ path: "docs/screenshots/allocation-assistant.png" });
});
