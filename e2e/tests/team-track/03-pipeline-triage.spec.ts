/**
 * Team Track — Step 3: Pipeline & triage
 *
 * Adds matched candidates to pipeline, verifies application DAG,
 * checks stage badges, and tests reject flow with DB verification.
 */

import { test, expect } from "@playwright/test";
import { extractId, verifyMatchesForRole, query } from "../../helpers/verify";
import { readState, writeState } from "../../helpers/state";

const state = readState();

test.describe.serial("03 · Pipeline & Triage", () => {
  test.beforeEach(async ({ page }) => {
    await page.addLocatorHandler(
      page.locator("[data-name='nextstep-overlay']"),
      async (overlay) => {
        try {
          await overlay.locator("button").first().click({ timeout: 2_000 });
          await overlay.waitFor({ state: "hidden", timeout: 3_000 });
        } catch {
          await page.evaluate(() => {
            document.querySelectorAll("[data-name='nextstep-overlay']").forEach((el) => el.remove());
          });
        }
      },
    );
  });

  test("3a. add matched candidates to pipeline", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto(state.roleUrl);
    await page.getByRole("button", { name: /Recommended/i }).click();

    const refreshBtn = page.getByRole("button", { name: /Refresh/i });
    if (await refreshBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await refreshBtn.click();
    }

    const candidateLinks = page.locator('a[href*="/recruit/candidates/"]');
    await expect(candidateLinks.first()).toBeVisible({ timeout: 90_000 });

    const linkCount = await candidateLinks.count();
    const toAdd = Math.min(linkCount, 2);

    for (let i = 0; i < toAdd; i++) {
      const firstCardLink = candidateLinks.first();
      const card = firstCardLink.locator("xpath=ancestor::div[contains(@class,'rounded-xl')]");
      const expandBtn = card.locator("button").first();
      await expandBtn.click();

      const addBtn = page.getByRole("button", { name: /Add to pipeline/i });
      await expect(addBtn).toBeVisible({ timeout: 5_000 });
      await addBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.getByRole("button", { name: /Pipeline/i }).first().click();
    const pipelineCandidates = page.locator('a[href*="/recruit/candidates/"]');
    await expect(pipelineCandidates.first()).toBeVisible({ timeout: 30_000 });
  });

  test("3b. application DAG produces analysis and match scores", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto(state.roleUrl);
    await page.getByRole("button", { name: /Pipeline/i }).first().click();

    const candidateLinks = page.locator('a[href*="/recruit/candidates/"]');
    await expect(candidateLinks.first()).toBeVisible({ timeout: 30_000 });

    const count = Math.min(await candidateLinks.count(), 3);
    const applicationUrls: string[] = [];
    for (let i = 0; i < count; i++) {
      await page.goto(state.roleUrl);
      await page.getByRole("button", { name: /Pipeline/i }).first().click();
      await expect(candidateLinks.first()).toBeVisible({ timeout: 15_000 });
      await candidateLinks.nth(i).click();
      await page.waitForLoadState("domcontentloaded");
      applicationUrls.push(page.url());
    }
    state.applicationUrls = applicationUrls;
    writeState({ applicationUrls });

    await page.goto(applicationUrls[0]!);
    await expect(
      page.getByText(/Match|Readiness|Culture|Fit|Score/i).first()
    ).toBeVisible({ timeout: 60_000 });

    const roleId = extractId(state.roleUrl);
    const { matches } = await verifyMatchesForRole(request, roleId, {
      minCount: 1,
      minFitScore: 1,
      hasAlignment: true,
      hasRecommendation: true,
    });

    if (matches.length > 0) {
      const bestMatch = matches[0];
      const gaps = typeof bestMatch.gaps === "string" ? JSON.parse(bestMatch.gaps) : bestMatch.gaps;
      expect(gaps, "Match should have gaps field").toBeDefined();
      expect(bestMatch.summary, "Match should have summary").toBeTruthy();
    }
  });

  test("3c. every application has a stage badge with a real value", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto(state.roleUrl);
    await page.getByRole("button", { name: /Pipeline/i }).first().click();

    const candidateLinks = page.locator('a[href*="/recruit/candidates/"]');
    await expect(candidateLinks.first()).toBeVisible({ timeout: 15_000 });
    const linkCount = await candidateLinks.count();
    expect(linkCount).toBeGreaterThanOrEqual(1);

    const stageLabels = page.locator(".capitalize");
    const stageCount = await stageLabels.count();
    expect(stageCount).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < stageCount; i++) {
      const text = await stageLabels.nth(i).textContent();
      expect(text!.trim().length).toBeGreaterThan(0);
    }
  });

  test("3d. reject an application — stage changes to rejected", async ({ page }) => {
    test.setTimeout(90_000);

    if (state.applicationUrls.length < 2) return;

    const roleId = extractId(state.roleUrl);

    await page.goto(state.roleUrl);
    await page.getByRole("button", { name: /Pipeline/i }).first().click();

    // Pipeline cards are collapsed by default — expand the last card's chevron
    const expandBtns = page.locator("[class*='rounded-xl']").locator("button:has(svg.lucide-chevron-down)");
    await expect(expandBtns.first()).toBeVisible({ timeout: 15_000 });
    await expandBtns.last().click();

    // Now the Reject button should be visible inside the expanded card
    const rejectBtn = page.locator("button").filter({ hasText: /^Reject$/ }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 5_000 });
    await rejectBtn.click();

    // Wait for the server action to complete
    await page.waitForLoadState("networkidle").catch(() => {});

    // DB verification: at least one application for this role should now be rejected
    let rejected = false;
    for (let i = 0; i < 10; i++) {
      const rows = await query(
        `SELECT id FROM applications WHERE role_id = $1 AND stage = 'rejected'`,
        [roleId],
      );
      if (rows.length > 0) { rejected = true; break; }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect(rejected, "At least one application should be rejected").toBe(true);
  });
});
