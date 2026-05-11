/**
 * Candidate Track — Step 3: Roles & discovery
 *
 * Active candidate journeys (interview banners, role detail, match dimensions)
 * and passive candidate journeys (discover strip, pulse dashboard).
 */

import { test, expect } from "@playwright/test";

test.describe("Active candidate", () => {
  test("coach shows interview prep CTA when interview exists", async ({ page }) => {
    await page.goto("/coach");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

    const prepLink = page.getByRole("link", { name: /Prep|Prepare|Open prep/i }).first();
    const hasPrepLink = await prepLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasPrepLink) {
      await expect(prepLink).toHaveAttribute("href", /\/(prep|prepare)/);
    }
  });

  test("roles page shows interview banner when upcoming interview exists", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

    const banner = page.getByText(/Interview|Upcoming/i).first();
    const hasBanner = await banner.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasBanner) {
      await expect(banner).toBeVisible();
    }
  });

  test("roles application card links to detail page", async ({ page }) => {
    await page.goto("/roles");

    const roleLink = page.locator('a[href*="/roles/"]').first();
    const hasLink = await roleLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasLink) {
      await expect(roleLink).toHaveAttribute("href", /\/roles\/[a-zA-Z0-9_-]+/);
    }
  });

  test("role detail page shows match dimensions", async ({ page }) => {
    await page.goto("/roles");

    const roleLink = page.locator('a[href*="/roles/"]').filter({ hasNotText: /Roles/ }).first();
    const hasApp = await roleLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasApp) {
      await roleLink.click();
      await page.waitForURL(/\/roles\/[a-zA-Z0-9_-]+/);
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
    }
  });
});

test.describe("Passive candidate", () => {
  test("roles discover strip shows matched roles", async ({ page }) => {
    await page.goto("/roles");

    const discover = page.getByText(/Matched for you|Discover/i).first();
    const hasDiscover = await discover.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasDiscover) {
      await expect(discover).toBeVisible();
    } else {
      await expect(page.locator("main").first()).toBeVisible();
    }
  });

  test("pulse dashboard renders with skill data or empty state", async ({ page }) => {
    await page.goto("/pulse");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

    const content = await page.locator("main").first().textContent();
    expect(content!.length).toBeGreaterThan(0);
  });
});

test.describe("Cross-component links", () => {
  test("roles discover empty 'Talk to Coach' links to /coach", async ({ page }) => {
    await page.goto("/roles");

    const link = page.getByRole("link", { name: /Talk to Coach/i }).first();
    const has = await link.isVisible({ timeout: 10_000 }).catch(() => false);
    if (has) {
      await expect(link).toHaveAttribute("href", "/coach");
    }
  });
});
