import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const DATA_ROW = "table tbody tr.cursor-pointer";

/**
 * Submit interview feedback with rating, decision, and comment.
 * Assumes the page is on an interview detail page.
 */
export async function submitInterviewFeedback(
  page: Page,
  opts: { rating: number; decision: "advance" | "hold" | "reject"; comment: string },
) {
  // Click Feedback tab if the form isn't already visible
  const commentBox = page.locator('textarea[placeholder="Your assessment..."]');
  if (!await commentBox.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Feedback" }).click();
  }
  await expect(commentBox).toBeVisible({ timeout: 15_000 });

  // Set star rating
  const starButtons = page.locator("button").filter({ has: page.locator("svg.lucide-star") });
  await starButtons.nth(opts.rating - 1).click();

  // Select decision
  await page.locator("button").filter({ hasText: opts.decision }).first().click();

  await commentBox.fill(opts.comment);

  const submitBtn = page.getByRole("button", { name: /Submit Feedback/i });
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
  await submitBtn.click();

  // Verify feedback persisted
  const decisionBadge = page.locator("span, [class*='badge']").filter({ hasText: opts.decision });
  await expect(decisionBadge.first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Collect application URLs from the role's Applications tab.
 */
async function getApplicationUrls(
  page: Page,
  limit = 5,
): Promise<string[]> {
  const rows = page.locator(DATA_ROW);
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });

  const count = Math.min(await rows.count(), limit);
  const urls: string[] = [];

  for (let i = 0; i < count; i++) {
    await rows.nth(i).click();
    await page.waitForURL(/\/recruit\/roles\/[^/]+/);
    urls.push(page.url());
    await page.goBack();
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  }

  return urls;
}
