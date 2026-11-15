import { expect, test } from "@playwright/test";
import { openWorkspace } from "./workspace";

test("invalid garden properties keep input, describe each error, and focus the first field", async ({ page }) => {
  await openWorkspace(page);
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  const name = page.getByLabel("Garden name", { exact: true });
  await name.fill("   ");
  const width = page.getByLabel("Garden width (m)");
  await width.fill("-1");
  // Enter applies the fields; invalid values stay unapplied and focus moves to the first error.
  await width.press("Enter");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveValue("   ");
  await expect(page.getByText("Enter garden name.", { exact: true })).toBeVisible();
  await name.fill("Valid garden");
  // The demo areas reach 8.5 m across, so a 6 m garden would cut them off (ADR-0072, G6).
  await width.fill("6");
  await width.press("Enter");
  await expect(page.getByText("Make the garden at least 8.5 m wide to hold its planting areas.", { exact: true })).toBeVisible();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await width.fill("9");
  await width.press("Enter");
  await expect(width).toHaveAttribute("aria-invalid", "false");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("region", { name: "Garden properties" })).toContainText("Valid garden · 9 × 6 m");
  // Wait for the server copy before reloading, so the reload reads what was saved.
  const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
  await expect.poll(async () => {
    const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
    const garden = (await response.json()).gardens[0];
    return `${garden.name} ${garden.plan.widthMeters}`;
  }).toBe("Valid garden 9");
  await page.reload();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  await expect(name).toHaveValue("Valid garden");
  await expect(width).toHaveValue("9");
});
