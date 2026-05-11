/**
 * CSRF guard verification for the claim routes.
 *
 * Both `/api/opportunities/claim` and `/api/campus/claim` used to be GET
 * handlers that mutated state — this meant a malicious site embedding
 * `<img src="…/api/opportunities/claim?slug=X">` could silently apply a
 * logged-in candidate to any role.
 *
 * Both routes are now POST-only, with a same-origin Origin check. This
 * spec proves:
 *   1. GET to either route is rejected (405 / 404 / no mutation).
 *   2. POST with a foreign Origin header is rejected (403).
 *   3. POST with no body is rejected (400 / 401 depending on auth).
 *
 * The happy-path POST flow is verified end-to-end in
 * candidate-track/09-public-funnel.spec.ts (when present).
 */

import { test, expect } from "@playwright/test";

test.describe("CSRF guards on claim routes", () => {
  test("GET /api/opportunities/claim is no longer a mutation surface", async ({ request }) => {
    const res = await request.get("/api/opportunities/claim?slug=any");
    // Next.js auto-405s when only POST is exported. Either 405 or 404 is fine
    // — what matters is that no application is created and no redirect-mutate
    // path exists. Reject any 2xx/3xx success response.
    expect(res.status(), `unexpected success on GET claim: ${res.status()}`).toBeGreaterThanOrEqual(400);
  });

  test("GET /api/campus/claim is no longer a mutation surface", async ({ request }) => {
    const res = await request.get("/api/campus/claim?token=any");
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("POST /api/opportunities/claim from a foreign Origin is forbidden", async ({ request }) => {
    const res = await request.post("/api/opportunities/claim", {
      headers: { Origin: "https://evil.example" },
      multipart: { slug: "anything" },
    });
    expect(res.status(), `cross-origin POST should be 403: got ${res.status()}`).toBe(403);
  });

  test("POST /api/campus/claim from a foreign Origin is forbidden", async ({ request }) => {
    const res = await request.post("/api/campus/claim", {
      headers: { Origin: "https://evil.example" },
      multipart: { token: "anything" },
    });
    expect(res.status()).toBe(403);
  });

  test("POST /api/opportunities/claim with no body is rejected", async ({ request }) => {
    // Same-origin request (no Origin header passes the check), missing
    // identifiers — should be 400 or 401 depending on whether auth runs first.
    const res = await request.post("/api/opportunities/claim", {
      multipart: {},
    });
    expect([400, 401]).toContain(res.status());
  });
});
