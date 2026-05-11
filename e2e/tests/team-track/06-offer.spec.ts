/**
 * Team Track — Step 6: Offer lifecycle
 *
 * Two serial blocks:
 *   A. Recruiter creates, sends, and accepts offer (from lifecycle flow)
 *   B. Full negotiation workspace: decline, version chain, tabs (from offers tests)
 */

import { test, expect } from "@playwright/test";
import {
  query,
  extractId,
  verifyOfferIntelligence,
  verifyOfferVersions,
  verifyOfferStatus,
  waitForOffer,
} from "../../helpers/verify";
import { readState, writeState } from "../../helpers/state";

const state = readState();

// Local state for offer-specific tests
const offerState = {
  applicationId: "",
  offerId: "",
  candidateName: "",
};

test.describe.serial("06 · Offer", () => {
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

  test("6e. setup — find application for negotiation tests", async () => {
    const rows = await query(
      `SELECT a.id as app_id, a.role_id, a.candidate_id, c.name as candidate_name
       FROM applications a
       JOIN candidates c ON c.id = a.candidate_id
       LEFT JOIN offers o ON o.application_id = a.id
       WHERE a.stage NOT IN ('offer', 'hired', 'rejected', 'withdrawn')
         AND o.id IS NULL
       LIMIT 1`,
    );

    if (rows.length === 0) {
      const sourced = await query(
        `SELECT a.id, a.role_id, a.candidate_id, c.name
         FROM applications a
         JOIN candidates c ON c.id = a.candidate_id
         WHERE a.stage = 'sourced'
         LIMIT 1`,
      );
      expect(sourced.length, "Need at least one sourced application").toBeGreaterThan(0);
      offerState.applicationId = sourced[0].id;
      offerState.candidateName = sourced[0].name;
    } else {
      offerState.applicationId = rows[0].app_id;
      offerState.candidateName = rows[0].candidate_name;
    }

    expect(offerState.applicationId).toBeTruthy();
  });

  test("6f. move to offer stage → offer auto-created", async () => {
    test.setTimeout(90_000);

    await query(
      `UPDATE applications SET stage = 'offer', updated_at = NOW() WHERE id = $1`,
      [offerState.applicationId],
    );

    const offer = await waitForOffer(offerState.applicationId);
    expect(offer, "Offer should be created after stage change").not.toBeNull();

    offerState.offerId = offer!.id;
    expect(offer!.status).toBe("draft");
  });

  test("6g. close analysis runs on offer:insert", async ({ request }) => {
    test.setTimeout(90_000);

    let intel: any = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      intel = await verifyOfferIntelligence(request, offerState.offerId, {}).catch(() => null);
      if (intel?.close_analysis) break;
      await new Promise((r) => setTimeout(r, 4_000));
    }

    expect(intel, "Offer intelligence should exist").not.toBeNull();
    const ca = intel!.close_analysis as any;
    expect(ca.recommendation).toBeTruthy();
    expect(ca.riskScore).toBeGreaterThanOrEqual(0);
  });

  test("6h. leverage analysis runs on offer:insert", async ({ request }) => {
    test.setTimeout(90_000);

    let intel: any = null;
    for (let attempt = 0; attempt < 15; attempt++) {
      intel = await verifyOfferIntelligence(request, offerState.offerId, {}).catch(() => null);
      if (intel?.leverage_analysis) break;
      await new Promise((r) => setTimeout(r, 4_000));
    }

    expect(intel, "Offer intelligence should exist").not.toBeNull();
    const la = intel!.leverage_analysis as any;
    expect(la.leverageScore).toBeGreaterThanOrEqual(0);
    expect(la.leverageScore).toBeLessThanOrEqual(100);
    expect(la.leverageFactors.length).toBeGreaterThan(0);
  });

  test("6h-setup. create initial offer version for version chain tests", async () => {
    // Get offer details
    const [offer] = await query(
      `SELECT id, organization_id FROM offers WHERE id = $1`,
      [offerState.offerId],
    );
    expect(offer, "Offer should exist").not.toBeNull();

    // Check if version already exists
    const existingVersions = await query(
      `SELECT id FROM offer_versions WHERE offer_id = $1`,
      [offerState.offerId],
    );

    if (existingVersions.length === 0) {
      // Create initial version (v1)
      await query(
        `INSERT INTO offer_versions (id, offer_id, organization_id, version_number, trigger_type, comp_state, justification, created_by, created_at)
         VALUES ($1, $2, $3, 1, 'system_generated',
           '{"components":[{"name":"Base","amount":1200000}],"totalFixed":1200000,"totalCtc":1500000,"bonus":300000,"equity":null,"currency":"INR","format":"indian-ctc"}'::jsonb,
           'Initial offer generated by system',
           'System',
           NOW()
         )`,
        [`v1-${offerState.offerId}`, offerState.offerId, offer.organization_id],
      );
    }

    // Verify version exists
    const versions = await query(
      `SELECT id FROM offer_versions WHERE offer_id = $1`,
      [offerState.offerId],
    );
    expect(versions.length).toBeGreaterThanOrEqual(1);
  });

  test("6i. send offer — status changes to sent", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(`/recruit/offers/${offerState.offerId}`);

    const sendBtn = page.getByRole("button", { name: /Approve.*send offer/i }).first();
    await expect(sendBtn).toBeVisible({ timeout: 10_000 });
    await sendBtn.click();

    await expect(page.getByText("sent").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Accepted/i }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Declined/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("6j. decline with competing offer reason", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto(`/recruit/offers/${offerState.offerId}`);

    const declineBtn = page.getByRole("button", { name: /Declined/i }).first();
    await expect(declineBtn).toBeVisible({ timeout: 10_000 });
    await declineBtn.click();

    // Wait for the decline modal to appear
    const modal = page.locator(".fixed.inset-0.z-50").first();
    await expect(modal.getByText("Decline reason")).toBeVisible({ timeout: 5_000 });

    // Click "Competing offer" reason inside the modal
    await modal.getByRole("button", { name: "Competing offer" }).click();

    const companyInput = modal.getByPlaceholder("Company name");
    await expect(companyInput).toBeVisible({ timeout: 5_000 });
    await companyInput.fill("Acme Corp");

    await modal.getByRole("button", { name: /Confirm decline/i }).click();
    await expect(page.getByText("declined").first()).toBeVisible({ timeout: 15_000 });

    // Wait for the server action to complete
    await page.waitForTimeout(3_000);
  });

  test("6k. verify decline in DB — reason + cascade", async () => {
    test.setTimeout(30_000);

    const [row] = await query("SELECT status, decline_reason, declined_at FROM offers WHERE id = $1", [offerState.offerId]);
    expect(row, "Offer should exist").not.toBeNull();
    expect(row.status).toBe("declined");

    // If decline_reason is null, the offerSchema is stripping it — real product bug
    expect(row.decline_reason, "decline_reason should be saved (check offerSchema includes declineReason)").toBeTruthy();
    expect((row.decline_reason as any).reason).toBe("competing_offer");
    expect((row.decline_reason as any).competingCompany).toBe("Acme Corp");

    // Application should cascade to withdrawn
    let stage = "";
    for (let i = 0; i < 10; i++) {
      const [app] = await query("SELECT stage FROM applications WHERE id = $1", [offerState.applicationId]);
      stage = app?.stage;
      if (stage === "withdrawn") break;
      await new Promise((r) => setTimeout(r, 2_000));
    }
    expect(stage).toBe("withdrawn");
  });

  test("6l. offers list shows correct tabs", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto("/recruit/offers");

    await expect(page.getByText("In Progress").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Closed Won").first()).toBeVisible();
    await expect(page.getByText("Closed Lost").first()).toBeVisible();
    await expect(page.getByText("All").first()).toBeVisible();
  });

  test("6m. closed lost tab shows decline reason badge", async ({ page }) => {
    test.setTimeout(30_000);

    await page.goto("/recruit/offers");

    const closedLostTab = page.locator("button").filter({ hasText: /Closed Lost/ }).first();
    await closedLostTab.click();

    await expect(
      page.getByText(/competing offer/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("6n. version chain via DB", async ({ request }) => {
    test.setTimeout(60_000);

    const offers = await query(
      `SELECT o.id, o.organization_id FROM offers o
       JOIN offer_versions v ON v.offer_id = o.id
       LIMIT 1`,
    );

    if (offers.length === 0) {
      test.skip();
      return;
    }

    const offerId = offers[0].id;
    const orgId = offers[0].organization_id;

    await query(
      `INSERT INTO offer_versions (id, offer_id, organization_id, version_number, trigger_type, comp_state, justification, created_by, created_at)
       VALUES ($1, $2, $3,
         (SELECT COALESCE(MAX(version_number), 0) + 1 FROM offer_versions WHERE offer_id = $2),
         'recruiter_adjust',
         '{"components":[{"name":"Base","amount":1500000}],"totalFixed":1500000,"totalCtc":1800000,"bonus":300000,"equity":null,"currency":"INR","format":"indian-ctc"}'::jsonb,
         'Bumped base by 10% after candidate feedback',
         'Test Recruiter',
         NOW()
       )`,
      [`test-v-${Date.now()}`, offerId, orgId],
    );

    const versions = await verifyOfferVersions(request, offerId, {
      minVersions: 2,
      latestTrigger: "recruiter_adjust",
    });

    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  test("6o. version timeline renders on detail page", async ({ page }) => {
    test.setTimeout(30_000);

    const rows = await query(
      `SELECT DISTINCT o.id FROM offers o
       JOIN offer_versions v ON v.offer_id = o.id
       GROUP BY o.id HAVING COUNT(v.id) >= 2
       LIMIT 1`,
    );

    if (rows.length === 0) {
      test.skip();
      return;
    }

    await page.goto(`/recruit/offers/${rows[0].id}`);

    await expect(
      page.getByText(/Negotiation Timeline/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText("v1").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("v2").first()).toBeVisible({ timeout: 5_000 });
  });
});
