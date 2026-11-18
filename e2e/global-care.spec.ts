import { expect, test, type Page } from "@playwright/test";
import { careFixture } from "../src/test/careFixture";
import { addDays, todayDate, type GardenWorkspace } from "../src/lib/gardenWorkspace";

const STORAGE = "sun-aware-garden-planner:garden-workspace:v1";

async function seed(page: Page) {
  const fixture = careFixture();
  // Real storage can require globally unique IDs; colliding IDs are covered by local UI tests.
  fixture.gardens[1].careEvents[0].id = "back-one";
  fixture.gardens[1].careTasks[0].id = "back-repeat";
  await page.route("**/ai/**", (route) => route.abort());
  await page.addInitScript(([key, workspace]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(workspace));
  }, [STORAGE, fixture] as const);
}

async function remote(page: Page) {
  const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
  return await response.json() as GardenWorkspace;
}

for (const width of [390, 1440]) {
  test(`Care History filters with buttons and writes back to the original owner at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await seed(page);
    await page.goto("/care?view=history");
    const strip = page.getByRole("region", { name: "History" });
    const gardenFilter = page.getByRole("group", { name: "Filter by garden" });
    await expect(strip.getByText("6 records", { exact: true })).toBeVisible();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await gardenFilter.getByRole("button", { name: "Back garden" }).click();
    await expect(page).toHaveURL(/\/care\?view=history&location=back$/);
    await expect(strip.getByText("3 records", { exact: true })).toBeVisible();
    const backRecord = page.getByRole("listitem").filter({ has: page.getByText("Back one", { exact: true }) });
    await backRecord.getByRole("button", { name: /^More actions for/ }).click();
    await page.getByRole("menuitem", { name: "Correct record" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit care event" });
    await dialog.getByLabel("Note (optional)").fill("Back corrected from overview");
    await dialog.getByRole("button", { name: "Save care event" }).click();
    await expect.poll(async () => {
      const workspace = await remote(page);
      return [
        workspace.gardens.find((garden) => garden.id === "front")?.careEvents.find((event) => event.id === "same")?.note,
        workspace.gardens.find((garden) => garden.id === "back")?.careEvents.find((event) => event.id === "back-one")?.note,
        workspace.careEvents.length,
      ];
    }).toEqual(["Front one", "Back corrected from overview", 1]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`care-history-${width}.png`), fullPage: true });

    // Tasks: tick the repeating task in its own garden; the next date counts from today.
    await strip.getByRole("link", { name: "Care" }).click();
    await expect(page).toHaveURL(/\/care$/);
    await expect(page.getByRole("combobox", { name: "Location", exact: true })).toHaveCount(0);
    const todo = page.getByRole("list", { name: /^To do/ });
    await todo.getByRole("listitem").filter({ hasText: "Back repeat" }).getByRole("checkbox").click();
    await expect(page.getByRole("list", { name: /^Done today/ }).getByRole("checkbox")).toBeFocused();
    await expect.poll(async () => {
      const workspace = await remote(page);
      return [workspace.gardens.find((garden) => garden.id === "back")!.careTasks[0].dueDate, workspace.gardens.find((garden) => garden.id === "front")!.careTasks[0].dueDate];
    }).toEqual([addDays(todayDate(), 3), "2026-06-01"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`care-board-${width}.png`), fullPage: true });

    // An old garden Care link lands on History filtered to that garden (ADR-0073, phase S3).
    await page.goto("/gardens/back/care?view=history");
    await expect(page).toHaveURL(/\/care\?view=history&location=back$/);
    await expect(gardenFilter.getByRole("button", { name: "Back garden" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Back two", { exact: true })).toBeVisible();
    await expect(page.getByText("Front one", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Every garden", { exact: true })).toHaveCount(0);
  });
}

test("a tick on Care survives a reload and shows in History", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seed(page);
  await page.goto("/care");
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("list", { name: /^To do/ }).getByRole("listitem").filter({ hasText: "Front task" }).getByRole("checkbox").click();
  await expect(page.getByRole("heading", { level: 2, name: "1 thing left today." })).toBeVisible();
  await expect.poll(async () => (await remote(page)).gardens.find((garden) => garden.id === "front")!.careTasks).toHaveLength(0);
  await page.reload();
  const done = page.getByRole("list", { name: /^Done today/ });
  await expect(done.getByText("Water Front garden", { exact: true })).toBeVisible();
  // Earlier ticks are corrected in History, so the circle is no longer a button.
  await expect(done.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("link", { name: "History" }).click();
  const today = page.getByRole("region", { name: /^Today/ });
  await expect(today.getByText("Watered Front garden", { exact: true })).toBeVisible();
  await expect(today.getByText("Front task", { exact: true })).toBeVisible();
});

test("a ?location= link scrolls to that garden's card and highlights it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await seed(page);
  await page.goto("/gardens/back/care");
  await expect(page).toHaveURL(/\/care\?location=back$/);
  const card = page.getByRole("article", { name: "Back garden" });
  await expect(card).toHaveAttribute("data-highlight", "true");
  await expect.poll(async () => card.evaluate((node) => {
    const top = node.getBoundingClientRect().top;
    return top >= 0 && top < innerHeight / 2;
  })).toBe(true);
});
