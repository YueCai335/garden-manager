import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY } from "../src/lib/gardenWorkspace";
import type { ServerWorkspace } from "../src/lib/gardenWorkspaceApi";
import { openWorkspace } from "./workspace";

test("a missing workspace can export and restore its browser copy without reusing the old ID", async ({ page }) => {
  const serverKey = "sun-aware-garden-planner:server-workspace-id:v1";
  const oldId = "missing-browser-workspace";
  const backup = createGardenWorkspace("Recovered kitchen garden");
  const raw = JSON.stringify(backup);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(({ serverKey, oldId, key, raw }) => {
    if (sessionStorage.getItem("recovery-fixture-loaded")) return;
    sessionStorage.setItem("recovery-fixture-loaded", "true");
    localStorage.setItem(serverKey, oldId);
    localStorage.setItem(key, raw);
  }, { serverKey, oldId, key: GARDEN_WORKSPACE_STORAGE_KEY, raw });

  await page.goto("/care");
  await expect(page.getByRole("heading", { name: "Workspace not found" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download browser copy" }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toBe("garden-workspace-backup.json");
  expect(await readFile(await download.path(), "utf8")).toBe(raw);
  expect(await page.evaluate((key) => localStorage.getItem(key), serverKey)).toBe(oldId);

  await page.getByRole("button", { name: "Restore browser copy" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Restore browser copy" }).click();
  await expect(page).toHaveURL(/\/gardens$/);
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  const restoredId = await page.evaluate((key) => localStorage.getItem(key), serverKey);
  expect(restoredId).toBeTruthy();
  expect(restoredId).not.toBe(oldId);
  const restored = await page.request.get(`http://127.0.0.1:8100/workspaces/${restoredId}`);
  expect(restored.ok()).toBe(true);
  expect((await restored.json()).gardens).toEqual(backup.gardens);
  await page.reload();
  await expect(page.getByRole("link", { name: "Open Recovered kitchen garden" })).toBeVisible();
});

test("a failed season save can be retried from another module without creating a duplicate", async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();

  let writes = 0;
  await page.route("**/workspaces/*", async (route) => {
    if (route.request().method() === "PUT") {
      writes += 1;
      if (writes === 1) return route.abort("internetdisconnected");
    }
    await route.continue();
  });
  await page.getByRole("link", { name: "Next Season", exact: true }).click();
  const area = page.locator("article", { has: page.getByRole("heading", { name: "Sample raised bed" }) });
  await area.getByRole("button", { name: "Choose a plant" }).click();
  await area.getByLabel("Plant type").fill("Kale");
  await area.getByRole("button", { name: `Add to ${nextYear} plan` }).click();
  await expect(page.getByText("Changes not synced", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Gardens", exact: true }).click();
  await expect(page.getByText("Changes not synced", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  expect(writes).toBe(2);

  const workspaceId = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  const stored = await (await page.request.get(`http://127.0.0.1:8100/workspaces/${workspaceId}`)).json();
  const plantings = stored.gardens[0].seasonPlans.find((plan: { seasonYear: number }) => plan.seasonYear === nextYear).plantings;
  expect(plantings).toHaveLength(1);
  expect(plantings[0].commonName).toBe("Kale");
  await page.getByRole("link", { name: "Next Season", exact: true }).click();
  await expect(page).toHaveURL(/\/season$/);
  await page.reload();
  await expect(page.getByRole("region", { name: /plan for Sample raised bed/ }).getByText("Kale", { exact: true })).toBeVisible();
  expect(writes).toBe(2);
});

test("a committed save with a lost response reloads the original record after a 409", async ({ page }) => {
  const nextYear = new Date().getFullYear() + 1;
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  const workspaceId = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  expect(workspaceId).toBeTruthy();
  const workspaceUrl = `http://127.0.0.1:8100/workspaces/${workspaceId}`;
  const readWorkspace = async () => {
    const response = await page.request.get(workspaceUrl);
    expect(response.ok()).toBe(true);
    return await response.json() as ServerWorkspace;
  };
  const before = await readWorkspace();
  let writes = 0;
  await page.route(workspaceUrl, async (route) => {
    if (route.request().method() === "PUT" && ++writes === 1) {
      const committed = await route.fetch();
      expect(committed.ok()).toBe(true);
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.getByRole("link", { name: "Next Season", exact: true }).click();
  const area = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Sample raised bed", exact: true }) });
  await area.getByRole("button", { name: "Choose a plant" }).click();
  await area.getByLabel("Plant type").fill("Kale");
  await area.getByRole("button", { name: `Add to ${nextYear} plan` }).click();
  await expect(page.getByText("Changes not synced", { exact: true })).toBeVisible();
  const committed = await readWorkspace();
  const plantings = committed.gardens[0].seasonPlans?.find((plan) => plan.seasonYear === nextYear)?.plantings;
  expect(plantings).toHaveLength(1);
  expect(plantings?.[0].commonName).toBe("Kale");

  const conflict = page.waitForResponse((response) => response.url() === workspaceUrl && response.status() === 409);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await conflict;
  await expect(page.getByText("A newer version is available", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reload latest", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard unsynced changes and reload" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await expect(area.getByText("Kale", { exact: true })).toBeVisible();
  await page.reload();
  await expect(area.getByText("Kale", { exact: true })).toBeVisible();
  expect(committed.revision).toBe(before.revision + 1);
  expect(await readWorkspace()).toEqual(committed);
  expect(writes).toBe(2);
});

test("a sync conflict clears Garden Plan undo history and says why", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await expect(undo).toBeDisabled();
  // Another tab has moved the server on: the next write is rejected as stale.
  await page.route("**/workspaces/*", async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    const current = (route.request().postDataJSON() as { revision: number }).revision + 5;
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ detail: { message: "stale", currentRevision: current } }) });
  });
  await page.getByRole("button", { name: "Add Container, 0.6 × 0.6 m" }).click();
  await expect(page.getByText("A newer version is available", { exact: true })).toBeVisible();
  await expect(page.getByText("Undo history was cleared because this workspace changed in another tab.", { exact: true })).toBeVisible();
  await expect(undo).toBeDisabled();
});
