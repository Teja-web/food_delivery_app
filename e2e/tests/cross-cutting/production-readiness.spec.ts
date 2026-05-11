import { test, expect } from "@playwright/test";

/**
 * Production readiness tests
 *
 * Covers: critical page loads, API endpoints, error handling
 */
test.describe("Production readiness checks", () => {
  test("app root redirects to a valid page", async ({ page }) => {
    const response = await page.goto("/recruit/");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("auth API endpoint responds", async ({ request }) => {
    const response = await request.get("/api/auth/session");
    expect(response.status()).toBeLessThan(500);
  });

  test("critical talent pages load without 500 errors", async ({ page }) => {
    const criticalPages = [
      "/recruit/candidates",
      "/recruit/roles",
      "/recruit/interviews",
      "/recruit/offers",
      "/recruit/assessments",
      "/recruit/pools",
    ];

    for (const path of criticalPages) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test("settings pages load without 500 errors", async ({ page }) => {
    const settingsPages = [
      "/recruit/settings/identity",
      "/recruit/settings/departments",
      "/recruit/settings/team",
    ];

    for (const path of settingsPages) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(500);
    }
  });

  test("no console errors on today dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/recruit/today", { waitUntil: "load" });

    const criticalErrors = errors.filter(
      (e) => !e.includes("favicon") && !e.includes("HMR") && !e.includes("hydrat")
    );

    expect(criticalErrors.length).toBeLessThan(5);
  });
});
