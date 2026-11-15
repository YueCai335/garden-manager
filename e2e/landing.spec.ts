import { expect, test, type Page } from "@playwright/test";
import { workspaceHome } from "./workspace";

const hero = (page: Page) => page.locator("#landing-content section").first().locator("[data-render]");
const footer = (page: Page) => page.getByRole("contentinfo").locator("[data-render]");

test("the landing page loads without the API and every entry point opens the app", async ({ page }) => {
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
  expect(apiRequests).toEqual([]);

  await page.getByRole("banner").getByRole("link", { name: "Open app" }).click();
  await expect(page).toHaveURL(workspaceHome);
  // The app frame: its Gardens heading shows at every width (the phone width folds the navigation into Menu).
  await expect(page.getByRole("heading", { name: "Gardens", level: 1 })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(workspaceHome);

  await page.goto("/");
  const features = page.getByRole("region", { name: "Features" });
  await features.getByRole("link", { name: "Try it" }).first().click();
  await expect(page).toHaveURL(workspaceHome);

  await page.goto("/");
  await features.getByRole("link", { name: "Try it" }).last().click();
  await expect(page).toHaveURL(/\/notes$/);

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
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/landing\/og\.jpg$/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /care records/);
  const og = await page.request.get("/landing/og.jpg");
  expect(og.ok()).toBe(true);

  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "AI Note" }).click();
  await expect(page).toHaveURL(/#ai-note$/);
  await expect(page.getByRole("heading", { name: "Write one note, get reviewed records" })).toBeInViewport();
});
