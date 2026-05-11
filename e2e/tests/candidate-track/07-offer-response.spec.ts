/**
 * Portal offer review & response — candidate-facing e2e tests.
 *
 * Validates the candidate's ability to view, accept, and decline offers
 * from the portal at /roles/[roleId]/offer.
 *
 * Runs after talent-lifecycle (needs roles, candidates, applications in DB).
 * Authenticated via portal.json storage state (candidate role).
 */

import { test, expect } from "@playwright/test";
import { query, verifyOfferStatus } from "../../helpers/verify";

const PORTAL_EMAIL = "e2e-candidate@test.local";

const state = {
  candidateId: "",
  roleId: "",
  applicationId: "",
  offerId: "",
};

test.describe.serial("Portal Offer Review & Response", () => {
  // ═══════════════════════════════════════════════════════════════
  // Setup: ensure a sent offer exists for the portal candidate
  // ═══════════════════════════════════════════════════════════════

  test("0. setup — create a sent offer for the portal candidate", async ({ page }) => {
    test.setTimeout(60_000);

    // Find the portal candidate — or create one if ensurePortalCandidate hasn't run yet
    let [candidate] = await query(
      `SELECT id, organization_id FROM candidates WHERE lower(email) = $1 LIMIT 1`,
      [PORTAL_EMAIL],
    );

    if (!candidate) {
      // Visit portal to trigger ensurePortalCandidate
      await page.goto("/profile");
      await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });
      await new Promise((r) => setTimeout(r, 3_000));

      const rows = await query(
        `SELECT id, organization_id FROM candidates WHERE lower(email) = $1 LIMIT 1`,
        [PORTAL_EMAIL],
      );
      candidate = rows[0];
    }

    if (!candidate) {
      // Last resort: create directly
      const [org] = await query(`SELECT id FROM organizations LIMIT 1`);
      if (!org) { test.skip(); return; }

      const [created] = await query(
        `INSERT INTO candidates (organization_id, email, name)
         VALUES ($1, $2, 'Test Candidate')
         RETURNING id, organization_id`,
        [org.id, PORTAL_EMAIL],
      );
      candidate = created;
    }
    state.candidateId = candidate.id;

    // Find an active application for this candidate
    let [app] = await query(
      `SELECT a.id, a.role_id FROM applications a
       WHERE a.candidate_id = $1
         AND a.stage NOT IN ('rejected', 'withdrawn', 'hired')
       LIMIT 1`,
      [state.candidateId],
    );

    if (!app) {
      // Create an application on any active role — use the role's org, not candidate's
      const [role] = await query(
        `SELECT id, organization_id FROM roles WHERE status != 'closed' LIMIT 1`,
      );
      if (!role) { test.skip(); return; }

      const [created] = await query(
        `INSERT INTO applications (id, organization_id, role_id, candidate_id, stage)
         VALUES ($1, $2, $3, $4, 'offer')
         RETURNING id, role_id`,
        [`e2e-app-${Date.now()}`, role.organization_id, role.id, state.candidateId],
      );
      app = created;
    } else {
      // Move to offer stage if not already
      await query(`UPDATE applications SET stage = 'offer', updated_at = NOW() WHERE id = $1`, [app.id]);
    }

    state.applicationId = app.id;
    state.roleId = app.role_id;

    // Check for an existing offer, or create one
    const [existing] = await query(
      `SELECT id FROM offers WHERE application_id = $1 LIMIT 1`,
      [state.applicationId],
    );

    if (existing) {
      state.offerId = existing.id;
      // Reset to sent so we can test actions
      await query(
        `UPDATE offers SET status = 'sent', sent_at = NOW(), declined_at = NULL,
         accepted_at = NULL, decline_reason = NULL, updated_at = NOW() WHERE id = $1`,
        [state.offerId],
      );
    } else {
      const compState = JSON.stringify({
        components: [{ name: "Base", amount: 2000000 }],
        totalFixed: 2000000,
        totalCtc: 2400000,
        bonus: 400000,
        equity: null,
        currency: "INR",
        format: "indian-ctc",
      });

      // Use the application's org (= role's org), not the candidate's
      const [appOrg] = await query(`SELECT organization_id FROM applications WHERE id = $1`, [state.applicationId]);
      const orgId = appOrg?.organization_id ?? candidate.organization_id;

      const offerId = `e2e-offer-${Date.now()}`;
      const [offer] = await query(
        `INSERT INTO offers (id, organization_id, candidate_id, role_id, application_id, status, sent_at)
         VALUES ($1, $2, $3, $4, $5, 'sent', NOW())
         RETURNING id`,
        [offerId, orgId, state.candidateId, state.roleId, state.applicationId],
      );
      state.offerId = offer.id;

      // Create the initial version with comp state
      await query(
        `INSERT INTO offer_versions (id, offer_id, organization_id, version_number, trigger_type, comp_state, created_by, created_at)
         VALUES ($1, $2, $3, 1, 'system_generated', $4::jsonb, 'E2E Setup', NOW())`,
        [`e2e-ov-${Date.now()}`, state.offerId, orgId, compState],
      );
    }

    expect(state.offerId).toBeTruthy();
  });

  // ═══════════════════════════════════════════════════════════════
  // Flow 1: Offer page renders compensation
  // ═══════════════════════════════════════════════════════════════

  test("1a. offer page shows compensation breakdown", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(`/roles/${state.roleId}/offer`);
    await expect(page.locator("main").first()).toBeVisible({ timeout: 15_000 });

    // Compensation breakdown section should render
    await expect(
      page.getByText("Compensation Breakdown").first(),
    ).toBeVisible({ timeout: 10_000 });

    // Total CTC row should show a formatted number
    await expect(page.getByText("Total CTC").first()).toBeVisible({ timeout: 5_000 });
  });

  test("1b. offer page shows accept and decline buttons", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(`/roles/${state.roleId}/offer`);

    await expect(
      page.getByRole("button", { name: /Accept Offer/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: /Decline/i }).first(),
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.getByRole("button", { name: /Negotiate/i }).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  // ═══════════════════════════════════════════════════════════════
  // Flow 2: Accept offer
  // ═══════════════════════════════════════════════════════════════

  test("2a. accept offer — status changes to accepted", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(`/roles/${state.roleId}/offer`);

    const acceptBtn = page.getByRole("button", { name: /Accept Offer/i }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });
    await acceptBtn.click();

    // Status banner should show "Offer accepted"
    await expect(
      page.getByText(/Offer accepted/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("2b. verify accept in DB — offer status + application stage", async () => {
    test.setTimeout(30_000);

    // Offer should be accepted
    const offer = await verifyOfferStatus({}, state.offerId, { status: "accepted" });
    expect(offer!.accepted_at).toBeTruthy();

    // Application should cascade to hired (may be async)
    let stage = "";
    for (let i = 0; i < 10; i++) {
      const [app] = await query("SELECT stage FROM applications WHERE id = $1", [state.applicationId]);
      stage = app?.stage;
      if (stage === "hired") break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect(stage).toBe("hired");
  });

});
// Portal decline is covered by team-06 (platform-side decline with DB verification).
