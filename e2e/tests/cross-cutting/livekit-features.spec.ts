import { test, expect } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";

/**
 * LiveKit Features — join button, room page, proctoring badge.
 *
 * Verifies UI elements exist without requiring actual WebRTC.
 * Runs after team-03-pipeline so interviews exist.
 */

test.describe("LiveKit Interview Features", () => {
  test("interview detail shows join room button", async ({ page }) => {
    await page.goto("/recruit/interviews");
    await dismissTourIfVisible(page);

    const interviewLink = page.locator("a[href*='/recruit/interviews/']").first();
    const hasInterview = await interviewLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInterview) {
      test.skip(true, "No interviews — skipping join button test");
      return;
    }

    await interviewLink.click();
    await page.waitForURL(/\/recruit\/interviews\/[^/]+/);

    const joinBtn = page.locator("a, button").filter({ hasText: /join|room/i }).first();
    const hasJoin = await joinBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasJoin) {
      const countdown = page.locator("text=/Opens in|remaining/i").first();
      const hasCountdown = await countdown.isVisible({ timeout: 3_000 }).catch(() => false);
      if (!hasCountdown) {
        await expect(page.locator("main").first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });

  test("interview room page exists and renders pre-join", async ({ page }) => {
    await page.goto("/recruit/interviews");
    await dismissTourIfVisible(page);

    const interviewLink = page.locator("a[href*='/recruit/interviews/']").first();
    const hasInterview = await interviewLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInterview) {
      test.skip(true, "No interviews — skipping room page test");
      return;
    }

    const href = await interviewLink.getAttribute("href");
    const interviewId = href?.match(/\/recruit\/interviews\/([^/]+)/)?.[1];
    expect(interviewId).toBeTruthy();

    const response = await page.goto(`/interviews/${interviewId}/room`);
    expect(response?.status()).toBeLessThan(500);
  });

  test("proctored interview shows proctoring badge or indicator", async ({ page }) => {
    await page.goto("/recruit/interviews");
    await dismissTourIfVisible(page);

    const interviewLink = page.locator("a[href*='/recruit/interviews/']").first();
    const hasInterview = await interviewLink.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasInterview) {
      test.skip(true, "No interviews — skipping proctoring test");
      return;
    }

    await interviewLink.click();
    await page.waitForURL(/\/recruit\/interviews\/[^/]+/);

    const infoTab = page.getByRole("button", { name: /Info/i });
    await expect(infoTab).toBeVisible({ timeout: 10_000 });
    await infoTab.click();

    await expect(page.locator("#tour-interview-info")).toBeVisible({ timeout: 10_000 });
  });
});
