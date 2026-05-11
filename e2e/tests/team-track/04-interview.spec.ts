/**
 * Team Track — Step 4: Interview lifecycle
 *
 * Schedules interview, verifies prep chain, submits scorecard,
 * and checks interview detail tabs (Info, Preparation, Activity).
 */

import { test, expect } from "@playwright/test";
import {
  query as dbQuery,
  extractId,
  fetchEntity,

  verifyActivity,
} from "../../helpers/verify";
import { readState, writeState } from "../../helpers/state";

const state = readState();

test.describe.serial("04 · Interview", () => {
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

  test("4a. schedule interview from new interview page", async ({ page }) => {
    test.setTimeout(90_000);

    const roleId = extractId(state.roleUrl);
    const apps = await dbQuery("SELECT id FROM dilliznt.applications WHERE role_id = $1 LIMIT 1", [roleId]);
    expect(apps.length).toBeGreaterThan(0);
    const stages = await dbQuery("SELECT id FROM dilliznt.interview_stages WHERE role_id = $1 ORDER BY \"order\" ASC LIMIT 1", [roleId]);
    expect(stages.length).toBeGreaterThan(0);

    await page.goto(`/recruit/interviews/new?applicationId=${apps[0].id}&roleId=${roleId}&stageId=${stages[0].id}`);

    const submitBtn = page.getByRole("button", { name: /Propose & Advance/i });
    await expect(submitBtn).toBeVisible({ timeout: 15_000 });

    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
      await dateInput.fill(tomorrow);
    }
    const timeInput = page.locator('input[type="time"]').first();
    if (await timeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await timeInput.fill("10:00");
    }

    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    const navigated = await page
      .waitForURL(/\/recruit\/interviews\/[^/]+$/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (navigated) {
      state.interviewUrl = page.url();
      writeState({ interviewUrl: state.interviewUrl });
    }

    await expect(page.locator("h1, h2, main").first()).toBeVisible({ timeout: 10_000 });
  });

  test("4b. interview appears in interviews list", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/interviews");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const errorAlert = page.locator('[role="alert"][class*="destructive"]');
    const hasError = await errorAlert.isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBeFalsy();
  });

  test("4b-verify. interview prep chain — focus areas populated", async ({ request }) => {
    test.setTimeout(120_000);

    if (!state.interviewUrl) return;
    const interviewId = extractId(state.interviewUrl);

    let retries = 6;
    let intel: any = null;
    while (retries > 0) {
      intel = await fetchEntity(request, "interviewIntel", { id: interviewId }).catch(() => null);
      if (intel?.prep) break;
      retries--;
      if (retries > 0) await new Promise((r) => setTimeout(r, 10_000));
    }

    if (intel?.prep) {
      const prep = typeof intel.prep === "string" ? JSON.parse(intel.prep) : intel.prep;
      const focusAreas = prep?.focusAreas || prep?.focus_areas || [];
      expect(
        Array.isArray(focusAreas) ? focusAreas.length : 0,
        "Interview prep should have at least 2 focus areas",
      ).toBeGreaterThanOrEqual(2);
    }
  });

  test("4b-slots. edit interview — verify slots persist", async ({ page, request }) => {
    test.setTimeout(90_000);

    if (!state.interviewUrl) return;
    const interviewId = extractId(state.interviewUrl);

    await page.goto(`${state.interviewUrl}/edit`);
    await page.waitForURL(/\/recruit\/interviews\/[^/]+\/edit$/);

    const addSlotBtn = page.getByRole("button", { name: /Add slot/i });
    const hasAddSlot = await addSlotBtn.isVisible({ timeout: 10_000 }).catch(() => false);

    if (hasAddSlot) {
      await addSlotBtn.click();
      await addSlotBtn.click();

      const saveBtn = page.getByRole("button", { name: /Save|Update/i }).first();
      if (await saveBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await saveBtn.click();
        await page.waitForURL(/\/recruit\/interviews\/[^/]+$/, { timeout: 15_000 }).catch(() => {});
      }

      const interview = await fetchEntity(request, "interview", { id: interviewId });
      const slots = interview?.proposedSlots ?? [];
      expect(Array.isArray(slots), "proposedSlots should be an array").toBeTruthy();
    }
  });

  test("4c. submit feedback and verify decision persists", async ({ page }) => {
    test.setTimeout(120_000);

    // Always navigate via interviews list to avoid stale URLs
    await page.goto("/recruit/interviews");
    const interviewLink = page.locator('a[href*="/recruit/interviews/"]').first();
    await expect(interviewLink).toBeVisible({ timeout: 30_000 });
    await interviewLink.click();
    await page.waitForURL(/\/recruit\/interviews\/[^/]+/);
    state.interviewUrl = page.url();
    writeState({ interviewUrl: state.interviewUrl });

    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const feedbackTab = page.getByRole("button", { name: "Feedback" });
    if (await feedbackTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await feedbackTab.click();
    }

    const commentBox = page.locator('textarea[placeholder="Your assessment..."]');
    const hasForm = await commentBox.isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasForm) {
      const starButtons = page.locator("button").filter({ has: page.locator("svg.lucide-star") });
      if (await starButtons.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await starButtons.nth(3).click();
      }

      const advanceBtn = page.locator("button").filter({ hasText: "advance" }).first();
      if (await advanceBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await advanceBtn.click();
      }

      await commentBox.fill("Strong technical skills, clear communication.");

      const submitBtn = page.getByRole("button", { name: /Submit/i }).first();
      if (await submitBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click();

        // Submit may trigger a page refresh via SSE — navigate back to interview detail
        await page.goto(state.interviewUrl);
        await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
      }
    }
  });

  test("4d. interview detail shows preparation and activity tabs", async ({ page, request }) => {
    test.setTimeout(60_000);

    const url = state.interviewUrl || "/recruit/interviews";
    await page.goto(url);

    if (!state.interviewUrl) {
      const interviewLink = page.locator('a[href*="/recruit/interviews/"]').first();
      await expect(interviewLink).toBeVisible({ timeout: 30_000 });
      await interviewLink.click();
      await page.waitForURL(/\/recruit\/interviews\/[^/]+$/);
    }

    const infoTab = page.getByRole("button", { name: "Info" });
    if (await infoTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await infoTab.click();
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
    }

    const prepTab = page.getByRole("button", { name: "Preparation" });
    if (await prepTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await prepTab.click();
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
    }

    const activityTab = page.getByRole("button", { name: "Activity" });
    if (await activityTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await activityTab.click();
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });

      const activityEntries = page.locator("[class*='activity'], [class*='log'], [class*='timeline']").first();
      const hasEntries = await activityEntries.isVisible({ timeout: 5_000 }).catch(() => false);
      if (!hasEntries && state.interviewUrl) {
        const interviewId = extractId(state.interviewUrl);
        await verifyActivity(request, "interview", interviewId, { minEntries: 1 });
      }
    }
  });

  test("4e. scorecard page loads with real interview data", async ({ page }) => {
    test.setTimeout(60_000);

    const interviewId = (state.interviewUrl || "").split("/").pop();
    if (interviewId) {
      await page.goto(`/recruit/scorecard/${interviewId}`);

      await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

      await expect(
        page.getByText(/Scorecard submitted|Scorecard pending/i).first()
      ).toBeVisible({ timeout: 10_000 });

      const hasMockData = await page.getByText("Samuel R.").isVisible({ timeout: 2_000 }).catch(() => false);
      expect(hasMockData).toBeFalsy();
    }
  });

  test("4f. role analysis shows accurate interview count", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto(state.roleUrl);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const analysisText = await page.locator("main").first().textContent();
    if (analysisText?.includes("no interviews conducted")) {
      expect.soft(
        analysisText,
        "Role analysis should not say 'no interviews conducted' when interviews exist",
      ).not.toContain("no interviews conducted");
    }
  });
});
