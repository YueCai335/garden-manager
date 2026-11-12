import { expect, test } from "@playwright/test";
import { addDays, createDemoGardenWorkspace, createGarden, todayDate } from "../src/lib/gardenWorkspace";

for (const [width, height, columns] of [[320, 844, 1], [390, 844, 2], [768, 1024, 2], [1024, 768, 2], [1440, 900, 3]]) {
  test(`overview shows garden maps and task groups at ${width}px`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await page.route("**/ai/**", (route) => route.abort());
    await page.goto("/");
    const note = page.getByRole("region", { name: "AI Garden Notes" });
    await expect(note).toBeInViewport();
    await expect(page.getByRole("banner").getByRole("textbox", { name: "Quick garden note" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create garden" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`home-empty-${width}.png`) });
    await page.getByRole("button", { name: "Load demo garden" }).click();
    const demo = page.getByRole("link", { name: "Open Demo Garden" });
    await expect(demo.locator("canvas").first()).toBeVisible();
    await expect(note).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`home-one-${width}.png`), fullPage: true });

    const workspace = createDemoGardenWorkspace();
    const front = { ...workspace.gardens[0], id: "front", name: "Front garden" };
    const back = { ...createGarden("Back garden with vegetables and herbs"), growingAreas: [{ ...front.growingAreas[0], layout: undefined }] };
    workspace.gardens = [front, back, createGarden("LongGardenName".repeat(12))];
    workspace.selectedGardenId = front.id;
    const today = todayDate();
    workspace.careTasks = [-1, 0, 7, 8].map((days) => ({ id: `global-${days}`, type: "watering", dueDate: addDays(today, days), targetScope: "all-gardens", note: "" }));
    await page.route("**/workspaces/home-visual", (route) => route.fulfill({ json: { ...workspace, workspaceId: "home-visual", revision: 0 } }));
    await page.evaluate(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "home-visual"));
    await page.reload();
    const gallery = page.getByRole("region", { name: /Your gardens/ });
    const cards = gallery.getByRole("link", { name: /^Open / });
    const frontCard = gallery.getByRole("link", { name: "Open Front garden", exact: true });
    await expect(frontCard).toBeVisible();
    const thumbnail = frontCard.locator("canvas").first();
    await expect(thumbnail).toBeVisible();
    await expect.poll(() => thumbnail.evaluate((canvas) => {
      const card = canvas.closest("a");
      return !!card && Math.abs(canvas.getBoundingClientRect().width - card.clientWidth) <= 1 && canvas.getBoundingClientRect().height <= 148;
    })).toBe(true);
    await expect(frontCard).toHaveAccessibleDescription(/Growing now:/);
    await expect(gallery.getByText(/1 needs layout setup/)).toBeVisible();
    await expect(note).toBeInViewport();
    const tasks = page.getByRole("complementary", { name: "Care tasks" });
    const noteBox = (await note.boundingBox())!;
    const taskBox = (await tasks.boundingBox())!;
    expect(noteBox.height).toBeGreaterThanOrEqual(80);
    expect(taskBox.y - noteBox.y - noteBox.height).toBeCloseTo(12, 0);
    await expect(tasks.getByText("All gardens", { exact: true })).toHaveCount(3);
    await expect(tasks.locator("dd")).toHaveText(["1", "1", "1"]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await cards.evaluateAll((elements) => elements.map((element) => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })));
    expect(new Set(boxes.map((box) => box.x)).size).toBe(columns);
    expect(new Set(boxes.map((box) => box.y)).size).toBe(Math.ceil(3 / columns));
    expect(await cards.locator("button, a").count()).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`home-many-${width}.png`), fullPage: true });

    if (width <= 390) {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      await menu.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("link", { name: "Overview", exact: true })).toBeFocused();
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
  const workspace = createDemoGardenWorkspace();
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
  await page.goto("/");
  const gallery = page.getByRole("region", { name: "Your gardens (8)" });
  const cards = gallery.getByRole("link", { name: /^Open / });
  await expect(cards).toHaveCount(8);
  await expect(gallery.getByRole("link", { name: `Open ${chineseName}`, exact: true })).toHaveAccessibleDescription(/Growing now:/);
  const lastCard = gallery.getByRole("link", { name: `Open ${englishName}`, exact: true });
  await lastCard.scrollIntoViewIfNeeded();
  await expect(lastCard).toBeInViewport();
  await expect(page.getByRole("complementary", { name: "Care tasks" }).getByText(englishName, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("eight-gardens-320.png"), fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => cards.evaluateAll((elements) => new Set(elements.map((element) => element.getBoundingClientRect().x)).size)).toBe(3);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(cards.nth(5)).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("eight-gardens-1440.png"), fullPage: true });
  await lastCard.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: englishName, exact: true })).toBeFocused();
});

test("note dialog generates only on request and reopens the same draft", async ({ page }) => {
  const workspace = createDemoGardenWorkspace();
  let requests = 0;
  await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: false } }));
  await page.route("**/ai/**", async (route) => {
    requests += 1;
    await route.fulfill({ json: { kind: "completed", type: "watering", date: todayDate(), note: "Watered today", targetScope: "garden", reviewNotes: [] } });
  });
  await page.route("**/workspaces/home-note", (route) => route.fulfill({ json: { ...workspace, workspaceId: "home-note", revision: 0 } }));
  await page.addInitScript(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "home-note"));
  await page.goto("/");
  // Without batch drafting the primary Overview button opens the single-record dialog.
  await page.getByRole("button", { name: "Open note editor" }).click();
  const dialog = page.getByRole("dialog", { name: "Garden Note" });
  await expect(dialog.getByRole("heading", { name: "Garden Note", exact: true })).toBeFocused();
  await expect(page).toHaveURL("/");
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
  // Notes start only from Overview (ADR-0069 amendment); the draft survives a trip to another page.
  await page.getByRole("link", { name: "Plant Guide", exact: true }).click();
  await expect(page).toHaveURL("/guide");
  await page.getByRole("link", { name: "Back to gardens", exact: true }).click();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Continue note · 1 draft" }).click();
  await expect(dialog.getByRole("heading", { name: "AI extracted draft" })).toBeVisible();
  await expect(dialog.getByLabel("Care note")).toBeVisible();
  expect(requests).toBe(1);
});
