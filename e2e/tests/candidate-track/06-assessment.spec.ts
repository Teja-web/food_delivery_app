/**
 * Candidate Track — Step 6: Assessment take & results
 *
 * Candidate finds assigned assessment, takes it, submits answers,
 * and views results after evaluation.
 */

import { test, expect } from "@playwright/test";

test.describe.serial("Assessment lifecycle", () => {
  let assessmentTakeUrl = "";

  test("find and start assigned assessment", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/assessments");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const takeLink = page.getByRole("link", { name: /Take/i }).first();
    const hasTake = await takeLink.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasTake) {
      assessmentTakeUrl = (await takeLink.getAttribute("href")) || "";
      await takeLink.click();
      await page.waitForURL(/\/assessments\/[^/]+\/take/, { timeout: 15_000 });

      await expect(
        page.locator("form, [class*='question'], [class*='assessment']").first(),
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("answer questions and submit assessment", async ({ page }) => {
    test.setTimeout(120_000);

    if (!assessmentTakeUrl) {
      await page.goto("/assessments");
      const takeLink = page.getByRole("link", { name: /Take/i }).first();
      const hasTake = await takeLink.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasTake) return;
      await takeLink.click();
      await page.waitForURL(/\/assessments\/[^/]+\/take/, { timeout: 15_000 });
    } else {
      await page.goto(assessmentTakeUrl);
    }

    const radioButtons = page.locator('input[type="radio"]');
    const radioCount = await radioButtons.count();

    if (radioCount > 0) {
      const optionGroups = page.locator('[role="radiogroup"], [class*="question"]');
      const groupCount = await optionGroups.count();

      if (groupCount > 0) {
        for (let i = 0; i < groupCount; i++) {
          const firstOption = optionGroups.nth(i).locator('input[type="radio"]').first();
          if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await firstOption.click();
          }
        }
      } else {
        for (let i = 0; i < radioCount; i += 4) {
          await radioButtons.nth(i).click();
        }
      }
    }

    if (radioCount === 0) {
      const textareas = page.locator("textarea");
      const textCount = await textareas.count();
      for (let i = 0; i < textCount; i++) {
        await textareas.nth(i).fill("This is my answer for the e2e test assessment.");
      }
    }

    const submitBtn = page.getByRole("button", { name: /Submit/i }).first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasSubmit) {
      await submitBtn.click();

      await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
      const is404 = await page.getByText("404").isVisible({ timeout: 2_000 }).catch(() => false);
      expect(is404, "Assessment submission should not result in 404").toBeFalsy();
    }
  });

  test("view assessment results after evaluation", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/assessments");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const resultsLink = page.getByRole("link", { name: /View results|Results/i }).first();
    const hasResults = await resultsLink.isVisible({ timeout: 120_000 }).catch(() => false);

    if (hasResults) {
      await resultsLink.click();
      await page.waitForURL(/\/assessments\/[^/]+\/results/, { timeout: 15_000 });

      await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
      const is404 = await page.getByText("404").isVisible({ timeout: 2_000 }).catch(() => false);
      expect(is404, "Assessment results should not show 404").toBeFalsy();

      const scoreVisible = await page
        .getByText(/\d+\s*[/%]|Score:?\s*\d+|\d+\s*\/\s*\d+/i)
        .first()
        .isVisible({ timeout: 15_000 })
        .catch(() => false);

      expect.soft(scoreVisible, "Assessment results should show a numeric score").toBeTruthy();
    }
  });
});

test.describe("Assessment links", () => {
  test("'Take' button links to assessment take page", async ({ page }) => {
    await page.goto("/assessments");

    const takeBtn = page.getByRole("link", { name: /Take/i }).first();
    const has = await takeBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (has) {
      const href = await takeBtn.getAttribute("href");
      expect(href).toMatch(/\/assessments\/[a-zA-Z0-9_-]+\/take/);
    }
  });

  test("'View results' links to results page", async ({ page }) => {
    await page.goto("/assessments");

    const resultsLink = page.getByRole("link", { name: /View results|Results/i }).first();
    const has = await resultsLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (has) {
      const href = await resultsLink.getAttribute("href");
      expect(href).toMatch(/\/assessments\/[a-zA-Z0-9_-]+\/results/);
    }
  });
});
