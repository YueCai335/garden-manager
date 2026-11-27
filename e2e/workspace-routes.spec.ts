import { expect, test } from "@playwright/test";
import { goToLevel } from "./areaHelpers";
import { openWorkspace, workspaceHome } from "./workspace";

test("deep links, browser history, and missing entities keep explicit garden context", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  // The area's name is edited on the Planting areas level, which the address records (ADR-0075).
  await page.getByRole("navigation", { name: "Garden Plan levels" }).getByRole("button", { name: "Planting areas", exact: true }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan\?level=areas$/);
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await expect(page).toHaveURL(/\?level=areas&area=demo-raised-bed$/);
  // A blank name cannot apply, so it stays as a draft across history navigation.
  await page.getByLabel("Planting-area name").fill("");
  await page.getByRole("link", { name: "Next Season", exact: true }).click();
  await expect(page).toHaveURL(/\/season$/);
  await page.goBack();
  await expect(page.getByLabel("Planting-area name")).toHaveValue("");
  await page.goForward();
  await expect(page).toHaveURL(/\/season$/);
  await page.goBack();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.goto("/care?view=history&location=demo-garden");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.goto("/season?garden=demo-garden");
  await expect(page.getByRole("heading", { level: 1, name: "Next Season" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
  await page.goto("/gardens/demo-garden/plan?area=missing");
  await expect(page.getByRole("alert").filter({ hasText: "Planting area not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to plan" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  await page.goto("/gardens/missing/plan");
  await expect(page.getByRole("heading", { name: "Garden not found in this workspace" })).toBeVisible();
});

test("old garden Care and Next Season links land on the filtered modules, and Back skips them", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();

  // The server answers the old URL with a 307 before any page renders, so it never becomes a history entry.
  const response = await page.goto("/gardens/demo-garden/care?view=history");
  const redirected = response?.request().redirectedFrom();
  expect(redirected?.url()).toMatch(/\/gardens\/demo-garden\/care\?view=history$/);
  expect((await redirected?.response())?.status()).toBe(307);
  await expect(page).toHaveURL(/\/care\?view=history&location=demo-garden$/);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter by garden" }).getByRole("button", { name: "Demo Garden" })).toHaveAttribute("aria-pressed", "true");
  // Care is an L1 module: the header marks it, and there is no garden breadcrumb.
  await expect(page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Care", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${workspaceHome}$`));

  await page.goto("/gardens/demo-garden/care");
  await expect(page).toHaveURL(/\/care\?location=demo-garden$/);
  // Tasks has no Location filter; the link lands on the garden's card (ADR-0080 D6).
  await expect(page.getByRole("article", { name: "Demo Garden" })).toHaveAttribute("data-highlight", "true");

  await page.goto("/gardens/demo-garden/season");
  await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
  // One garden at a time: the switch marks the garden from the URL (ADR-0082).
  const switcher = page.getByRole("navigation", { name: "Garden" });
  await expect(switcher.getByRole("link", { name: /^Demo Garden, / })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: /rotation sheet for Demo Garden$/ })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/care\?location=demo-garden$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
  // Without ?garden= the page shows the first garden and keeps the address.
  await page.goto("/season");
  await expect(page).toHaveURL(/\/season$/);
  await expect(switcher.getByRole("link", { name: /^Demo Garden, / })).toHaveAttribute("aria-current", "page");
});

test("mobile navigation preserves a note across routes without a model request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let modelRequests = 0;
  page.on("request", (request) => { if (request.url().includes("/ai/care-note-draft")) modelRequests += 1; });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  // Wait for batch drafting so "+ Note" opens the same session the Overview quick note shows (ADR-0085).
  await expect(page.getByRole("button", { name: "Split into records" })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: "Note", exact: true }).click();
  await page.getByLabel("Care note").fill("Watered the front garden today");
  await page.keyboard.press("Escape");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Next Season", exact: true }).click();
  await expect(page).toHaveURL("/season");
  // "+ Note" stays outside Menu on a phone and opens the same note session from any page (ADR-0073).
  const headerNote = page.getByRole("banner").getByRole("button", { name: "Note", exact: true });
  await headerNote.click();
  await expect(page.getByRole("dialog", { name: "Garden Note" }).getByLabel("Care note")).toHaveValue("Watered the front garden today");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Garden Note" })).toHaveCount(0);
  await expect(headerNote).toBeFocused();
  await menu.click();
  await page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Gardens", exact: true }).click();
  await expect(page).toHaveURL(workspaceHome);
  await expect(page.getByRole("textbox", { name: "Quick garden note" })).toHaveValue("Watered the front garden today");
  await page.getByRole("banner").getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Garden Note" }).getByLabel("Care note")).toHaveValue("Watered the front garden today");
  expect(modelRequests).toBe(0);
});

test("garden pages show one set of modules, a breadcrumb, and All gardens; the header works by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  // The app bar stays the ADR-0073 deep green under its texture, never black.
  await expect(page.getByRole("banner")).toHaveCSS("background-color", "rgb(38, 74, 51)");
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  await expect(page.getByRole("navigation", { name: "Garden sections" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Care", exact: true })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Next Season", exact: true })).toHaveCount(1);
  const breadcrumb = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(breadcrumb.getByText("Demo Garden", { exact: true })).toHaveAttribute("aria-current", "page");

  // L3 adds the area; the garden becomes the way back to the whole plan.
  await goToLevel(page, "Plants");
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await expect(breadcrumb.getByText("Sample raised bed", { exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: test.info().outputPath("garden-area-1440.png") });
  await breadcrumb.getByRole("link", { name: "Demo Garden", exact: true }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);

  // Keyboard: the brand, the three modules in order, then "+ Note", whose dialog returns focus on Escape.
  await page.getByRole("banner").getByRole("link", { name: "Garden Manager" }).focus();
  const modules = page.getByRole("navigation", { name: "Workspace sections" });
  for (const name of ["Gardens", "Care", "Next Season"]) {
    await page.keyboard.press("Tab");
    await expect(modules.getByRole("link", { name, exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  const note = page.getByRole("banner").getByRole("button", { name: "Note", exact: true });
  await expect(note).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Garden Note" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Garden Note" })).toHaveCount(0);
  await expect(note).toBeFocused();

  await page.getByRole("link", { name: "All gardens", exact: true }).click();
  await expect(page).toHaveURL(workspaceHome);
  await expect(page.getByRole("heading", { name: "Gardens", level: 1 })).toBeVisible();
});

test("the full header row fits without overlap from just above the Menu breakpoint upward", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);
  // 1024 is the first width without Menu; 1279 is the last width of the compact header tier.
  for (const width of [1024, 1100, 1279, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
    // The header's items in order: brand, each module, "+ Note", and the saving status.
    const boxes = await page.getByRole("banner").evaluate((header) => {
      const items = [...header.querySelectorAll("a, nav span, button, summary, [role=status]")]
        // A status inside the summary is measured through its summary, which also holds the chevron.
        .filter((item) => item.getClientRects().length > 0 && !(item.matches("[role=status]") && item.closest("summary")));
      return items.map((item) => {
        const { left, right, top, bottom } = item.getBoundingClientRect();
        return { label: item.textContent?.trim() || item.tagName, left, right, top, bottom };
      });
    });
    expect(boxes.map((box) => box.label)).toEqual(["Garden Manager", "Gardens", "Care", "Next Season", "+ Note", "All changes saved"]);
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index].left, `${boxes[index - 1].label} overlaps ${boxes[index].label} at ${width}px`).toBeGreaterThanOrEqual(boxes[index - 1].right);
      expect(boxes[index].top, `${boxes[index].label} wraps to a second row at ${width}px`).toBeLessThan(boxes[0].bottom);
    }
    expect(boxes.at(-1)!.right, `the header clips at ${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`header-${width}.png`), clip: { x: 0, y: 0, width, height: 80 } });
  }
});
