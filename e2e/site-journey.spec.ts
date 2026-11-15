import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { todayDate } from "../src/lib/gardenWorkspace";
import { workspaceHome } from "./workspace";

/**
 * ADR-0073 S7: the visitor journey from the landing page into the app, at three widths and
 * at a simulated 200% browser zoom (a 1440 × 900 window at zoom 200% lays out at 720 × 450 CSS
 * pixels with a device pixel ratio of 2). Every step is screenshotted into this test's output
 * folder under test-results/ and checked for horizontal scroll.
 */
const sizes = [
  { name: "1440", width: 1440, height: 900, scale: 1 },
  { name: "768", width: 768, height: 1024, scale: 1 },
  { name: "390", width: 390, height: 844, scale: 1 },
  { name: "zoom-200", width: 720, height: 450, scale: 2 },
];

async function step(page: Page, testInfo: TestInfo, size: string, name: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${name} scrolls sideways at ${size}`).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath(`${size}-${name}.png`) });
}

for (const size of sizes) {
  test.describe(`at ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.scale });

    test("a visitor goes from the landing page to the Garden Plan and records a note", async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      // The Next.js development badge is not part of the product.
      await page.addInitScript(() => {
        addEventListener("DOMContentLoaded", () => {
          const style = document.createElement("style");
          style.textContent = "nextjs-portal { display: none !important; }";
          document.head.append(style);
        });
      });
      // Single-record note drafting with a mocked extraction; the workspace uses the isolated test backend.
      await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: false } }));
      await page.route("**/ai/**", (route) => route.fulfill({ json: { kind: "completed", type: "watering", date: todayDate(), note: "Watered the raised bed", targetScope: "garden", reviewNotes: [] } }));

      // 1. Landing page.
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await step(page, testInfo, size.name, "1-landing");

      // 2. Into the app.
      await page.getByRole("link", { name: "Open the app" }).click();
      await expect(page).toHaveURL(workspaceHome);
      await expect(page.getByRole("heading", { name: "Gardens", level: 1 })).toBeVisible();
      await page.getByRole("button", { name: "Load demo garden" }).click();
      await expect(page.getByRole("link", { name: "Open Demo Garden" })).toBeVisible();
      await expect(page.getByText("All changes saved", { exact: true }).first()).toBeAttached();
      await step(page, testInfo, size.name, "2-gardens");

      // 3. The Garden Plan canvas.
      await page.getByRole("link", { name: "Open Demo Garden" }).click();
      await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
      await expect(page.getByTestId("garden-plan-canvas")).toBeVisible();
      await expect(page.getByTestId("garden-plan-canvas")).toHaveAttribute("data-zooming", "false");
      await step(page, testInfo, size.name, "3-plan");

      // 4. "+ Note" from the header, review the draft, and save it.
      await page.getByRole("banner").getByRole("button", { name: "Note", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Garden Note" });
      await expect(dialog).toBeVisible();
      await dialog.getByLabel("Care note").fill("Watered the raised bed");
      await dialog.getByLabel("Garden", { exact: true }).selectOption("demo-garden");
      await step(page, testInfo, size.name, "4-note");
      await dialog.getByRole("button", { name: "Create draft", exact: true }).click();
      await expect(dialog.getByRole("heading", { name: "AI extracted draft" })).toBeVisible();
      await step(page, testInfo, size.name, "5-draft");
      await dialog.getByRole("button", { name: "Save to Care History" }).last().click();
      await expect(dialog.getByText("Saved 1 record", { exact: true })).toBeVisible();
      await expect(page.getByText("All changes saved", { exact: true }).first()).toBeAttached();
      await step(page, testInfo, size.name, "6-saved");

      // The record reached the backend.
      const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
      await expect.poll(async () => {
        const workspace = await (await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`)).json();
        return workspace.gardens[0].careEvents.some((event: { note: string }) => event.note === "Watered the raised bed");
      }).toBe(true);
    });
  });
}
