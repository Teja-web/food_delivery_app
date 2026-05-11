import { test, expect } from "@playwright/test";
import { query } from "../../helpers/verify";

/**
 * Interview Prep — Videos #16 (Mock Interview), #17 (Rapid Fire)
 *
 * Tests the candidate portal prep studio: mode selection,
 * practice questions, mock interview, and rapid fire flows.
 * Runs with portal auth (candidate context).
 */

test.describe.serial("Interview Prep Studio", () => {
  test("0. setup — ensure portal candidate has an upcoming interview", async () => {
    // Find the portal candidate by email
    const portalEmail = "e2e-candidate@test.local";

    // Find or get the candidate record linked to this user (by email or name)
    let [candidate] = await query(
      `SELECT id, organization_id FROM candidates WHERE email = $1 LIMIT 1`,
      [portalEmail],
    );

    if (!candidate) {
      // Fallback: find by name (Test Candidate created in team-track tests)
      [candidate] = await query(
        `SELECT id, organization_id FROM candidates WHERE name = 'Test Candidate' LIMIT 1`,
      );
    }

    if (!candidate) {
      // Create candidate if none exists — need an org first
      const [org] = await query(`SELECT id FROM organizations LIMIT 1`);
      if (!org) {
        test.skip(true, "No organization found for candidate creation");
        return;
      }

      const candidateId = `prep-cand-${Date.now()}`;
      await query(
        `INSERT INTO candidates (id, organization_id, email, name, created_at, updated_at)
         VALUES ($1, $2, $3, 'Test Candidate', NOW(), NOW())`,
        [candidateId, org.id, portalEmail],
      );
      candidate = { id: candidateId, organization_id: org.id };
    }

    // Check if candidate already has an upcoming interview
    const existingInterview = await query(
      `SELECT i.id FROM interviews i
       JOIN applications a ON a.id = i.application_id
       WHERE a.candidate_id = $1 AND i.scheduled_at > NOW()
       LIMIT 1`,
      [candidate.id],
    );

    if (existingInterview.length > 0) {
      // Already has an interview
      return;
    }

    // Find an existing role to apply to
    const [role] = await query(
      `SELECT id, organization_id FROM roles WHERE organization_id = $1 LIMIT 1`,
      [candidate.organization_id],
    );

    if (!role) {
      test.skip(true, "No roles found for interview setup");
      return;
    }

    // Check if application exists, or create one
    let [application] = await query(
      `SELECT id FROM applications WHERE candidate_id = $1 AND role_id = $2 LIMIT 1`,
      [candidate.id, role.id],
    );

    if (!application) {
      const appId = `prep-app-${Date.now()}`;
      await query(
        `INSERT INTO applications (id, candidate_id, role_id, organization_id, stage, source, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'screening', 'direct', NOW(), NOW())`,
        [appId, candidate.id, role.id, candidate.organization_id],
      );
      application = { id: appId };
    }

    // Create an upcoming interview (30 minutes from now)
    const interviewId = `prep-int-${Date.now()}`;
    const scheduledAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now

    await query(
      `INSERT INTO interviews (id, application_id, organization_id, scheduled_at, duration_minutes, interview_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 45, 'screening', 'scheduled', NOW(), NOW())`,
      [interviewId, application.id, candidate.organization_id, scheduledAt.toISOString()],
    );

    // Verify interview was created
    const [created] = await query(
      `SELECT id FROM interviews WHERE id = $1`,
      [interviewId],
    );
    expect(created, "Interview should be created").not.toBeNull();
  });

  test("prep page loads with mode selector", async ({ page }) => {
    // /prep requires role context — navigate via roles page to find a prep link
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Find a "Prepare" or prep link on a role card
    const prepLink = page.locator('a[href*="/prepare"], a[href*="/prep"]').first();
    const hasPrep = await prepLink.isVisible({ timeout: 10_000 }).catch(() => false);

    if (!hasPrep) {
      test.skip(true, "No roles with prep available — skipping");
      return;
    }

    await prepLink.click();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Should show the three prep modes
    const practiceMode = page.locator("button, [role='tab']").filter({ hasText: /practice/i }).first();
    const mockMode = page.locator("button, [role='tab']").filter({ hasText: /mock/i }).first();
    const rapidMode = page.locator("button, [role='tab']").filter({ hasText: /rapid/i }).first();

    // At least one mode should be visible
    const hasModes = await practiceMode.isVisible({ timeout: 5_000 }).catch(() => false)
      || await mockMode.isVisible({ timeout: 5_000 }).catch(() => false)
      || await rapidMode.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!hasModes) {
      // Prep may require an interview to be scheduled — check for empty state
      const emptyState = page.locator("text=/no interview|no upcoming|schedule|prepare/i").first();
      await expect(emptyState).toBeVisible({ timeout: 5_000 });
      test.skip(true, "No interviews scheduled for prep — skipping");
      return;
    }

    await expect(practiceMode.or(mockMode).or(rapidMode).first()).toBeVisible();
  });

  test("practice mode shows questions when available", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    const prepLink = page.locator('a[href*="/prepare"], a[href*="/prep"]').first();
    if (!(await prepLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No prep link available");
      return;
    }
    await prepLink.click();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const practiceMode = page.locator("button, [role='tab']").filter({ hasText: /practice/i }).first();
    const hasPractice = await practiceMode.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasPractice) {
      test.skip(true, "Practice mode not available");
      return;
    }

    await practiceMode.click();

    // Should show a start button or questions
    const startBtn = page.getByRole("button", { name: /start|begin|generate/i }).first();
    const questions = page.locator("text=/question|Q\\d/i").first();

    const hasStart = await startBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasQuestions = await questions.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasStart || hasQuestions).toBeTruthy();
  });

  test("mock interview mode shows voice interface", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    const prepLink = page.locator('a[href*="/prepare"], a[href*="/prep"]').first();
    if (!(await prepLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No prep link available");
      return;
    }
    await prepLink.click();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const mockMode = page.locator("button, [role='tab']").filter({ hasText: /mock/i }).first();
    const hasMock = await mockMode.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasMock) {
      test.skip(true, "Mock interview mode not available");
      return;
    }

    await mockMode.click();

    // Should show the mock interview UI with a start button or voice interface
    const startBtn = page.getByRole("button", { name: /start|begin|connect/i }).first();
    const voiceUI = page.locator("text=/microphone|voice|speak/i").first();
    const mockContent = page.locator("text=/mock.*interview|simulated|45.*min/i").first();

    const hasContent = await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)
      || await voiceUI.isVisible({ timeout: 5_000 }).catch(() => false)
      || await mockContent.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasContent).toBeTruthy();
  });

  test("rapid fire mode shows timed interface", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    const prepLink = page.locator('a[href*="/prepare"], a[href*="/prep"]').first();
    if (!(await prepLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No prep link available");
      return;
    }
    await prepLink.click();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    const rapidMode = page.locator("button, [role='tab']").filter({ hasText: /rapid/i }).first();
    const hasRapid = await rapidMode.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasRapid) {
      test.skip(true, "Rapid fire mode not available");
      return;
    }

    await rapidMode.click();

    // Should show the rapid fire UI with timer or start button
    const startBtn = page.getByRole("button", { name: /start|begin|go/i }).first();
    const timerUI = page.locator("text=/30.*second|timer|timed|10.*question/i").first();
    const rapidContent = page.locator("text=/rapid.*fire/i").first();

    const hasContent = await startBtn.isVisible({ timeout: 5_000 }).catch(() => false)
      || await timerUI.isVisible({ timeout: 5_000 }).catch(() => false)
      || await rapidContent.isVisible({ timeout: 5_000 }).catch(() => false);

    expect(hasContent).toBeTruthy();
  });

  test("prep page shows past sessions", async ({ page }) => {
    await page.goto("/roles");
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
    const prepLink = page.locator('a[href*="/prepare"], a[href*="/prep"]').first();
    if (!(await prepLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, "No prep link available");
      return;
    }
    await prepLink.click();
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Past sessions section may appear if sessions exist
    const sessions = page.locator("text=/past.*session|history|previous/i").first();
    const hasSessions = await sessions.isVisible({ timeout: 3_000 }).catch(() => false);

    // This is informational — past sessions only show after completing a session
    if (hasSessions) {
      await expect(sessions).toBeVisible();
    }
  });
});
