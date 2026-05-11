/**
 * Verify atomic single-use referral claiming under concurrent races.
 *
 * Two parallel POSTs to /api/opportunities/claim?ref=<token> from two
 * separate signed-in candidate sessions. With `claimReferralAtomic` (single
 * UPDATE…RETURNING with the validity predicate inline) exactly one request
 * should claim the token; the other should observe the post-claim state
 * (used).
 *
 * Both POSTs may succeed in creating their own application — this is fine,
 * the test asserts on the referral row, not application count. What we care
 * about is: only ONE candidate ends up stamped on the referral.
 *
 * NOTE: This spec relies on a referral being seeded by the test harness or
 * issued via the createReferralAction. To keep the spec self-contained, we
 * call the public landing endpoint to issue + redeem rather than poking the
 * DB directly. If the issuer flow is unreachable in this env, skip with a
 * clear note rather than fail.
 */

import { test, expect } from "@playwright/test";

test("referral race: only one of two parallel claims wins (single-use)", async () => {
  // This spec is a placeholder until the referral-issuance helper exists.
  // Building a robust race test requires:
  //   1. A pre-existing role visible to the issuer
  //   2. An issuer who can mint the referral (member or has-applied)
  //   3. Two distinct candidate accounts to race the claim
  //
  // The plumbing is straightforward but requires test fixtures we don't
  // have yet. Mark as fixme until the e2e DB seed includes a referral-
  // ready role + two candidates.
  test.fixme(true, "needs candidate-track race fixtures (deferred)");

  expect(true).toBe(true);
});
