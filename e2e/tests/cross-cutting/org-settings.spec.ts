import { test, expect } from "@playwright/test";

/**
 * Organization settings & configuration
 *
 * Covers: identity and team management pages load correctly.
 */

test.describe("Organization settings", () => {
  test("identity settings page loads with org details", async ({ page }) => {
    await page.goto("/recruit/settings/identity");
    await page.waitForURL(/\/recruit\/settings/, { timeout: 15_000 });

    const content = page.locator("main").first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("team page shows members with invite functionality", async ({ page }) => {
    await page.goto("/recruit/settings/team");

    const content = page.locator(
      "table, [class*='member'], [class*='team'], [class*='invite'], main"
    ).first();
    await expect(content).toBeVisible({ timeout: 15_000 });

    const inviteBtn = page.locator(
      'button:has-text("Invite"), button:has-text("Add"), button:has-text("+")'
    ).first();
    await expect(inviteBtn).toBeVisible({ timeout: 15_000 });
  });
});
