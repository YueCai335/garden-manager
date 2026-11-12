import { expect, test } from "@playwright/test";

test("invalid garden properties keep input, describe each error, and focus the first field", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Load demo garden" }).click();
  await page.getByRole("link", { name: "Open Demo Garden" }).click();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  const name = page.getByLabel("Garden name", { exact: true });
  await name.fill("   ");
  const width = page.getByLabel("Garden width (m)");
  await width.fill("-1");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(width).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveValue("   ");
  await expect(page.getByText("Enter garden name.", { exact: true })).toBeVisible();
  await name.fill("Valid garden");
  await width.fill("6");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit garden details" }).click();
  await expect(name).toHaveValue("Valid garden");
  await expect(width).toHaveValue("6");
});
