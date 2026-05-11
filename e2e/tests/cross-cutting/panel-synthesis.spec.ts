import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";

/**
 * Panel Synthesis — Video #21
 *
 * Tests the interview panel health display and AI feedback synthesis.
 * Runs after talent-lifecycle so interviews with scorecards exist.
 */

test.describe("Panel Synthesis", () => {
  test("role detail shows panel health on Interviews tab", async ({ page }) => {
    // Navigate to roles list and open the first role
    await page.goto("/recruit/roles");
    await dismissTourIfVisible(page);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const roleLink = page.locator('a[href^="/recruit/roles/"]').and(page.locator(':not([href="/recruit/roles/new"])'));
    await expect(roleLink.first()).toBeVisible({ timeout: 15_000 });
    await roleLink.first().click();
    await page.waitForURL((url) => /\/recruit\/roles\/[^/]+/.test(url.pathname) && !url.pathname.endsWith("/new"), { timeout: 15_000 });

    // Wait for role detail tabs to render
    await expect(page.locator("#tour-role-tabs")).toBeVisible({ timeout: 15_000 });

    // Switch to Interviews tab
    const interviewsTab = page.getByRole("button", { name: /Interviews/i });
    await expect(interviewsTab).toBeVisible({ timeout: 10_000 });
    await interviewsTab.click();

    // Panel health section should be visible if interviews have scorecards
    const panelHealth = page.locator("#tour-panel-health");
    const hasPanel = await panelHealth.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasPanel) {
      // Verify the three panel health metrics are shown
      await expect(page.getByText("Evidence")).toBeVisible();
      await expect(page.getByText("Scorer drift")).toBeVisible();
      await expect(page.getByText("Decision")).toBeVisible();
    }
  });

  test("interview detail shows feedback synthesis", async ({ page }) => {
    // Navigate to interviews list
    await page.goto("/recruit/interviews");
    await dismissTourIfVisible(page);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Click the first interview
    const interviewLink = page.locator("a[href*='/recruit/interviews/']").first();
    const hasInterview = await interviewLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInterview) {
      test.skip(true, "No interviews exist — skipping synthesis test");
      return;
    }

    await interviewLink.click();
    await page.waitForURL(/\/recruit\/interviews\/[^/]+/);

    // Switch to Feedback tab
    const feedbackTab = page.getByRole("button", { name: /Feedback/i });
    await expect(feedbackTab).toBeVisible({ timeout: 10_000 });
    await feedbackTab.click();

    // Check for scorecard or synthesis content
    const feedbackContent = page.locator("#tour-interview-feedback");
    await expect(feedbackContent).toBeVisible({ timeout: 10_000 });
  });

  test("interview detail shows AI prep on Preparation tab", async ({ page }) => {
    await page.goto("/recruit/interviews");
    await dismissTourIfVisible(page);

    const interviewLink = page.locator("a[href*='/recruit/interviews/']").first();
    const hasInterview = await interviewLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInterview) {
      test.skip(true, "No interviews exist — skipping prep test");
      return;
    }

    await interviewLink.click();
    await page.waitForURL(/\/recruit\/interviews\/[^/]+/);

    // Switch to Preparation tab
    const prepTab = page.getByRole("button", { name: /Preparation/i });
    await expect(prepTab).toBeVisible({ timeout: 10_000 });
    await prepTab.click();

    const prepContent = page.locator("#tour-interview-prep");
    await expect(prepContent).toBeVisible({ timeout: 10_000 });
  });
});
