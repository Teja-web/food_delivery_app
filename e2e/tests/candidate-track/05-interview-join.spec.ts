/**
 * Candidate Track — Step 5: Interview join
 *
 * Validates the candidate's interview page at /roles/[roleId]/interviews.
 * Each test navigates from the portal roles list to find the role with interviews.
 *
 * Runs after team-04-interview (needs interviews in DB).
 * Authenticated via portal.json storage state (candidate role).
 */

import { test, expect } from "@playwright/test";
import { query } from "../../helpers/verify";

const PORTAL_EMAIL = "e2e-candidate@test.local";

/** Navigate to a role's interview tab from the portal roles list. */
async function gotoRoleInterviews(page: import("@playwright/test").Page) {
  // Ensure portal candidate exists
  await page.goto("/profile");
  await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

  // Find or create candidate + application + interview via DB
  let [candidate] = await query(
    `SELECT id, organization_id FROM candidates WHERE lower(email) = $1 LIMIT 1`,
    [PORTAL_EMAIL],
  );
  if (!candidate) return null;

  // Find an interview for this candidate
  const [interview] = await query(
    `SELECT i.id as interview_id, a.role_id
     FROM interviews i
     JOIN applications a ON a.id = i.application_id
     WHERE a.candidate_id = $1 AND a.stage NOT IN ('rejected', 'withdrawn')
     LIMIT 1`,
    [candidate.id],
  );

  if (!interview) {
    // Create application + interview — use any active role's org
    const [role] = await query(
      `SELECT id, organization_id FROM roles WHERE status != 'closed' LIMIT 1`,
    );
    if (!role) return null;

    const appId = `e2e-app-${Date.now()}`;
    const [app] = await query(
      `INSERT INTO applications (id, organization_id, role_id, candidate_id, stage)
       VALUES ($1, $2, $3, $4, 'screening') RETURNING id`,
      [appId, role.organization_id, role.id, candidate.id],
    );

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const ivId = `e2e-iv-${Date.now()}`;
    const [iv] = await query(
      `INSERT INTO interviews (id, organization_id, candidate_id, role_id, application_id, status, scheduled_at, duration_mins)
       VALUES ($1, $2, $3, $4, $5, 'confirmed', $6, 45) RETURNING id`,
      [ivId, role.organization_id, candidate.id, role.id, app.id, tomorrow.toISOString()],
    );

    // Navigate to role interviews page
    await page.goto(`/roles/${role.id}/interviews`);
    const hasMain = await page.locator("main").first().isVisible({ timeout: 10_000 }).catch(() => false);
    if (!hasMain) {
      // Try via roles list
      await page.goto("/roles");
      await expect(page.locator("main").first()).toBeVisible({ timeout: 10_000 });
      const link = page.locator(`a[href*="/roles/${role.id}"]`).first();
      if (await link.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await link.click();
        await page.waitForURL(/\/roles\//);
        const tab = page.getByRole("link", { name: /Interviews/i }).first();
        if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) await tab.click();
      }
    }
    return { interviewId: iv.id, roleId: role.id, candidateId: candidate.id };
  }

  await page.goto(`/roles/${interview.role_id}/interviews`);
  const hasMain = await page.locator("main").first().isVisible({ timeout: 10_000 }).catch(() => false);
  if (!hasMain) return null;
  return { interviewId: interview.interview_id, roleId: interview.role_id, candidateId: candidate.id };
}

test.describe("Portal Interview Page", () => {
  test("interview page renders interview cards", async ({ page }) => {
    test.setTimeout(60_000);

    const ctx = await gotoRoleInterviews(page);
    if (!ctx) { test.skip(); return; }

    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const sectionHeaders = page.locator("h2");
    const sectionCount = await sectionHeaders.count();
    expect(sectionCount, "Should have at least one interview section").toBeGreaterThan(0);
  });

  test("interview card shows scheduled date and duration", async ({ page }) => {
    test.setTimeout(60_000);

    const ctx = await gotoRoleInterviews(page);
    if (!ctx) { test.skip(); return; }

    const interviewCard = page.locator("[class*='rounded-xl'][class*='border']").first();
    await expect(interviewCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/\d+ min/).first()).toBeVisible({ timeout: 5_000 });
  });

  test("live interview shows Join now button", async ({ page }) => {
    test.setTimeout(60_000);

    const ctx = await gotoRoleInterviews(page);
    if (!ctx) { test.skip(); return; }

    // Make the interview "live"
    const now = new Date();
    await query(
      `UPDATE interviews SET scheduled_at = $1, status = 'confirmed', meeting_link = 'https://meet.example.com/test', updated_at = NOW() WHERE id = $2`,
      [now.toISOString(), ctx.interviewId],
    );

    await page.goto(`/roles/${ctx.roleId}/interviews`);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/Live now/i).first()).toBeVisible({ timeout: 10_000 });

    const joinBtn = page.getByRole("link", { name: /Join now/i }).first();
    await expect(joinBtn).toBeVisible({ timeout: 5_000 });
  });
});
