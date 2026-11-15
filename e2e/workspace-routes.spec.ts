import { expect, test } from "@playwright/test";
import { openWorkspace, workspaceHome } from "./workspace";

test("deep links, browser history, and missing entities keep explicit garden context", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  // A blank name cannot apply, so it stays as a draft across history navigation.
  await page.getByLabel("Planting-area name").fill("");
  await page.getByRole("link", { name: "Plant Guide", exact: true }).click();
  await expect(page).toHaveURL(/\/guide$/);
  await page.goBack();
  await expect(page.getByLabel("Planting-area name")).toHaveValue("");
  await page.goForward();
  await expect(page).toHaveURL(/\/guide$/);
  await page.goBack();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.goto("/gardens/demo-garden/care?view=history");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.goto("/gardens/demo-garden/season");
  await expect(page.getByRole("heading", { name: /Next Season ·/ })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/season$/);
  await page.goto("/gardens/demo-garden/plan?area=missing");
  await expect(page.getByRole("alert").filter({ hasText: "Planting area not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to plan" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  await page.goto("/gardens/missing/plan");
  await expect(page.getByRole("heading", { name: "Garden not found in this workspace" })).toBeVisible();
});

test("mobile navigation preserves a note across routes without a model request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let modelRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/ai/care-note-draft")) modelRequests += 1; });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  // Wait for batch drafting so the editor opens the same session the Overview quick note shows.
  await expect(page.getByRole("button", { name: "Generate draft" })).toBeVisible();
  await page.getByRole("button", { name: "Open note editor" }).click();
  await page.getByLabel("Care note").fill("Watered the front garden today");
  await page.keyboard.press("Escape");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Plant Guide", exact: true }).click();
  await expect(page).toHaveURL("/guide");
  // Notes start only from Overview (ADR-0069 amendment); the note survives the round trip.
  await page.getByRole("link", { name: "Back to gardens", exact: true }).click();
  await expect(page).toHaveURL(workspaceHome);
  await expect(page.getByRole("textbox", { name: "Quick garden note" })).toHaveValue("Watered the front garden today");
  await page.getByRole("button", { name: "Open note editor" }).click();
  await expect(page.getByRole("dialog", { name: "Garden Note" }).getByLabel("Care note")).toHaveValue("Watered the front garden today");
  expect(modelRequests).toBe(0);
});
