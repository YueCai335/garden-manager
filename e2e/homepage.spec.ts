import { expect, test } from "@playwright/test";
import { addDays, createSampleGardenWorkspace, createGarden, todayDate } from "../src/lib/gardenWorkspace";
import { openWorkspace, workspaceHome } from "./workspace";

// ADR-0081: four columns from 1100 px, two from 700 px, and short single rows on phones.
for (const [width, height, columns] of [[320, 844, 1], [390, 844, 1], [768, 1024, 2], [1024, 768, 2], [1440, 900, 4]]) {
  test(`overview stages the gardens on the band, then Care today and the note at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.route("**/ai/**", (route) => route.abort());
    await openWorkspace(page);
    const note = page.getByRole("region", { name: "AI Garden Notes" });
    await expect(page.getByRole("banner").getByRole("button", { name: "Note", exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("textbox", { name: "Quick garden note" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: "Gardens" })).toBeAttached();
    await expect(page.getByRole("heading", { level: 2, name: "Your gardens" })).toBeVisible();
    await expect(page.getByText("Start with one garden. You can add more later.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create garden" })).toBeVisible();
    await expect(note).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-empty-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Load demo garden" }).click();
    const demo = page.getByRole("link", { name: "Open Demo Garden" });
    await expect(demo.locator("canvas").first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-one-${width}.png`), fullPage: true });

    const workspace = createSampleGardenWorkspace();
    const front = { ...workspace.gardens[0], id: "front", name: "Front garden" };
    const back = { ...createGarden("Back garden with vegetables and herbs"), growingAreas: [{ ...front.growingAreas[0], layout: undefined }] };
    workspace.gardens = [front, back, createGarden("LongGardenName".repeat(12))];
    workspace.selectedGardenId = front.id;
    const today = todayDate();
    workspace.careTasks = [-1, 0, 7, 8].map((days) => ({ id: `global-${days}`, type: "watering", dueDate: addDays(today, days), targetScope: "all-gardens", note: "" }));
    await page.route("**/workspaces/home-visual", (route) => route.fulfill({ json: { ...workspace, workspaceId: "home-visual", revision: 0 } }));
    await page.evaluate(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "home-visual"));
    await page.reload();
    const gallery = page.getByRole("region", { name: "Your gardens" });
    const cards = gallery.getByRole("link", { name: /^Open / });
    const newGarden = gallery.getByRole("link", { name: "New garden" });
    const frontCard = gallery.getByRole("link", { name: "Open Front garden", exact: true });
    await expect(frontCard).toBeVisible();
    await expect(gallery.getByText("3 gardens · 4 planting areas · 1 plant growing")).toBeVisible();
    const thumbnail = frontCard.locator("canvas").first();
    await expect(thumbnail).toBeVisible();
    // The thumbnail fills its plan area: the card's width, or a 124 px square-ish tile on phones.
    await expect.poll(() => thumbnail.evaluate((canvas) => {
      const map = canvas.closest("a")?.firstElementChild;
      return !!map && Math.abs(canvas.getBoundingClientRect().width - map.clientWidth) <= 1;
    })).toBe(true);
    await expect(frontCard).toHaveAccessibleDescription(/3 planting areas · 1 plant/);
    await expect(gallery.getByText(/1 needs a size/)).toBeVisible();

    // The first row of cards stands half on the band: it starts inside the band and ends below it.
    const band = (await gallery.locator(":scope > div").first().boundingBox())!;
    const firstCard = (await frontCard.boundingBox())!;
    expect(firstCard.y).toBeLessThan(band.y + band.height);
    expect(firstCard.y + firstCard.height).toBeGreaterThan(band.y + band.height);
    expect(firstCard.y).toBeGreaterThan(band.y);

    // Below the gardens: Care today, then the note block, side by side from 1100 px.
    const todayCard = page.getByRole("region", { name: "Care today" });
    const todayBox = (await todayCard.boundingBox())!;
    const noteBox = (await note.boundingBox())!;
    const lastCell = (await newGarden.boundingBox())!;
    expect(lastCell.y + lastCell.height).toBeLessThanOrEqual(todayBox.y);
    if (width >= 1100) {
      expect(noteBox.y).toBe(todayBox.y);
      expect(noteBox.height).toBe(todayBox.height);
      expect(noteBox.x).toBeGreaterThan(todayBox.x + todayBox.width);
    } else {
      expect(todayBox.y + todayBox.height).toBeLessThanOrEqual(noteBox.y);
    }
    await expect(todayCard.getByRole("heading", { level: 2, name: "2 things left" })).toBeVisible();
    await expect(todayCard.getByRole("checkbox")).toHaveCount(2);
    await expect(todayCard.getByText("Due yesterday").filter({ visible: true })).toHaveCount(1);
    await expect(todayCard.getByText("0 of 2 done")).toBeVisible();
    await expect(todayCard.getByText(/Coming up|Tomorrow/)).toHaveCount(0);
    await expect(todayCard.getByRole("link", { name: "Open Care" })).toHaveAttribute("href", "/care?view=tasks");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    // The gardens and the dashed New garden card share one grid; New garden is the last cell.
    const cells = [...await cards.all(), newGarden];
    const boxes = await Promise.all(cells.map(async (cell) => (await cell.boundingBox())!));
    expect(new Set(boxes.map((box) => Math.round(box.x))).size).toBe(Math.min(columns, 4));
    expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(Math.ceil(4 / columns));
    expect(await cards.locator("button, a").count()).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`home-many-${width}.png`), fullPage: true });

    // Ticking a row keeps it in place and moves today's progress.
    await todayCard.getByRole("checkbox", { name: "Water all gardens" }).first().click();
    await expect(todayCard.getByRole("checkbox", { name: "Water all gardens" }).first()).toBeChecked();
    await expect(todayCard.getByRole("checkbox", { name: "Water all gardens" }).first()).toBeFocused();
    await expect(todayCard.getByText("1 of 2 done")).toBeVisible();
    await expect(todayCard.getByRole("heading", { level: 2, name: "1 thing left" })).toBeVisible();

    if (width <= 390) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("link", { name: "Gardens", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
    }
    if (width === 1440) {
      await frontCard.focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/gardens\/front\/plan$/);
      await expect(page.getByRole("heading", { name: "Front garden", level: 1 })).toBeFocused();
    }
    expect(errors).toEqual([]);
  });
}

