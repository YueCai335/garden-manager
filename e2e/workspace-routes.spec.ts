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
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.goto("/care?view=history&location=demo-garden");
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await page.goto("/season?garden=demo-garden");
  await expect(page.getByRole("heading", { name: /Next Season ·/ })).toBeVisible();
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
  const location = page.getByRole("combobox", { name: "Location", exact: true });

  // The server answers the old URL with a 307 before any page renders, so it never becomes a history entry.
  const response = await page.goto("/gardens/demo-garden/care?view=history");
  const redirected = response?.request().redirectedFrom();
  expect(redirected?.url()).toMatch(/\/gardens\/demo-garden\/care\?view=history$/);
  expect((await redirected?.response())?.status()).toBe(307);
  await expect(page).toHaveURL(/\/care\?view=history&location=demo-garden$/);
  await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
  await expect(location).toHaveValue("demo-garden");
  // Care is an L1 module: the header marks it, and there is no garden breadcrumb.
  await expect(page.getByRole("navigation", { name: "Workspace sections" }).getByRole("link", { name: "Care", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${workspaceHome}$`));

  await page.goto("/gardens/demo-garden/care");
  await expect(page).toHaveURL(/\/care\?location=demo-garden$/);
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();
  await expect(location).toHaveValue("demo-garden");

  await page.goto("/gardens/demo-garden/season");
  await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
  const plans = page.getByRole("region", { name: "Planting plans" });
  await expect(plans.getByRole("combobox", { name: "Garden", exact: true })).toHaveValue("demo-garden");
  await expect(plans.getByText("Only Demo Garden ·")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/care\?location=demo-garden$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/season\?garden=demo-garden$/);
  await plans.getByRole("link", { name: "Show all", exact: true }).click();
  await expect(page).toHaveURL(/\/season$/);
  await expect(plans.getByRole("combobox", { name: "Garden", exact: true })).toHaveValue("all");
  await expect(plans.getByText("Only Demo Garden ·")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Open note editor" }).click();
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
  await page.getByRole("link", { name: "Edit Sample raised bed" }).click();
  await expect(breadcrumb.getByText("Sample raised bed", { exact: true })).toHaveAttribute("aria-current", "page");
  await page.screenshot({ path: test.info().outputPath("garden-area-1440.png") });
  await breadcrumb.getByRole("link", { name: "Demo Garden", exact: true }).click();
  await expect(page).toHaveURL(/\/gardens\/demo-garden\/plan$/);

  // Keyboard: the brand, the five modules in order, then "+ Note", whose dialog returns focus on Escape.
  await page.getByRole("banner").getByRole("link", { name: "Garden Manager" }).focus();
  const modules = page.getByRole("navigation", { name: "Workspace sections" });
  for (const name of ["Gardens", "Care", "Next Season", "Plant Doctor", "Plant Guide"]) {
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
    // The header's items in order: brand, each module, the divider, "+ Note", and the saving status.
    const boxes = await page.getByRole("banner").evaluate((header) => {
      const items = [...header.querySelectorAll("a, nav span, button, summary, [role=status]")]
        // A status inside the summary is measured through its summary, which also holds the chevron.
        .filter((item) => item.getClientRects().length > 0 && !(item.matches("[role=status]") && item.closest("summary")));
      return items.map((item) => {
        const { left, right, top, bottom } = item.getBoundingClientRect();
        return { label: item.textContent?.trim() || item.tagName, left, right, top, bottom };
      });
    });
    expect(boxes.map((box) => box.label)).toEqual(["Garden Manager", "Gardens", "Care", "Next Season", "SPAN", "Plant Doctor", "Plant Guide", "+ Note", "All changes saved"]);
    for (let index = 1; index < boxes.length; index += 1) {
      expect(boxes[index].left, `${boxes[index - 1].label} overlaps ${boxes[index].label} at ${width}px`).toBeGreaterThanOrEqual(boxes[index - 1].right);
      expect(boxes[index].top, `${boxes[index].label} wraps to a second row at ${width}px`).toBeLessThan(boxes[0].bottom);
    }
    expect(boxes.at(-1)!.right, `the header clips at ${width}px`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`header-${width}.png`), clip: { x: 0, y: 0, width, height: 80 } });
  }
});
