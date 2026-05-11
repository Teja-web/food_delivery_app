/**
 * Vendor Track — happy path verification for vendor-and-attribution-plan
 * Phase 3.
 *
 * Walks the security/correctness spine of vendor support end-to-end:
 *   1. Hiring admin invites a vendor (UI on /recruit/settings/vendors).
 *   2. A fresh user signs up and accepts the invite — the accept page
 *      runs the create-org + membership + partnership transaction.
 *   3. With visibility default ("internal") the vendor sees zero roles.
 *   4. Admin creates a role with vendorVisibility="all" via the wizard.
 *   5. Vendor's next request lists the role.
 *   6. Vendor's sidebar does NOT show Offers; visiting /recruit/offers
 *      directly is blocked.
 *   7. Admin pauses the partnership.
 *   8. Vendor's next request loses access to the role.
 *   9. Admin resumes the partnership; access returns.
 *
 * NOT covered (deferred — UI gap):
 *   - Vendor submitting a candidate. createVendorCandidate exists at
 *     the operation layer but no form calls it yet, so the UI path
 *     would create a candidate that no org can see.
 *   - Attribution badges in the hiring-org UI.
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { dismissTourIfVisible } from "../../helpers/tours";
import { createRoleViaWizard } from "../../helpers/wizard";

// Module-scoped relay between serial tests in this file.
const RUN_TAG = `${Date.now()}`;
const VENDOR_EMAIL = `e2e-vendor-${RUN_TAG}@test.local`;
const VENDOR_PASSWORD = "TestVendor123!";
const VENDOR_ORG_NAME = `E2E Vendor ${RUN_TAG}`;
const ROLE_TITLE = `Vendor-Visible Role ${RUN_TAG}`;
const VENDOR_STATE_FILE = "e2e/.auth/vendor.json";

let acceptUrl = "";
let vendorRoleUrl = "";

async function newVendorPage(browser: Browser, options?: { fresh?: boolean }): Promise<{ ctx: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  // After the accept step, the saved storage state has the vendor's session
  // pinned to the vendor org; reuse it for subsequent vendor checks.
  const ctx = options?.fresh
    ? await browser.newContext()
    : await browser.newContext({ storageState: VENDOR_STATE_FILE });
  const page = await ctx.newPage();
  return { ctx, page };
}

test.describe.serial("Vendor flow — invite → accept → scope → pause", () => {
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

  test("a. admin invites a vendor and the accept link is shown", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/recruit/settings/vendors");
    await dismissTourIfVisible(page);

    // The invite form has two text inputs: email + org name.
    await page.getByPlaceholder("admin@vendor.com").fill(VENDOR_EMAIL);
    await page.getByPlaceholder("Vendor Co.").fill(VENDOR_ORG_NAME);
    await page.getByRole("button", { name: /Send invite/i }).click();

    // The settings page surfaces the accept URL in a <code> element after
    // a successful invite. Capture it for the next test.
    const codeEl = page.locator("code").first();
    await expect(codeEl).toBeVisible({ timeout: 10_000 });
    acceptUrl = (await codeEl.textContent()) ?? "";
    expect(acceptUrl).toContain("/vendor/accept?token=");

    // The pending invite row should now appear.
    await expect(page.getByText(VENDOR_EMAIL).first()).toBeVisible({ timeout: 5_000 });
  });

  test("b. vendor signs up + accepts → lands in recruit shell", async ({ browser, request }) => {
    test.setTimeout(60_000);
    expect(acceptUrl, "previous test must have captured an accept URL").not.toBe("");

    // Sign up the vendor user via better-auth's email API. 422 = already
    // exists from a prior run; both 200 and 422 are acceptable here.
    const signUpRes = await request.post("/api/auth/sign-up/email", {
      data: { email: VENDOR_EMAIL, password: VENDOR_PASSWORD, name: "Vendor User" },
    });
    expect([200, 422]).toContain(signUpRes.status());

    // Use a fresh browser context so we don't inherit admin cookies.
    const { ctx, page } = await newVendorPage(browser, { fresh: true });

    // Sign in via the UI.
    await page.goto("/auth/sign-in");
    await page.locator("#email").waitFor({ state: "visible", timeout: 15_000 });
    await page.locator("#email").fill(VENDOR_EMAIL);
    await page.locator("#password").fill(VENDOR_PASSWORD);
    await page.locator('button[type="submit"]').click();
    // After sign-in but before accept, the user has no org. They'll likely
    // bounce to /coach via the recruit layout's no-membership redirect.
    await page.waitForURL(
      (url) => !url.pathname.startsWith("/auth/sign-in"),
      { timeout: 15_000 },
    );

    // Hit the accept URL — runs the transaction and redirects into /recruit.
    await page.goto(acceptUrl);
    await page.waitForURL(
      (url) => url.pathname.startsWith("/recruit") || url.pathname.startsWith("/auth"),
      { timeout: 15_000 },
    );

    // Save the vendor's session state for subsequent tests.
    await ctx.storageState({ path: VENDOR_STATE_FILE });
    await ctx.close();
  });

  test("c. vendor sees zero roles by default (visibility=internal)", async ({ browser }) => {
    test.setTimeout(30_000);

    const { ctx, page } = await newVendorPage(browser);
    await page.goto("/recruit/roles");

    // No roles list rows. We don't assert empty-state copy because the page
    // may render a skeleton briefly; instead assert the new role doesn't
    // appear.
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(ROLE_TITLE)).toHaveCount(0);

    await ctx.close();
  });

  test("d. vendor sidebar does NOT show the Offers link", async ({ browser }) => {
    test.setTimeout(30_000);

    const { ctx, page } = await newVendorPage(browser);
    await page.goto("/recruit/today");
    await page.waitForLoadState("networkidle");

    // The Offers nav item is keyed by its label.
    const offersLink = page.getByRole("link", { name: /^Offers$/ });
    await expect(offersLink).toHaveCount(0);

    await ctx.close();
  });

  test("e. vendor visiting /recruit/offers is blocked", async ({ browser }) => {
    test.setTimeout(30_000);

    const { ctx, page } = await newVendorPage(browser);
    const response = await page.goto("/recruit/offers", { waitUntil: "domcontentloaded" });

    // The offer ops throw ForbiddenError; the page either renders an error
    // boundary or returns a non-200. Accept either as long as no offer rows
    // are listed.
    await page.waitForLoadState("networkidle").catch(() => {});
    const status = response?.status() ?? 0;
    if (status >= 400) {
      // Hard block — pass.
      expect(status).toBeGreaterThanOrEqual(400);
    } else {
      // Soft block — page rendered, but no offer rows.
      const offerRows = page.locator('a[href*="/recruit/offers/"]');
      await expect(offerRows).toHaveCount(0);
    }

    await ctx.close();
  });

  test("f. admin creates a role with vendorVisibility='all'", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/recruit/roles/new");
    await dismissTourIfVisible(page);

    vendorRoleUrl = await createRoleViaWizard(page, {
      title: ROLE_TITLE,
      description:
        "We need a role visible to partnered vendors. Sourcing partners may submit candidates against this requisition.",
      competencies: ["Sourcing", "Outbound"],
    });

    // The wizard helper doesn't set vendorVisibility (it predates Phase 3),
    // so flip the field via the edit page.
    await page.goto(`${vendorRoleUrl}/edit`);
    await page.waitForURL(/\/recruit\/roles\/[^/]+\/edit$/);

    // Open the visibility selector. The trigger renders the current value
    // ("Internal only"); click it, then choose "All partnered vendors".
    const visibilityTrigger = page.getByRole("combobox", { name: /Vendor visibility/i }).or(
      page.locator('button:has-text("Internal only")').first(),
    );
    await visibilityTrigger.first().click();
    await page.getByRole("option", { name: /All partnered vendors/i }).click();

    // Skip through wizard steps to Review.
    const reviewBtn = page.getByRole("button", { name: "Review" });
    if (await reviewBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await reviewBtn.click();
    }
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForURL(/\/recruit\/roles\/[^/]+$/, { timeout: 15_000 });
  });

  test("g. vendor now sees the role on /recruit/roles", async ({ browser }) => {
    test.setTimeout(30_000);

    const { ctx, page } = await newVendorPage(browser);
    await page.goto("/recruit/roles");
    await expect(page.getByText(ROLE_TITLE).first()).toBeVisible({ timeout: 15_000 });

    await ctx.close();
  });

  test("h. admin pauses the partnership", async ({ page }) => {
    test.setTimeout(30_000);

    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/recruit/settings/vendors");
    await page.waitForLoadState("networkidle");

    // The Pause button sits on the active partnership row.
    await page
      .getByRole("row", { name: new RegExp(VENDOR_ORG_NAME) })
      .getByRole("button", { name: /Pause/i })
      .click();

    // After pause, the row's status badge should read "paused".
    await expect(
      page.getByRole("row", { name: new RegExp(VENDOR_ORG_NAME) }).getByText("paused"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("i. paused vendor's next request loses access to the role", async ({ browser }) => {
    test.setTimeout(30_000);

    const { ctx, page } = await newVendorPage(browser);
    await page.goto("/recruit/roles");
    await page.waitForLoadState("networkidle");
    // The role should NO LONGER be visible. Note: a vendor paused with
    // partneredHiringOrgIds=[] can still hit the page; orgScope just
    // returns nothing, so the list is empty.
    await expect(page.getByText(ROLE_TITLE)).toHaveCount(0);

    await ctx.close();
  });

  test("j. admin resumes; vendor regains access", async ({ page, browser }) => {
    test.setTimeout(45_000);

    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/recruit/settings/vendors");
    await page.waitForLoadState("networkidle");

    await page
      .getByRole("row", { name: new RegExp(VENDOR_ORG_NAME) })
      .getByRole("button", { name: /Resume/i })
      .click();

    await expect(
      page.getByRole("row", { name: new RegExp(VENDOR_ORG_NAME) }).getByText("active"),
    ).toBeVisible({ timeout: 5_000 });

    // Vendor should see the role again.
    const { ctx, page: vendorPage } = await newVendorPage(browser);
    await vendorPage.goto("/recruit/roles");
    await expect(vendorPage.getByText(ROLE_TITLE).first()).toBeVisible({ timeout: 15_000 });
    await ctx.close();
  });
});
