import { expect, test, type Page } from "@playwright/test";
import { addDays, createSampleGardenWorkspace, todayDate } from "../src/lib/gardenWorkspace";
import { openWorkspace } from "./workspace";

/**
 * ADR-0073 S5: screenshots every L1 page for review, and checks that the pages use the
 * hue-free neutrals. Screenshots land in this test's output folder under test-results/.
 */

/** The only coloured values a page may use; every other colour must be a neutral grey (channel spread ≤ 4, as in #5F5F63). */
const allowedHues = new Set([
  "31,66,48", // content green #1F4230
  "40,82,57", // content green hover #285239
  "23,51,34", // heading green #173322
  "38,74,51", // app bar #264A33
  "11,26,17", // app bar active text #0B1A11
  "180,35,24", "255,241,240", // error and its surface
  "138,75,8", "255,247,232", // warning and its surface
  "20,40,29", "14,29,20", // textured band base and the ink on its white buttons (ADR-0080, ADR-0081)
  "214,255,92", // lime: today's care progress only
  "255,201,194", // error text on a dark band
  "25,91,112", "219,238,244", // watering chip
  "128,91,23", "247,231,191", // fertilizing chip
]);

async function huedColours(page: Page) {
  return page.evaluate((allowed) => {
    const found = new Set<string>();
    const properties = ["color", "background-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"] as const;
    for (const element of document.querySelectorAll<HTMLElement>("body *")) {
      // Plant colour dots repeat the plan's own plant palette (ADR-0076), like the canvas.
      if (element.closest("canvas, svg, nextjs-portal, [data-plant-swatch]")) continue;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") continue;
      for (const property of properties) {
        if (property.startsWith("border") && style.getPropertyValue(property.replace("-color", "-width")) === "0px") continue;
        const match = style.getPropertyValue(property).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (!match) continue;
        const [r, g, b] = match.slice(1, 4).map(Number);
        const alpha = match[4] === undefined ? 1 : Number(match[4]);
        if (alpha < 0.3 || Math.max(r, g, b) - Math.min(r, g, b) <= 4) continue;
        const key = `${r},${g},${b}`;
        if (!allowed.includes(key)) found.add(`${key} (${property} on ${element.tagName.toLowerCase()}.${element.className})`);
      }
    }
    return [...found];
  }, [...allowedHues]);
}

const pages = [
  { path: "/gardens", heading: "Gardens" },
  { path: "/care", heading: "Care" },
  { path: "/season", heading: /^Next Season/ },
  { path: "/notes", heading: "AI Garden Note" },
  { path: "/doctor", heading: "Plant Doctor" },
  { path: "/guide", heading: "Plant Guide" },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/ai/**", (route) => route.abort());
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal { display: none !important; }";
      document.head.append(style);
    });
  });
  const workspace = createSampleGardenWorkspace();
  const today = todayDate();
  workspace.careTasks = [-2, 0, 3].map((days) => ({ id: `review-${days}`, type: days ? "watering" : "fertilizing", dueDate: addDays(today, days), targetScope: "all-gardens", note: "" }));
  await page.route("**/workspaces/app-pages-review", (route) => route.fulfill({ json: { ...workspace, workspaceId: "app-pages-review", revision: 0 } }));
  await page.addInitScript(() => localStorage.setItem("sun-aware-garden-planner:server-workspace-id:v1", "app-pages-review"));
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`every L1 page uses the neutral app look at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    await openWorkspace(page);
    await expect(page.getByRole("region", { name: "Care today" })).toBeVisible();
    for (const { path, heading } of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: heading, exact: typeof heading === "string" })).toBeVisible();
      await expect(page.getByText("All changes saved", { exact: true }).first()).toBeAttached();
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(244, 244, 243)");
      expect(await huedColours(page), `${path} uses a colour outside the ADR-0073 palette`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const name = path.slice(1);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
      await testInfo.attach(`${name}-${width}`, { path: testInfo.outputPath(`${name}-${width}.png`), contentType: "image/png" });
    }

    // Forms and dialogs: the Garden Note dialog opened from the header.
    await page.goto("/care");
    await page.getByRole("banner").getByRole("button", { name: "Note", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await huedColours(page)).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`note-dialog-${width}.png`) });
  });
}
