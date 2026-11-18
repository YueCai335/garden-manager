import { expect, test, type Page } from "@playwright/test";
import { workspaceHome } from "./workspace";

const hero = (page: Page) => page.locator("#landing-content section").first().locator("[data-render]");
const footer = (page: Page) => page.getByRole("contentinfo").locator("[data-render]");

test("the landing page waits on no API request and every entry point opens the app", async ({ page }) => {
  const apiRequests: string[] = [];
  page.on("request", (request) => { if (request.url().startsWith("http://127.0.0.1:8100")) apiRequests.push(request.url()); });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The landing frame has its own header, not the workspace navigation.
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.waitForLoadState("networkidle");
  // The only API traffic is the fire-and-forget prewarm that wakes the server (ADR-0079).
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(new Set(apiRequests)).toEqual(new Set(["http://127.0.0.1:8100/health"]));

  await page.getByRole("banner").getByRole("link", { name: "Open app" }).click();
  await expect(page).toHaveURL(workspaceHome);
  // The app frame: its Gardens heading shows at every width (the phone width folds the navigation into Menu).
  await expect(page.getByRole("heading", { name: "Gardens", level: 1 })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(workspaceHome);

  // Each feature section opens its own app page; Plant AI opens both assistants.
  await page.goto("/");
  const features = page.getByRole("region", { name: "Features" });
  const tries = features.getByRole("link", { name: /^Try / });
  expect(await tries.evaluateAll((links) => links.map((link) => `${link.textContent} ${link.getAttribute("href")}`))).toEqual([
    "Try it /gardens", "Try it /notes", "Try Plant Doctor /doctor", "Try Plant Guide /guide", "Try it /season",
  ]);
  await features.getByRole("link", { name: "Try it" }).first().click();
  await expect(page).toHaveURL(workspaceHome);

  await page.goto("/");
  await features.getByRole("link", { name: "Try it" }).last().click();
  await expect(page).toHaveURL(/\/season$/);

  // Inside the app, the brand link returns to the landing page, and "Open app" leads back in.
  await page.getByRole("banner").getByRole("link", { name: "Garden Manager" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");
  await page.getByRole("banner").getByRole("link", { name: "Open app" }).click();
  await expect(page).toHaveURL(workspaceHome);
});

test("the hero and footer render the leaf photos with WebGL and never download the stills", async ({ page }) => {
  const images: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/landing/")) images.push(new URL(request.url()).pathname); });
  // A short window, so the footer starts well below the 300 px look-ahead.
  await page.setViewportSize({ width: 1440, height: 640 });
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-render", "webgl");
  await expect(hero(page).locator("canvas")).toHaveCSS("opacity", "1");
  // The footer photo waits until the footer comes near the viewport.
  await expect(footer(page)).toHaveAttribute("data-render", "loading");
  expect(images).not.toContain("/landing/footer-veins.webp");

  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await expect(footer(page)).toHaveAttribute("data-render", "webgl");
  // Lime circuit nodes sit on the strongest vein points, and the one nearest the pointer glows brightest.
  const nodes = footer(page).locator("svg g");
  await expect(nodes.first()).toBeAttached();
  const box = (await footer(page).boundingBox())!;
  const first = (await nodes.first().boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await expect.poll(async () => Number(await nodes.first().evaluate((node) => (node as SVGElement).style.opacity))).toBeGreaterThan(0.9);
  expect(first.y).toBeGreaterThanOrEqual(box.y - first.height);

  expect(images).toEqual(expect.arrayContaining(["/landing/hero-ridges.webp", "/landing/footer-veins.webp"]));
  expect(images.filter((path) => path.includes("still"))).toEqual([]);
});

test("without WebGL2 the bands show the pre-rendered stills, not a blank band", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === "webgl2" ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  const stills = Promise.all(["hero-still", "footer-still"].map((name) => page.waitForResponse((response) => response.url().endsWith(`/landing/${name}.webp`) && response.ok())));
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-render", "still");
  await expect(footer(page)).toHaveAttribute("data-render", "still");
  await expect(hero(page).locator("canvas")).toBeHidden();
  await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
  await stills;
});

test("with reduced motion the bands show the stills and the AI Note lines do not animate", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(hero(page)).toHaveAttribute("data-render", "still");
  await expect(footer(page)).toHaveAttribute("data-render", "still");
  await expect(hero(page).locator("canvas")).toBeHidden();
  const background = await hero(page).locator("div").first().evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toContain("/landing/hero-still.webp");
  const animation = await page.getByRole("figure", { name: "AI Note example" }).locator("path").first().evaluate((path) => getComputedStyle(path).animationName);
  expect(animation).toBe("none");
});

test("the landing page has a social preview and in-page section links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/landing\/og\.jpg$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /care records/);
  const og = await page.request.get("/landing/og.jpg");
  expect(og.ok()).toBe(true);

  // The header links follow the season: plan, log, ask, then plan the next season.
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site.getByRole("link")).toHaveText(["Garden Plan", "AI Note", "Plant AI", "Season Planner"]);
  // The links on the textured bands are white at medium weight, so they stay readable.
  await expect(site.getByRole("link", { name: "Garden Plan" })).toHaveCSS("font-weight", "500");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Architecture" })).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Architecture" })).toHaveCSS("font-weight", "500");
  await expect(page.getByRole("banner").getByRole("link", { name: "GitHub" })).toHaveAttribute("href", /github\.com/);

  await site.getByRole("link", { name: "AI Note" }).click();
  await expect(page).toHaveURL(/#ai-note$/);
  await expect(page.getByRole("heading", { name: "Write one note, get reviewed records" })).toBeInViewport();

  // The header stays in the window, turns into the glass bar, never covers the section heading, and marks the section.
  await site.getByRole("link", { name: "Plant AI" }).click();
  await expect(page).toHaveURL(/#plant-ai$/);
  const header = (await page.getByRole("banner").boundingBox())!;
  const heading = (await page.getByRole("heading", { name: "Ask about a sick plant or a growing question" }).boundingBox())!;
  expect(header.y).toBeGreaterThanOrEqual(0);
  expect(heading.y).toBeGreaterThanOrEqual(header.y + header.height);
  await expect(page.getByRole("banner")).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  // The bar is graded by the hero's own shader, not a separate flat color.
  await expect(page.getByRole("banner").locator("[data-render]")).toHaveAttribute("data-render", "webgl");
  await expect(site.getByRole("link", { name: "Plant AI" })).toHaveAttribute("aria-current", "location");
  await expect(site.locator("[aria-current]")).toHaveCount(1);
  // The section in view is a solid white pill; hovering another link gives it a translucent pill.
  await expect(site.getByRole("link", { name: "Plant AI" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await site.getByRole("link", { name: "Garden Plan" }).hover();
  await expect(site.getByRole("link", { name: "Garden Plan" })).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const openApp = page.getByRole("banner").getByRole("link", { name: "Open app" });
  await openApp.hover();
  await expect(openApp).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const architecture = page.getByRole("contentinfo").getByRole("link", { name: "Architecture" });
  await architecture.hover();
  await expect(architecture).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("on a phone the landing header keeps the brand, GitHub, and Open app on one row", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const items = await page.getByRole("banner").locator("a").evaluateAll((links) => links
    .filter((link) => link.getClientRects().length > 0)
    .map((link) => { const box = link.getBoundingClientRect(); return { left: box.left, right: box.right, height: box.height }; }));
  expect(items).toHaveLength(3);
  for (let index = 1; index < items.length; index += 1) expect(items[index].left).toBeGreaterThanOrEqual(items[index - 1].right);
  expect(items.at(-1)!.right).toBeLessThanOrEqual(360);
  // The brand stays on one line.
  expect(items[0].height).toBeLessThan(40);
});
