import type { Page } from "@playwright/test";

/** The app's home. `/` is the landing page, outside the app (ADR-0073). */
export const workspaceHome = "/gardens";

/** Opens the app at its Gardens overview, where every journey starts. */
export async function openWorkspace(page: Page) {
  await page.goto(workspaceHome);
}
