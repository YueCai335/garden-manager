import { expect, test, type Page } from "@playwright/test";
import { careFixture } from "../src/test/careFixture";
import { addDays, todayDate, type GardenWorkspace } from "../src/lib/gardenWorkspace";
import { openWorkspace } from "./workspace";

const STORAGE = "sun-aware-garden-planner:garden-workspace:v1";
const NOTE = "Watered the front garden. Pruned side shoots in the back. Will feed the front tomorrow.";

async function remote(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as GardenWorkspace;
}

/**
 * Seeds the Care fixture and mocks only extraction: watering the Front garden matches its overdue
 * "Front task", pruning goes to the Back garden, and feeding the front tomorrow is a planned job.
 * Saving goes through the isolated e2e backend.
 */
async function seedNote(page: Page, { backDate = todayDate() }: { backDate?: string | null } = {}) {
  const today = todayDate();
  const fixture = careFixture();
  // Real storage requires globally unique IDs.
  fixture.gardens[1].careEvents[0].id = "back-one";
  fixture.gardens[1].careTasks[0].id = "back-repeat";
  await page.addInitScript(([key, workspace]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(workspace));
  }, [STORAGE, fixture] as const);
  const requests: string[] = [];
  await page.route("**/ai/**", async (route) => {
    if (!route.request().url().endsWith("/care-note-drafts")) return route.abort();
    requests.push(route.request().postDataJSON().note);
    const draft = { growingAreaId: null, plantingRecordId: null, reviewNotes: [] };
    await route.fulfill({ json: {
      drafts: [
        { ...draft, gardenId: "front", sourceText: "Watered the front garden.", type: "watering", date: today, targetScope: "garden" },
        { ...draft, gardenId: "back", sourceText: "Pruned side shoots in the back.", type: "pruning", date: backDate, targetScope: "garden", pruneDetail: "Side shoots" },
      ],
      notices: [{
        sourceText: "Will feed the front tomorrow.", reason: "planned", message: "This sounds planned, so it was not recorded.",
        task: { gardenId: "front", type: "fertilizing", dueDate: addDays(today, 1), targetScope: "garden", growingAreaId: null, plantingRecordId: null },
      }],
    } });
  });
  await openWorkspace(page);
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  return requests;
}