test("eight gardens with long names reflow at 320px and remain reachable", async ({ page }, testInfo) => {
  const workspace = createSampleGardenWorkspace();
  const [demo] = workspace.gardens;
  const chineseName = "后院蔬菜和香草种植区".repeat(8);
  const englishName = "LongKitchenGardenName".repeat(8);
  const first = { ...demo, id: "garden-1", name: chineseName };
  const last = createGarden(englishName);
  last.careTasks = [{ id: "long-location-task", type: "watering", dueDate: todayDate(), targetScope: "garden", note: "" }];
  workspace.gardens = [first, ...Array.from({ length: 6 }, (_, index) => createGarden(`Garden ${index + 2}`)), last];
  workspace.selectedGardenId = first.id;
  await page.route("**/workspaces/home-eight-gardens", (route) => route.fulfill({ json: { ...workspace, workspaceId: "home-eight-gardens", revision: 0 } }));
  await page.addInitScript(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "home-eight-gardens"));

  await page.setViewportSize({ width: 320, height: 844 });
  await openWorkspace(page);
  const gallery = page.getByRole("region", { name: "Your gardens" });
  const cards = gallery.getByRole("link", { name: /^Open / });
  await expect(cards).toHaveCount(8);
  await expect(gallery.getByText(/^8 gardens · /)).toBeVisible();
  await expect(gallery.getByRole("link", { name: `Open ${chineseName}`, exact: true })).toHaveAccessibleDescription(/planting area/);
  const lastCard = gallery.getByRole("link", { name: `Open ${englishName}`, exact: true });
  await expect(lastCard).toHaveAccessibleDescription(/1 to do today/);
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard).toBeInViewport();
  await expect(page.getByRole("region", { name: "Care today" }).getByText(`Water ${englishName}`, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("eight-gardens-320.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => cards.evaluateAll((elements) => new Set(elements.map((element) => element.getBoundingClientRect().x)).size)).toBe(4);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(cards.nth(3)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("eight-gardens-1440.png"), fullPage: true });
  await lastCard.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: englishName, exact: true })).toBeFocused();
});

test("note dialog generates only on request and reopens the same draft", async ({ page }) => {
  const workspace = createSampleGardenWorkspace();
  let requests = 0;
  await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: false } }));
  await page.route("**/ai/**", async (route) => {
    requests += 1;
    await route.fulfill({ json: { kind: "completed", type: "watering", date: todayDate(), note: "Watered today", targetScope: "garden", reviewNotes: [] } });
  });
  await page.route("**/workspaces/home-note", (route) => route.fulfill({ json: { ...workspace, workspaceId: "home-note", revision: 0 } }));
  await page.addInitScript(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "home-note"));
  await openWorkspace(page);
  // Without batch drafting the primary Overview button opens the single-record dialog.
  await page.getByRole("button", { name: "Open note editor" }).click();
  const dialog = page.getByRole("dialog", { name: "Garden Note" });
  await expect(dialog.getByRole("heading", { name: "Garden Note", exact: true })).toBeFocused();
  await expect(page).toHaveURL(workspaceHome);
  await page.getByLabel("Care note").fill("Watered today");
  await page.getByLabel("Garden", { exact: true }).selectOption("demo-garden");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Create draft", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AI extracted draft" })).toBeVisible();
  await page.keyboard.press("Escape");
  const resume = page.getByRole("button", { name: "Continue note · 1 draft" });
  await expect(dialog).toBeHidden();
  await expect(resume).toBeFocused();
  await resume.click();
  await expect(page.getByRole("heading", { name: "AI extracted draft" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  // The draft survives a trip to another page.
  await page.getByRole("link", { name: "Plant Guide", exact: true }).click();
  await expect(page).toHaveURL("/guide");
  await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Gardens", exact: true }).click();
  await expect(page).toHaveURL(workspaceHome);
  await page.getByRole("button", { name: "Continue note · 1 draft" }).click();
  await expect(dialog.getByRole("heading", { name: "AI extracted draft" })).toBeVisible();
  await expect(dialog.getByLabel("Care note")).toBeVisible();
  expect(requests).toBe(1);
});
