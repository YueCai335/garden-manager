import { expect, test } from "@playwright/test";
import { openAreaProperties } from "./areaHelpers";
import { openWorkspace } from "./workspace";

for (const width of [390, 1440]) {
  test(`destructive confirmations contain focus and restore context at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.route("**/ai/**", (route) => route.abort());
    await openWorkspace(page);
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await page.getByRole("link", { name: "Open Demo Garden" }).click();
    await openAreaProperties(page, "Sample raised bed");
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    let writes = 0;
    page.on("request", (request) => { if (request.method() === "PUT" && request.url().includes("/workspaces/")) writes += 1; });
    const trigger = page.getByRole("button", { name: "Delete area", exact: true });
    await trigger.click();
    const dialog = page.getByRole("alertdialog", { name: "Delete planting area" });
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    const confirm = dialog.getByRole("button", { name: "Delete planting area", exact: true });
    await expect(cancel).toBeFocused();
    await expect(dialog).toContainText("Care history, tasks, and health records stay");
    await page.keyboard.press("Shift+Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(cancel).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.mouse.click(3, 3);
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    expect(await confirm.evaluate((button) => button.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(confirm).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`delete-area-${width}.png`) });
    if (width === 390) {
      await page.setViewportSize({ width, height: 320 });
      await expect(confirm).toBeInViewport();
      expect(await dialog.locator(`[id="${await dialog.getAttribute("aria-describedby")}"]`).evaluate((description) => description.parentElement!.scrollHeight > description.parentElement!.clientHeight)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("delete-area-short-screen.png") });
      await page.setViewportSize({ width, height: 844 });
    }
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(writes).toBe(0);
    await trigger.click();
    await confirm.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Garden Plan", exact: true })).toBeFocused();
    await expect(page.getByRole("link", { name: "Edit Sample raised bed" })).toHaveCount(0);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await page.reload();
    await expect(page.getByRole("link", { name: "Edit Sample raised bed" })).toHaveCount(0);
  });
}

test("care form cancellation keeps drafts until explicit discard", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.goto("/care?view=tasks&location=demo-garden");
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByLabel("Note (optional)").fill("Keep this draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Keep editing" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Note (optional)")).toHaveValue("Keep this draft");
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(page.getByRole("dialog", { name: "Add care task" })).toHaveCount(0);
  await expect(page.locator("#care-today-heading")).toBeFocused();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(page.getByLabel("Note (optional)")).toHaveValue("");
});
