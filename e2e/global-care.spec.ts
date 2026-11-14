import { expect, test } from "@playwright/test";
import { careFixture } from "../src/test/careFixture";
import type { GardenWorkspace } from "../src/lib/gardenWorkspace";

for (const width of [390, 1440]) {
  test(`global care filters and writes back to the original owner at ${width}px`, async ({ page }, testInfo) => {
    const fixture = careFixture();
    // Real storage can require globally unique IDs; colliding IDs are covered by local UI tests.
    fixture.gardens[1].careEvents[0].id = "back-one";
    fixture.gardens[1].careTasks[0].id = "back-repeat";
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/ai/**", (route) => route.abort());
    await page.addInitScript((workspace) => {
      if (!localStorage.getItem("sun-aware-garden-planner:garden-workspace:v1")) localStorage.setItem("sun-aware-garden-planner:garden-workspace:v1", JSON.stringify(workspace));
    }, fixture);
    await page.goto("/care?view=history");
    const views = page.getByRole("navigation", { name: "Care views" });
    const location = page.getByRole("combobox", { name: "Location", exact: true });
    const tasks = views.getByRole("link", { name: "Tasks", exact: true });
    await expect(views.getByRole("link", { name: "History", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText("6 records", { exact: true })).toBeVisible();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await location.selectOption("back");
    await expect(page.getByText("3 records", { exact: true })).toBeVisible();
    const backRecord = page.getByRole("listitem").filter({ has: page.getByText("Back one", { exact: true }) });
    await backRecord.getByRole("button", { name: "Correct record" }).click();
    await page.getByLabel("Note (optional)").fill("Back corrected from overview");
    await location.selectOption("front");
    await page.getByRole("button", { name: "Save care event" }).click();
    const id = await page.evaluate(() => localStorage.getItem("sun-aware-garden-planner:server-workspace-id:v1"));
    async function remote() {
      const response = await page.request.get(`http://127.0.0.1:8100/workspaces/${id}`);
      return await response.json() as GardenWorkspace;
    }
    await expect.poll(async () => {
      const workspace = await remote();
      return [
        workspace.gardens.find((garden) => garden.id === "front")?.careEvents.find((event) => event.id === "same")?.note,
        workspace.gardens.find((garden) => garden.id === "back")?.careEvents.find((event) => event.id === "back-one")?.note,
        workspace.careEvents.length,
      ];
    }).toEqual(["Front one", "Back corrected from overview", 1]);
    await location.selectOption("all");
    await tasks.click();
    await expect(page).toHaveURL(/\/care\?view=tasks$/);
    await expect(location).toHaveValue("all");
    const backTask = page.getByRole("listitem").filter({ has: page.getByText("Back repeat", { exact: true }) });
    await backTask.getByRole("button", { name: "Complete", exact: true }).click();
    await page.getByLabel("Completion date").fill("2026-06-04");
    await page.getByRole("button", { name: "Complete task", exact: true }).click();
    await expect.poll(async () => (await remote()).gardens.find((garden) => garden.id === "back")!.careTasks[0].dueDate).toBe("2026-06-07");
    await page.reload();
    await expect(page.getByText("Due 2026-06-07 · Repeats every 3 days")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`global-care-${width}.png`), fullPage: true });
  });
}
