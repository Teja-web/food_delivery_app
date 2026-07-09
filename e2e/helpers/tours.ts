import type { Page } from "@playwright/test";

/**
 * Dismiss the NextStep onboarding tour overlay if it appears.
 * The overlay intercepts pointer events, blocking test interactions.
 */
export async function dismissTourIfVisible(page: Page) {
  const overlay = page.locator(".nextstep-overlay, [data-name='nextstep-overlay']");
  const visible = await overlay.isVisible().catch(() => false);
  if (visible) {
    // Try clicking skip/close button, then fallback to removing overlay via JS
    try {
      await overlay.locator("button").first().click({ timeout: 2_000 });
      await overlay.waitFor({ state: "hidden", timeout: 3_000 });
    } catch {
      // Force-remove the overlay via DOM if button click didn't work
      await page.evaluate(() => {
        document.querySelectorAll("[data-name='nextstep-overlay'], .nextstep-overlay").forEach((el) => el.remove());
      });
    }
  }
}
