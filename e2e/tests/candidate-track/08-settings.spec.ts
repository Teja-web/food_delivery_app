/**
 * Candidate Track — Step 8: Portal settings
 *
 * Notification toggles, account info, sign out, and avatar access.
 */

import { test, expect } from "@playwright/test";

test.describe("Portal Settings", () => {
  test("settings page loads with account info", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("Settings").first()).toBeVisible();

    await expect(
      page.getByText(/e2e-candidate@test.local|Candidate/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("settings has notification toggles", async ({ page }) => {
    await page.goto("/settings");

    await expect(page.getByText(/New role matches/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Interview prep reminders/i).first()).toBeVisible();
    await expect(page.getByText(/Feedback received/i).first()).toBeVisible();
    await expect(page.getByText(/Coach insights/i).first()).toBeVisible();
    await expect(page.getByText(/Pipeline status changes/i).first()).toBeVisible();
  });

  test("settings has sign out button", async ({ page }) => {
    await page.goto("/settings");

    await expect(
      page.getByRole("button", { name: /Sign out/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("settings accessible from avatar dropdown", async ({ page }) => {
    await page.goto("/coach");

    const avatarBtn = page.locator("button.rounded-full").first();
    await avatarBtn.click();

    const dropdown = page.locator(".absolute.z-50").first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    const settingsLink = dropdown.getByRole("link", { name: "Settings" });
    await expect(settingsLink).toBeVisible({ timeout: 5_000 });
    await settingsLink.click();
    await expect(page).toHaveURL("/settings");
  });
});