/** ADR-0085 end to end: a home-card note becomes records in two gardens, ticks off a task, and adds one. */
test("a home-card note splits across gardens, ticks off a due task, and adds a planned one", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const today = todayDate();
  const tomorrow = addDays(today, 1);
  const requests = await seedNote(page);

  const card = page.getByRole("region", { name: "AI Garden Notes" });
  await card.getByLabel("Quick garden note").fill(NOTE);
  await card.getByRole("button", { name: "Split into records" }).click();

  const dialog = page.getByRole("dialog", { name: "Garden Note" });
  await expect(dialog.getByRole("heading", { name: "2 records across 2 gardens" })).toBeVisible();
  expect(requests).toEqual([NOTE]);
  await expect(dialog.getByText("Completes 1 task", { exact: true })).toBeVisible();
  const front = dialog.getByRole("region", { name: "Front garden" });
  const back = dialog.getByRole("region", { name: "Back garden" });
  await expect(front.getByRole("checkbox", { name: /Completes “Water Front garden”/ })).toBeChecked();
  await expect(back.locator("summary")).toContainText(/Whole garden · Side shoots/);
  const notRecorded = dialog.getByRole("region", { name: "Not recorded" });
  await notRecorded.getByRole("button", { name: /^Add as a task for/ }).click();
  await expect(notRecorded.getByRole("button", { name: "Task will be added · Undo" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("note-review.png") });

  await dialog.getByRole("button", { name: "Save 2 records" }).click();
  await expect(dialog.getByRole("heading", { name: "Saved 2 records" })).toBeVisible();
  await expect(dialog.getByText("Ticked off 1 task", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Added 1 task", { exact: true })).toBeVisible();
  const tasks = dialog.getByRole("region", { name: "Care tasks" });
  await expect(tasks.getByRole("listitem")).toHaveText([/^✓Water Front gardenwas due/, /^\+Fertilize Front gardennew · due/]);

  // One save: the records, the finished task, and the new task reach the server together.
  await expect.poll(async () => {
    const workspace = await remote(page);
    const [frontGarden, backGarden] = ["front", "back"].map((id) => workspace.gardens.find((garden) => garden.id === id)!);
    return {
      frontTasks: frontGarden.careTasks.map((task) => [task.type, task.dueDate, task.note]),
      backTasks: backGarden.careTasks.map((task) => task.id),
      frontEvents: frontGarden.careEvents.filter((event) => event.date === today).map((event) => event.type),
      backEvents: backGarden.careEvents.filter((event) => event.date === today).map((event) => [event.type, event.pruneDetail]),
    };
  }).toEqual({
    frontTasks: [["fertilizing", tomorrow, "Will feed the front tomorrow."]],
    backTasks: ["back-repeat"],
    frontEvents: ["watering"],
    backEvents: [["pruning", "Side shoots"]],
  });

  // Closing keeps the result on the home card until the gardener writes another note.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card.getByText("Saved 2 records", { exact: true })).toBeVisible();
  await expect(card.getByText("Ticked off 1 task · Added 1 task", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Write another note" })).toBeFocused();

  // Care: the overdue task is done today, the untouched one is still to do, and the new one is upcoming.
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Care" }).click();
  await expect(page).toHaveURL(/\/care$/);
  const todo = page.getByRole("list", { name: /^To do/ });
  await expect(todo.getByText("Front task", { exact: true })).toHaveCount(0);
  await expect(todo.getByText("Back repeat", { exact: true })).toBeVisible();
  const done = page.getByRole("list", { name: /^Done today/ });
  await expect(done.getByText("Water Front garden", { exact: true })).toBeVisible();
  await expect(done.getByText("Prune Back garden", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Upcoming" }).getByRole("button", { name: "Fertilize Front garden" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Front garden" }).getByRole("button", { name: "Fertilize whole garden" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("note-care.png"), fullPage: true });

  // History: both records sit under Today, with the note's own words.
  await page.getByRole("link", { name: "History" }).click();
  const todayLog = page.getByRole("region", { name: /^Today/ });
  await expect(todayLog.getByText("Watered Front garden", { exact: true })).toBeVisible();
  await expect(todayLog.getByText("Pruned Back garden", { exact: true })).toBeVisible();
  await expect(todayLog.getByText("Watered the front garden.", { exact: true })).toBeVisible();
  await expect(todayLog.getByText("Pruned side shoots in the back.", { exact: true })).toBeVisible();
});

/** Pixels of the focused control hidden under the note's sticky footer. */
const coveredByFooter = (page: Page) => page.evaluate(() => {
  const active = document.activeElement!;
  const foot = document.querySelector("dialog[open] [data-note-foot]")!;
  if (foot.contains(active)) return 0;
  const a = active.getBoundingClientRect();
  const f = foot.getBoundingClientRect();
  return Math.max(0, Math.min(a.bottom, f.bottom) - Math.max(a.top, f.top));
});

for (const size of [{ width: 390, height: 844 }, { width: 720, height: 450 }]) {
  test(`the review works by keyboard and the footer never covers focus at ${size.width}px`, async ({ page }) => {
    await page.setViewportSize(size);
    await seedNote(page, { backDate: null });
    const card = page.getByRole("region", { name: "AI Garden Notes" });
    await card.getByLabel("Quick garden note").fill(NOTE);
    await page.keyboard.press("Tab");
    await expect(card.getByRole("button", { name: "Split into records" })).toBeFocused();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Garden Note" });
    await expect(dialog.getByRole("heading", { name: "2 records across 2 gardens" })).toBeFocused();

    // Tab through every review control to the footer's Save button.
    const save = dialog.getByRole("button", { name: "Save 2 records" });
    for (let step = 0; step < 20 && !(await save.evaluate((node) => node === document.activeElement)); step++) {
      await page.keyboard.press("Tab");
      expect(await coveredByFooter(page), `step ${step + 1}`).toBeLessThanOrEqual(1);
    }
    await expect(save).toBeFocused();

    await dialog.getByRole("button", { name: "Set a date" }).focus();
    await page.keyboard.press("Enter");
    const date = dialog.getByRole("article", { name: "Draft 2" }).getByLabel("Date", { exact: true });
    await expect(date).toBeFocused();
    await date.fill(todayDate());
    await dialog.getByRole("button", { name: /^Add as a task for/ }).focus();
    await page.keyboard.press("Space");
    await expect(dialog.getByRole("button", { name: "Task will be added · Undo" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("button", { name: "Continue review" })).toBeFocused();
    await page.keyboard.press("Enter");
    await dialog.getByRole("button", { name: "Save 2 records" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: "Saved 2 records" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(card.getByRole("button", { name: "Write another note" })).toBeFocused();

    // The saved card's two actions wrap inside the card at the narrowest phone width.
    await page.setViewportSize({ width: 320, height: 640 });
    const fits = await card.evaluate((node) => {
      const box = node.getBoundingClientRect();
      return [...node.querySelectorAll("a, button")].every((item) => item.getBoundingClientRect().right <= box.right + 1);
    });
    expect(fits).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}
