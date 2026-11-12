import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`Plant Doctor review and Plant Guide sources at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let assessments = 0;
    let questions = 0;
    await page.route("**/runtime-config", (route) => route.fulfill({ json: { portfolioDemo: false } }));
    await page.route("**/ai/plant-health-assessment", (route) => {
      assessments += 1;
      expect(route.request().postDataJSON().symptoms).toBe("White powder on the lower leaves.");
      return route.fulfill({ json: {
        summary: "Check the white coating before taking action.",
        possibleIssues: ["Powdery mildew"],
        nextSteps: ["Check both sides of the leaves."],
        followUpQuestions: [],
        confidence: "low",
      } });
    });
    const sourceTitle = "Preventing disease in the vegetable garden";
    const sourceUrl = "https://extension.umn.edu/plant-diseases";
    await page.route("**/plant-knowledge/answer", (route) => {
      questions += 1;
      expect(route.request().postDataJSON().question).toBe("What should I check on powdery leaves?");
      return route.fulfill({ json: {
        answer: "Check the leaf surfaces and nearby plants.",
        confidence: "low",
        followUpQuestions: [],
        citations: [{
          sourceKey: "test-extension", title: sourceTitle, publisher: "Extension",
          sourceUrl, reviewedOn: "2026-09-01", excerpt: "Record the symptoms before choosing a treatment.",
        }],
      } });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Load demo garden" }).click();
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    await page.goto("/doctor");
    await expect(page.getByRole("heading", { level: 1, name: "Plant Doctor" })).toBeVisible();
    await page.getByLabel("Choose a garden for this record").selectOption("demo-garden");
    await page.getByLabel("What do you observe?").fill("White powder on the lower leaves.");
    expect(assessments).toBe(0);
    await page.getByRole("button", { name: "Create AI assessment" }).click();
    const review = page.getByRole("region", { name: "Review assessment" });
    await expect(review.getByLabel("Summary")).toHaveValue("Check the white coating before taking action.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("doctor-review.png"), fullPage: true });
    await review.getByRole("button", { name: "Save health record" }).click();
    await expect(page.getByRole("region", { name: "Health history" })).toContainText("White powder on the lower leaves.");
    await expect(page.getByText("All changes saved", { exact: true })).toBeVisible();
    expect(assessments).toBe(1);

    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1, name: "Plant Guide" })).toBeVisible();
    await page.getByLabel("Question", { exact: true }).fill("What should I check on powdery leaves?");
    expect(questions).toBe(0);
    await page.getByRole("button", { name: "Ask Plant Guide" }).click();
    const answer = page.getByRole("region", { name: "Answer" });
    await expect(answer.getByRole("link", { name: sourceTitle })).toHaveAttribute("href", sourceUrl);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath("guide-answer.png"), fullPage: true });
    expect(questions).toBe(1);
  });
}
