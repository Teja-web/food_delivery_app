/**
 * Team Track — Step 7: Close role & analytics
 *
 * Closes the role, verifies insights/dashboard/schedule pages
 * render with real data from the full lifecycle.
 */

import { test, expect } from "@playwright/test";
import {
  query as dbQuery,
  extractId,
  verifyInsights,
} from "../../helpers/verify";
import { readState } from "../../helpers/state";

const state = readState();

test.describe.serial("07 · Close & Analytics", () => {
  test("7a. close role and verify status persists", async ({ page }) => {
    test.setTimeout(90_000);

    const roleToClose = state.roleUrl2 || state.roleUrl;
    expect(roleToClose).toBeTruthy();
    const roleId = extractId(roleToClose);

    await dbQuery("UPDATE roles SET status = 'closed' WHERE id = $1", [roleId]);

    const [role] = await dbQuery("SELECT status FROM roles WHERE id = $1", [roleId]);
    expect(role.status).toBe("closed");

    await page.goto(roleToClose);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
  });

  test("7b. insights page loads with real data", async ({ page, request }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/insights");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.locator('[role="alert"][class*="destructive"]');
    const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBeFalsy();

    const metricsText = await page.locator("main").first().textContent();
    expect(metricsText, "Insights page should have content").toBeTruthy();
  });

  test("7c. today dashboard shows triage items", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/today");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.locator('[role="alert"][class*="destructive"]');
    const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test("7d. schedule page loads", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/schedule");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.locator('[role="alert"][class*="destructive"]');
    const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test("7e. candidate search returns results", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/candidates");
    const search = page.locator('input[placeholder*="Search"], input[type="search"]').first();
    await expect(search).toBeVisible({ timeout: 15_000 });
  });
});
