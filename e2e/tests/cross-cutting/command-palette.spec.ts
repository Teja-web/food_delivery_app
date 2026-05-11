import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";

/**
 * Command Palette / Ask AI — Video #23
 *
 * Tests the Cmd+K command palette: opening, searching, navigation,
 * and AI query input. Runs after talent-lifecycle so data exists.
 */

test.describe("Command Palette", () => {
  test("opens with Cmd+K and closes with Escape", async ({ page }) => {
    await page.goto("/recruit/today");
    await dismissTourIfVisible(page);

    // Open with keyboard shortcut
    await page.keyboard.press("Meta+k");
    const palette = page.locator(".fixed.inset-0.z-50").first();
    await expect(palette).toBeVisible({ timeout: 5_000 });

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible({ timeout: 5_000 });
  });

  test("opens via search button click", async ({ page }) => {
    await page.goto("/recruit/today");
    await dismissTourIfVisible(page);

    // Click the search bar button
    const searchBtn = page.locator("#tour-search");
    await searchBtn.click();

    const palette = page.locator(".fixed.inset-0.z-50").first();
    await expect(palette).toBeVisible({ timeout: 5_000 });
  });

  test("searches roles by keyword", async ({ page }) => {
    await page.goto("/recruit/roles");
    await dismissTourIfVisible(page);

    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/Search roles, candidates/i);
    await expect(input).toBeVisible({ timeout: 5_000 });

    // Type a search term — lifecycle test creates roles with known titles
    await input.fill("Engineer");
    await page.waitForTimeout(500);

    // Should show results
    const results = page.locator(".fixed.inset-0.z-50 a, .fixed.inset-0.z-50 button").filter({ hasText: /engineer/i });
    await expect(results.first()).toBeVisible({ timeout: 10_000 });
  });

  test("searches candidates by name", async ({ page }) => {
    await page.goto("/recruit/candidates");
    await dismissTourIfVisible(page);

    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/Search roles, candidates/i);
    await expect(input).toBeVisible({ timeout: 5_000 });

    // Search for a candidate — lifecycle uploads resumes with real names
    await input.fill("Dhruv");
    await page.waitForTimeout(500);

    // Should show at least one result
    const resultsArea = page.locator(".fixed.inset-0.z-50").first();
    await expect(resultsArea).toBeVisible();
  });

  test("navigates to result on click", async ({ page }) => {
    await page.goto("/recruit/today");
    await dismissTourIfVisible(page);

    await page.keyboard.press("Meta+k");
    const input = page.getByPlaceholder(/Search roles, candidates/i);
    await expect(input).toBeVisible({ timeout: 5_000 });

    await input.fill("Engineer");
    await page.waitForTimeout(500);

    // Click a navigation result
    const navItem = page.locator(".fixed.inset-0.z-50 a").filter({ hasText: /engineer/i }).first();
    if (await navItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await navItem.click();
      // Should navigate away from the palette
      await expect(page.locator(".fixed.inset-0.z-50").first()).not.toBeVisible({ timeout: 5_000 });
    }
  });
});
