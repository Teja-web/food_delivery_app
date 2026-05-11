/**
 * Rate-limit verification on the unauthenticated public surface.
 *
 * Limit enforcement lives in `src/proxy.ts` (the Next 16 request proxy,
 * f.k.a. middleware) backed by the Postgres sliding window in
 * `src/lib/rate-limit.ts`. The `/api/public/opportunities` policy is
 * 120/10min/IP. This spec hammers the endpoint past the threshold and
 * verifies the proxy returns a 429.
 *
 * Note: on a shared-IP test runner this test can interfere with itself if
 * other tests in the same window also hit the public endpoint. The
 * limiter keys off IP only.
 */

import { test, expect } from "@playwright/test";

test("public-opportunities returns 429 once the per-IP limit is exceeded", async ({ request }) => {
  test.setTimeout(60_000);

  // Threshold is 120/10min. Fire 130 in tight sequence.
  const responses: number[] = [];
  for (let i = 0; i < 130; i++) {
    const res = await request.get(`/api/public/opportunities?_t=${i}`);
    responses.push(res.status());
    if (res.status() === 429) break;
  }

  const success = responses.filter((s) => s === 200).length;
  const limited = responses.filter((s) => s === 429).length;

  expect(success, "should have at least 100 successes before limiting").toBeGreaterThanOrEqual(100);
  expect(limited, "should have hit at least one 429").toBeGreaterThanOrEqual(1);
});
