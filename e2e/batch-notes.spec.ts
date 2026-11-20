import { expect, test, type Page } from "@playwright/test";
import { careFixture } from "../src/test/careFixture";
import { todayDate, type GardenWorkspace } from "../src/lib/gardenWorkspace";
import { openWorkspace, workspaceHome } from "./workspace";

// "Split into records" appears on the home card once batch drafting is enabled; after that the
// header's "+ Note" opens the batch review, not the single-record fallback (ADR-0085 N6).
async function openNoteEditor(page: Page) {
  await expect(page.getByRole("button", { name: "Split into records" })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Note", exact: true }).click();
}

for (const width of [390, 1440]) {
  test(`homepage batch review saves across gardens at ${width}px`, async ({ page }, testInfo) => {
    const fixture = careFixture();
    fixture.gardens[1].careEvents[0].id = "back-one";
    fixture.gardens[1].careTasks[0].id = "back-repeat";
    await page.setViewportSize({ width, height: 900 });
    let extractions = 0;
    // Only extraction is mocked; workspace persistence uses the isolated test backend.
    await page.route("**/ai/**", async (route) => {
      if (!route.request().url().endsWith("/care-note-drafts")) return route.abort();
      extractions += 1;
      await route.fulfill({ json: {
        drafts: ["front", "back"].map((gardenId) => ({ gardenId, sourceText: `Watered ${gardenId} today`, type: "watering", date: "2026-11-11", targetScope: "garden", growingAreaId: null, plantingRecordId: null, fertilizerProduct: null, fertilizerAmount: null, fertilizerUnit: null, reviewNotes: [] })), notices: [],
      } });
    });
    await page.addInitScript((workspace) => {
      if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(workspace));
    }, fixture);
    await openWorkspace(page);
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await openNoteEditor(page);
    const dialog = page.getByRole("dialog", { name: "Garden Note" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(workspaceHome);
    await page.getByLabel("Care note").fill("Watered front today; Watered back today");
    await page.getByRole("button", { name: "Split into records", exact: true }).click();
    const first = page.getByRole("article", { name: "Draft 1" });
    const second = page.getByRole("article", { name: "Draft 2" });
    await expect(second).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save 2 records" })).toBeInViewport();
    await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeInViewport();
    if (width === 1440) {
      await page.mouse.click(8, 8);
      await expect(dialog).toBeVisible();
    }
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    async function remote() {
      const result = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
      expect(result.ok()).toBeTruthy();
      return await result.json() as GardenWorkspace & { revision: number };
    }
    const before = await remote();
    expect(before.gardens.map((garden) => garden.careEvents.length)).toEqual([2, 3]);
    // Rows start collapsed (ADR-0085); the summary opens a row's fields.
    await first.locator("summary").click();
    await first.getByLabel("Record note").fill("Reviewed front watering");
    await page.keyboard.press("Escape");
    const resume = page.getByRole("button", { name: "Continue review" });
    // Escape returns focus to the button that opened the note: here the header's "+ Note".
    await expect(page.getByRole("banner").getByRole("button", { name: "Note", exact: true })).toBeFocused();
    await resume.click();
    await expect(first.getByLabel("Record note")).toHaveValue("Reviewed front watering");
    await second.locator("summary").click();
    await second.getByLabel("Date", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save 2 records", exact: true }).click();
    await expect(second.getByLabel("Date", { exact: true })).toBeFocused();
    expect((await remote()).revision).toBe(before.revision);
    await second.getByLabel("Date", { exact: true }).fill("2026-11-11");
    await page.screenshot({ path: testInfo.outputPath(`batch-review-${width}.png`) });
    const save = page.getByRole("button", { name: "Save 2 records", exact: true });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Saved 2 records", exact: true })).toBeVisible();
    await expect(page).toHaveURL(workspaceHome);
    const after = await remote();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.gardens.map((garden) => garden.careEvents.length)).toEqual([3, 4]);
    expect(after.gardens[0].careEvents.at(-1)?.note).toBe("Reviewed front watering");
    expect(after.careEvents).toEqual(before.careEvents);
    expect(extractions).toBe(1);
    await page.getByRole("link", { name: "View in Care history", exact: true }).click();
    await expect(page).toHaveURL("/care?view=history");
    await expect(page.getByText("Reviewed front watering", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Reviewed front watering", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test("mobile review keeps six drafts and retries a failed save inside the dialog", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const date = todayDate();
  await page.route("**/ai/**", (route) => route.fulfill({ json: {
    drafts: Array.from({ length: 6 }, (_, index) => ({ gardenId: "demo-garden", sourceText: `Watered plant ${index + 1}`, type: "watering", date, targetScope: "garden", growingAreaId: null, plantingRecordId: null, fertilizerProduct: null, fertilizerAmount: null, fertilizerUnit: null, reviewNotes: [] })),
    notices: [],
  } }));
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await openNoteEditor(page);
  const dialog = page.getByRole("dialog", { name: "Garden Note" });
  await expect(dialog).toHaveCSS("width", "390px");
  await expect(dialog).toHaveCSS("height", "844px");
  await dialog.getByLabel("Care note").fill("Watered plants 1, 2, 3, 4, 5 and 6 today");
  await dialog.getByRole("button", { name: "Split into records" }).click();
  await expect(dialog.getByRole("article")).toHaveCount(6);
  const last = dialog.getByRole("article", { name: "Draft 6" });
  await last.locator("summary").click();
  await last.getByLabel("Record note").fill("Reviewed the sixth record");
  await expect(dialog.getByRole("button", { name: "Save 6 records" })).toBeInViewport();
  await last.getByRole("button", { name: "Remove draft" }).click();
  await expect(page.getByRole("alertdialog", { name: "Remove draft" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(dialog.getByRole("article")).toHaveCount(6);
  await expect(last.getByRole("button", { name: "Remove draft" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("six-draft-mobile-dialog.png") });

  let attempts = 0;
  await page.route("**/workspaces/*", (route) => {
    if (route.request().method() === "PUT" && ++attempts === 1) return route.abort();
    return route.continue();
  });
  await dialog.getByRole("button", { name: "Save 6 records" }).click();
  await expect(dialog.getByText("Changes not synced")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "View status" }).click();
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Saved 6 records" })).toBeVisible();
  expect(attempts).toBe(2);
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(workspaceHome);
});
