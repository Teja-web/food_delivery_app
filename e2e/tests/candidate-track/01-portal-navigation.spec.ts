/**
 * Candidate Track — Step 1: Portal navigation & empty states
 *
 * Validates the candidate portal shell: header nav, avatar dropdown,
 * tab navigation, and that every page renders without dead ends.
 */

import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("header nav has Coach, Roles, Assessments, Pulse tabs", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.locator("nav, header").first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("link", { name: "Coach" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Roles" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Assessments" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pulse" })).toBeVisible();
  });

  test("avatar dropdown has Profile, Settings, Sign out", async ({ page }) => {
    await page.goto("/coach");

    const avatarBtn = page.locator("button.rounded-full").first();
    await avatarBtn.click();

    const dropdown = page.locator(".absolute.z-50").first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    await expect(dropdown.getByRole("link", { name: "Profile" })).toBeVisible();
    await expect(dropdown.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(dropdown.getByText("Sign out")).toBeVisible();
  });

  test("Coach tab navigates to /coach", async ({ page }) => {
    await page.goto("/roles");
    await page.locator("nav").getByRole("link", { name: "Coach" }).click();
    await expect(page).toHaveURL("/coach");
  });

  test("Roles tab navigates to /roles", async ({ page }) => {
    await page.goto("/coach");
    await page.getByRole("link", { name: "Roles" }).click();
    await expect(page).toHaveURL("/roles");
  });

  test("Pulse tab navigates to /pulse", async ({ page }) => {
    await page.goto("/coach");
    await page.getByRole("link", { name: "Pulse" }).click();
    await expect(page).toHaveURL("/pulse");
  });
});

test.describe("Empty states", () => {
  test("every page has no dead ends", async ({ page }) => {
    const routes = ["/coach", "/roles", "/assessments", "/pulse", "/profile", "/settings"];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

      const errorAlert = page.locator('[role="alert"][class*="destructive"]');
      const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
      expect(hasError, `Route ${route} should not show error alert`).toBeFalsy();

      const content = await page.locator("main").first().textContent();
      expect(content!.trim().length, `Route ${route} should have content`).toBeGreaterThan(0);
    }
  });
});
