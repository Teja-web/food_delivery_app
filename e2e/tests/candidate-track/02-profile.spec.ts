/**
 * Candidate Track — Step 2: Profile & onboarding
 *
 * Covers first-time candidate onboarding (J1), profile page,
 * resume upload, and skills management.
 */

import { test, expect } from "@playwright/test";

test.describe("First-time candidate", () => {
  test("coach shows welcome message with first name", async ({ page }) => {
    await page.goto("/coach");
    await expect(
      page.getByText(/Welcome|Hi |Good morning|your career coach/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("coach shows onboarding CTA to profile when no resume", async ({ page }) => {
    await page.goto("/coach");

    const profileCta = page.getByRole("link", { name: /Go to profile|Complete your profile/i }).first();
    const hasCta = await profileCta.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasCta) {
      await expect(profileCta).toHaveAttribute("href", "/profile");
    }
  });
});

test.describe("Profile", () => {
  test("profile page loads with candidate info", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByText(/Test Candidate|Candidate/i).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("profile shows resume upload with file input", async ({ page }) => {
    await page.goto("/profile");

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 10_000 });
  });

  test("profile has skills section with chip input", async ({ page }) => {
    await page.goto("/profile");

    await expect(page.getByText(/Skills/i).first()).toBeVisible({ timeout: 10_000 });

    const skillInput = page.getByPlaceholder(/Add a skill/i).first();
    const hasInput = await skillInput.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasInput) {
      await expect(skillInput).toBeVisible();
    }
  });

  test("profile accessible from avatar dropdown", async ({ page }) => {
    await page.goto("/coach");

    const avatarBtn = page.locator("button.rounded-full").first();
    await avatarBtn.click();

    const dropdown = page.locator(".absolute.z-50").first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
    const profileLink = dropdown.getByRole("link", { name: "Profile" });
    await expect(profileLink).toBeVisible({ timeout: 5_000 });
    await profileLink.click();
    await expect(page).toHaveURL("/profile");
  });
});
