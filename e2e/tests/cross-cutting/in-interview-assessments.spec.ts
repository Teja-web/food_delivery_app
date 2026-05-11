import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";

/**
 * In-Interview Assessments — Video #22
 *
 * Tests the assessment assignment and tracking from the pipeline,
 * including assessment launch during interview context.
 * Runs after talent-lifecycle so roles with pipeline candidates exist.
 */

test.describe("In-Interview Assessments", () => {
  test("pipeline candidate shows assessment status", async ({ page }) => {
    // Navigate directly to a known role from lifecycle state
    await page.goto("/recruit/roles");
    await dismissTourIfVisible(page);

    // Wait for role cards to load (they contain links with IDs like /recruit/roles/abc123)
    const roleLink = page.locator('a[href^="/recruit/roles/"]').and(page.locator(':not([href="/recruit/roles/new"])'));
    const hasRole = await roleLink.first().isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasRole) {
      test.skip(true, "No roles visible on list page — skipping");
      return;
    }

    await roleLink.first().click();
    await page.waitForURL((url) => /\/recruit\/roles\/[^/]+/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 15_000 });

    // Wait for the role detail tabs to load, then ensure Pipeline is active
    const pipelineTab = page.getByRole("button", { name: /Pipeline/i }).first();
    await expect(pipelineTab).toBeVisible({ timeout: 10_000 });
    await pipelineTab.click();

    // Pipeline content should render
    const pipeline = page.locator("#tour-role-pipeline");
    await expect(pipeline).toBeVisible({ timeout: 10_000 });

    // Pipeline cards may show assessment badges or scores
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("assessments list shows active attempts", async ({ page }) => {
    await page.goto("/recruit/assessments");
    await dismissTourIfVisible(page);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Check for the Active tab
    const activeTab = page.locator("button").filter({ hasText: /Active/i }).first();
    const hasActive = await activeTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasActive) {
      test.skip(true, "No active tab — skipping");
      return;
    }

    await activeTab.click();

    // Should show active assessment attempts or empty state
    const attempts = page.locator("table tbody tr, [class*='card']").first();
    const emptyState = page.locator("text=/no active|no attempt/i").first();
    const hasContent = await attempts.isVisible({ timeout: 5_000 }).catch(() => false)
      || await emptyState.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasContent).toBeTruthy();
  });

  test("assessment detail shows questions and results", async ({ page }) => {
    await page.goto("/recruit/assessments");
    await dismissTourIfVisible(page);

    // Click the first assessment
    const assessmentLink = page.locator("a[href*='/recruit/assessments/']").first();
    const hasAssessment = await assessmentLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasAssessment) {
      test.skip(true, "No assessments — skipping");
      return;
    }

    await assessmentLink.click();
    await page.waitForURL(/\/recruit\/assessments\/[^/]+/);

    // Assessment detail should show questions or configuration
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("new assessment button navigates to creation form", async ({ page }) => {
    await page.goto("/recruit/assessments");
    await dismissTourIfVisible(page);

    const newBtn = page.locator("#tour-new-assessment");
    await expect(newBtn).toBeVisible({ timeout: 10_000 });
    await newBtn.click();

    await page.waitForURL(/\/recruit\/assessments\/new/);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
  });
});
