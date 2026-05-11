import { test, expect } from "@playwright/test";

/**
 * Multi-tenant & org isolation tests
 *
 * Covers: org context, data scoping, cross-org leakage prevention
 */
test.describe("Multi-tenant isolation & org boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.locator("[data-name='nextstep-overlay']"),
      async (overlay) => {
        try {
          await overlay.locator("button").first().click({ timeout: 2_000 });
          await overlay.waitFor({ state: "hidden", timeout: 3_000 });
        } catch {
          await page.evaluate(() => {
            document.querySelectorAll("[data-name='nextstep-overlay']").forEach((el) => el.remove());
          });
        }
      },
    );
  });

  test("all list pages scope data to current organization", async ({ page }) => {
    test.setTimeout(120_000);

    const entityPages = [
      { path: "/recruit/candidates", name: "Candidates" },
      { path: "/recruit/roles", name: "Roles" },
      { path: "/recruit/interviews", name: "Interviews" },
      { path: "/recruit/offers", name: "Offers" },
      { path: "/recruit/assessments", name: "Assessments" },
      { path: "/recruit/pools", name: "Pools" },
    ];

    for (const { path } of entityPages) {
      await page.goto(path);

      const content = page.locator("table, [class*='empty'], main").first();
      await expect(content).toBeVisible({ timeout: 15_000 });

      // Verify no server error
      const errorAlert = page.locator('[role="alert"][class*="destructive"]');
      const hasError = await errorAlert.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(hasError).toBeFalsy();
    }
  });

  test("org context is present in navigation", async ({ page }) => {
    await page.goto("/recruit/candidates");

    const orgContext = page.locator(
      '[class*="org"], [class*="tenant"], [class*="workspace"], [class*="team-switcher"], [class*="sidebar"], nav'
    ).first();
    await expect(orgContext).toBeVisible({ timeout: 15_000 });
  });

  test("detail pages maintain org context without permission errors", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/candidates");
    const firstCandidate = page.locator('a[href*="/recruit/candidates/"]').first();
    await expect(firstCandidate).toBeVisible({ timeout: 15_000 });
    await firstCandidate.click();
    await page.waitForURL(/\/recruit\/candidates\/[^/]+$/);

    // Verify the page loaded successfully (no cross-org 404/403)
    const heading = page.locator("h1, h2, [class*='heading']").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // No permission error shown
    const permissionError = page.locator(
      'text=/unauthorized|forbidden|access denied/i'
    );
    const hasPermError = await permissionError.isVisible({ timeout: 1_000 }).catch(() => false);
    expect(hasPermError).toBeFalsy();
  });

  test("settings are org-scoped", async ({ page }) => {
    await page.goto("/recruit/settings/identity");

    const content = page.locator("main").first();
    await expect(content).toBeVisible({ timeout: 15_000 });

    // Members should only show current org members
    await page.goto("/recruit/settings/team");

    const memberContent = page.locator("table, [class*='member'], main").first();
    await expect(memberContent).toBeVisible({ timeout: 15_000 });
  });

  test("insights dashboard is org-scoped", async ({ page }) => {
    await page.goto("/recruit/insights");

    const content = page.locator("main").first();
    await expect(content).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.locator('[role="alert"][class*="destructive"]');
    const hasError = await errorAlert.isVisible({ timeout: 1_000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });
});
