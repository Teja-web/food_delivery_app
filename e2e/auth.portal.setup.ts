import { test as setup, expect } from "@playwright/test";

const PORTAL_FILE = "e2e/.auth/portal.json";

/**
 * Portal auth setup — create a candidate user account and sign in.
 *
 * Uses better-auth's email+password sign-up API, then signs in via the UI
 * so that the callback sets the user's role to "candidate".
 *
 * Depends on: talent-lifecycle (needs org + candidate data to exist).
 */
setup("authenticate as portal candidate", async ({ page, request }) => {
  const email = "e2e-candidate@test.local";
  const password = "TestCandidate123!";
  const name = "Test Candidate";

  // Step 1: Create the user via better-auth sign-up API (idempotent — 422 if exists)
  const signUpRes = await request.post("/api/auth/sign-up/email", {
    data: { email, password, name },
  });
  // 200 = created, 422 = already exists — both are fine
  expect([200, 422]).toContain(signUpRes.status());

  // Step 2: Sign in via the UI with callbackUrl pointing to a portal route.
  // The callback page detects the portal route and calls setCandidateRole().
  await page.goto("/auth/sign-in?callbackUrl=%2Fcoach");
  await page.locator("#email").waitFor({ state: "visible", timeout: 15_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();

  // Wait for the callback to redirect to /coach (portal home)
  await page.waitForURL((url) => url.pathname === "/coach" || url.pathname.startsWith("/auth/callback"), {
    timeout: 15_000,
  });

  // If we landed on the callback page, wait for the final redirect
  if (page.url().includes("/auth/callback")) {
    await page.waitForURL((url) => url.pathname === "/coach", { timeout: 15_000 });
  }

  await expect(page.locator("main, [class*='coach']").first()).toBeVisible({ timeout: 10_000 });

  await page.context().storageState({ path: PORTAL_FILE });
});
