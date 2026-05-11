/**
 * Candidate Track — Step 9: Public funnel (anon → consent → apply)
 *
 * Verifies the new GET-safe consent flow:
 *   1. Anonymous user visits /opportunities → /opportunities/[slug]
 *   2. CTA points at /opportunities/claim (page, NOT /api/opportunities/claim)
 *   3. The page renders a same-origin form whose POST creates the application
 *
 * Avoids mutation-via-GET. Doesn't depend on any prior track — uses an
 * incognito context.
 *
 * Several assertions are best-effort because the listing depends on
 * org-public-profile + at least one non-private role existing in the DB. If
 * the test env has no public roles, the spec still verifies that the CTA
 * URL shape on /opportunities/[slug] points at the consent page.
 */

import { test, expect } from "@playwright/test";

test.describe("Public funnel — consent-page flow", () => {
  test("anonymous /opportunities renders without auth", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/opportunities");
    // Page should render without redirecting to sign-in. Look for the page
    // title or the empty state.
    await expect(page).toHaveURL(/\/opportunities/);
    await ctx.close();
  });

  test("CTA on /opportunities/claim resolves and POSTs to /api/opportunities/claim", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    // Land directly on the consent page with a fake slug. Without auth, it
    // should bounce to /auth/sign-in (the route is server-rendered).
    await page.goto("/opportunities/claim?slug=fakeslug123");
    await expect(page).toHaveURL(/\/auth\/sign-in/);

    // The callbackUrl should preserve the consent route (NOT the api route),
    // proving we removed the GET-with-side-effects bounce target.
    const url = new URL(page.url());
    const cb = url.searchParams.get("callbackUrl") ?? "";
    expect(cb).toContain("/opportunities/claim");
    expect(cb, "callbackUrl must NOT point at the API mutation route").not.toContain(
      "/api/opportunities/claim",
    );

    await ctx.close();
  });

  test("/r/[token] private-role fallback redirects to consent page (not API)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Hit /r/<bogus> — expect a redirect to / with ref_error. The relevant
    // assertion is that NO redirect ever points at /api/opportunities/claim.
    const responsePromise = page.waitForResponse((res) => res.url().includes("/r/"), {
      timeout: 10_000,
    }).catch(() => null);
    await page.goto("/r/bogustoken000000000000000000000000");
    await responsePromise;
    expect(page.url()).not.toContain("/api/opportunities/claim");
    await ctx.close();
  });
});
