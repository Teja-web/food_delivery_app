# Pre-prod fix plan — `28feaee..HEAD`

Concrete plan to address the 8 must-fix items from `post-28feaee-deep-analysis.md`. Phased so each phase is independently mergeable. Estimated total: ~2 focused days for one engineer.

---

## Phase A — Stop the bleeding (0.5 day)

Items that close the live attack/abuse surfaces. Land first.

### A1. Move state-mutating GETs to consent-button POSTs

**Affected:** `/api/opportunities/claim`, `/api/campus/claim`.

**Approach.** Don't try to retrofit CSRF tokens. Introduce a tiny server-rendered confirmation page that the auth flow lands on. Page renders a form whose submit button POSTs to the existing route. The handler then runs the same mutation it does today.

**File-by-file:**

1. **`src/app/api/opportunities/claim/route.ts`**
   - Rename `export async function GET` → `export async function POST`.
   - Reject same-origin via `Origin` header equality with `req.nextUrl.origin` (defense in depth — SameSite=Lax cookies already block cross-origin POST cookie attachment).
   - Keep all current resolution + idempotent application creation logic.
   - On unauthenticated POST: return 401 (POST shouldn't redirect-bounce; the page handles auth state).
   - Replace the `try { … } catch {}` blocks with discriminated handling: re-throw on non-unique-violation errors; log unexpected ones via `console.error`.

2. **New: `src/app/opportunities/claim/page.tsx`** (note: NOT under `(portal)/(protected)`)
   - Server component reads `slug` and `ref` from searchParams.
   - If unauthenticated: redirect to `/auth/sign-in?mode=candidate&callbackUrl=/opportunities/claim?slug=…&ref=…` (this is a normal page redirect — fine on GET).
   - If authenticated: resolve role (via slug or ref) for display; render a single page with role title + "Apply to this role" button inside `<form method="POST" action="/api/opportunities/claim">` carrying hidden `slug` + `ref` inputs.
   - Add a "Cancel" link back to `/opportunities`.

3. **`src/app/opportunities/[slug]/page.tsx:158-159`**
   - Change CTA href from `/api/opportunities/claim?slug=…` to `/opportunities/claim?slug=…`.

4. **`src/app/r/[token]/route.ts:59`**
   - Change redirect from `/api/opportunities/claim?ref=…` to `/opportunities/claim?ref=…`.

5. **Mirror the same shape for campus:**
   - `src/app/api/campus/claim/route.ts`: GET → POST, same Origin check, return 401 on no session.
   - New `src/app/campus/claim/page.tsx`: same confirmation pattern with the university name in the heading and a "Join {university}" button.
   - Update any campus invite URLs in `src/operations/campus.ts` (the link issued to the student) to point at `/campus/claim?token=…` instead of the API route.

**Acceptance:**
- `<img src="/api/opportunities/claim?slug=X">` no longer creates an application.
- Original UX still works: click CTA → bounce-to-sign-in → land on confirmation page → click "Apply" → application created → /dashboard?reveal.
- Same for campus invite click-through.

**Estimate:** 3–4 hours.

---

### A2. Authorize `createReferral` to roles the issuer has visibility of

**Affected:** `src/operations/referrals.ts`, `src/actions/referrals.ts`.

**Visibility rule:** the issuer can refer a role iff *any* of:
- The issuer is a member of `role.organizationId` (recruiter referral)
- `role.publicVisibility !== 'private'` (public funnel reshare)
- The issuer's candidate row has an existing application to that role (the candidate-to-friend referral, the most common legitimate case)

**File-by-file:**

1. **`src/operations/referrals.ts:createReferral`**
   - After the role-exists check, add a visibility check. Pull `role.organizationId` and `role.publicVisibility` in the same select.
   - Membership check: `auth.member` table — `exists where userId = ctx.userId AND organizationId = role.organizationId`.
   - Candidate application check: resolve `candidates.id` for `userId` via `ensurePortalCandidate`'s reverse lookup (or join `candidates.email = user.email`), then `exists in applications WHERE candidate_id = … AND role_id = role.id`.
   - Throw `ForbiddenError("Cannot refer this role")` if none match.

2. **`src/actions/referrals.ts:createReferralAction`**
   - Catch `ForbiddenError` and return `{ ok: false, reason: "forbidden" }` instead of bubbling a 500.

**Acceptance:** the abuse path (mint referral for unrelated private role) returns Forbidden. Legitimate path (candidate refers a role they applied to) still works.

**Estimate:** 1–2 hours.

---

### A3. Atomic `validateReferral` + `markReferralClaimed`

**Affected:** `src/operations/referrals.ts`, `src/app/api/opportunities/claim/route.ts`.

**File-by-file:**

1. **New op `claimReferralAtomic(token, candidateId)` in `src/operations/referrals.ts`:**
   ```sql
   UPDATE referrals
      SET claimed_by_candidate_id = $candidateId,
          claimed_at = COALESCE(claimed_at, now()),
          status = CASE WHEN single_use THEN 'used' ELSE status END
    WHERE signed_token = $token
      AND status = 'active'
      AND expires_at > now()
      AND (NOT single_use
           OR claimed_by_candidate_id IS NULL
           OR claimed_by_candidate_id = $candidateId)
    RETURNING *;
   ```
   Returns `{ ok: true, referral } | { ok: false, reason: 'not_found' | 'expired' | 'revoked' | 'used' }`. To distinguish reasons when the UPDATE returns 0 rows, do a single follow-up SELECT to read current state.

2. **Replace call sites:**
   - `src/app/api/opportunities/claim/route.ts` — replace the `validateReferral` + `markReferralClaimed` pair with one `claimReferralAtomic` call.
   - `fetchReferralForLanding` (read-only) keeps `validateReferral` as a pure check — no atomicity issue there.

3. **Keep `validateReferral` exported** for the read-only landing page banner, but mark `markReferralClaimed` as deprecated/internal.

**Acceptance:** two parallel claims of a single-use token → exactly one wins; the loser gets `{ ok: false, reason: 'used' }`.

**Estimate:** 1–2 hours.

---

## Phase B — Plug the data integrity gaps (0.5 day)

### B1. Server-side k-anonymity gate on `_setRolePublicVisibility`

**Affected:** `src/operations/roles.ts:setRolePublicVisibility`, `src/actions/roles.ts:setRolePublicVisibilityAction`.

**File-by-file:**

1. **`src/operations/roles.ts`** — at the top of `setRolePublicVisibility`, after the enum guard:
   ```ts
   if (visibility !== "private") {
     const profile = await getOrgPublicProfile(); // already exists in this file
     if (!profile) {
       throw new VisibilityError("no_public_profile");
     }
     const bucket = await bucketSize(profile);
     if (visibility === "anonymized" && !bucket.ok) {
       throw new VisibilityError("k_anonymity_blocked");
     }
   }
   ```
   Define a small `VisibilityError extends Error` with a typed `reason`.

2. **`src/actions/roles.ts:setRolePublicVisibilityAction`** — catch and translate to a return shape `{ ok: false, reason }`. Update the calling client component (`RolePublicVisibilityCard`) to surface the error toast.

3. **Client-side double-check (optional cleanup):** the existing UI warning stays; this is just defense in depth.

**Acceptance:** direct call to `setRolePublicVisibilityAction(roleId, 'anonymized')` with bucket=`blocked` returns `{ ok: false, reason: 'k_anonymity_blocked' }` — never writes the column.

**Estimate:** 1 hour.

---

### ~~B2. Wire match scoring on `application:insert`~~ — DROPPED

Original concern: a public-funnel applicant shows up in the Pipeline tab with no fit score.

**Why it's actually fine.** Match scoring is candidate/role-driven, not application-driven:
- `candidate:insert` rule → `evaluateMatchesForCandidate` creates `matches` rows for all open roles the new candidate fits.
- `role:insert` rule → `evaluateMatchesForRole` does the inverse direction.
- `matches` has `unique(role_id, candidate_id)` so the row exists exactly once per pair.
- The match worker already back-fills `applications.matchId` for unlinked rows (`src/automations/tasks/match.ts:285-289` — `db.update(applications).set({ matchId }) … isNull(applications.matchId)`).

When a portal candidate signs up + applies, `ensurePortalCandidate` triggers `candidate:insert` and `createPortalRoleInterest` creates the application with `matchId=null`. The worker creates the match within seconds and stamps `matchId` on the unlinked application. The pipeline-side leftJoins all degrade gracefully during the gap.

Adding `evaluateMatchForApplication` to `application:insert` would duplicate the LLM call for the same `(role, candidate)` pair — wasted spend, no new signal.

**No code change.** The "bug" was my misread; the existing rules cover it.

---

## Phase C — Operational guardrails (0.5 day)

### C1. Rate limiting

**Affected:** new `src/lib/rate-limit.ts`, plus call-site instrumentation.

**Approach.** Lightweight DB-backed sliding window — single Postgres table, no Redis. Good enough for the current scale; swappable later.

**File-by-file:**

1. **New schema `src/db/schema/rate-limits.ts`:**
   ```ts
   dillizntSchema.table("rate_limits", {
     key: text("key").primaryKey(),       // e.g. "claim:ip:1.2.3.4" or "refer:user:abc"
     count: integer("count").notNull().default(0),
     windowStart: timestamp("window_start").notNull().defaultNow(),
   });
   ```
   Add to `src/db/schema/index.ts` exports.

2. **New util `src/lib/rate-limit.ts`:** `checkRateLimit(key, max, windowMs)`. Single UPSERT that resets the window when expired and increments otherwise. Returns `{ ok, remaining, resetMs }`.

3. **Apply at edges:**
   | Edge | Key | Limit |
   |------|-----|-------|
   | `POST /api/opportunities/claim` | `claim:ip:{ip}` | 30 / 10min |
   | `POST /api/campus/claim` | `campus:ip:{ip}` | 30 / 10min |
   | `GET /r/[token]` | `r:ip:{ip}` | 60 / 10min |
   | `GET /api/public/opportunities` | `pub:ip:{ip}` | 120 / 10min |
   | `createReferralAction` | `refer:user:{userId}` | 20 / hour |

   Read IP from `req.headers.get("x-forwarded-for")?.split(",")[0]`. On limit hit return 429 (or `{ ok: false, reason: "rate_limited" }` for actions).

4. **Add to drizzle migration set in Phase D.**

**Acceptance:** 21st referral creation in an hour → forbidden. 31st claim attempt from one IP in 10 min → 429.

**Estimate:** 2–3 hours.

---

### C2. Discriminate the two empty `try { … } catch {}` blocks in claim route

**Affected:** `src/app/api/opportunities/claim/route.ts`.

**File-by-file:**

1. After Phase A1 turns this into POST, replace `try { createPortalRoleInterest } catch {}` with:
   ```ts
   try {
     await createPortalRoleInterest(candidate.id, role.id);
   } catch (err) {
     // recruit_pipeline_role_candidate_uniq violation = already applied → fine
     if (!isUniqueViolation(err, "recruit_pipeline_role_candidate_uniq")) {
       console.error("createPortalRoleInterest failed", { err, candidateId: candidate.id, roleId: role.id });
       return new NextResponse("application_create_failed", { status: 500 });
     }
   }
   ```
2. Same shape for the referral stamping block — log unexpected errors (no-op on already-claimed). Add `isUniqueViolation` helper to `src/lib/db-errors.ts` if it doesn't exist.

**Estimate:** 30 min. Bundle with A1.

---

## Phase D — Migrations + workflow (0.5 day)

### D1. Generate the missing drizzle migrations

**Affected:** `drizzle/` directory.

**File-by-file:**

1. Run `pnpm db:generate` — drizzle-kit will diff `src/db/schema/index.ts` against the meta of `0008` and produce one big migration `0009_*.sql` covering: `auth.organization.public_profile`, `roles.public_visibility / public_slug / vendor_visibility / exclusive_vendor_org_id`, `candidates.organization_id` nullable, `org_candidates.added_by_*` + new index, `applications.submitted_by_org_id` + composite index, `vendor_partnerships`, `vendor_invitations`, `referrals`, `campus_invites`, `student_profile`-related candidate columns, `rate_limits` (from C1).
2. **Cross-check the generated SQL** against the schema files — drizzle-kit sometimes orders FK creates oddly or misses index renames. Hand-edit if needed.
3. Commit `0009_*.sql` and the updated `drizzle/meta/_journal.json` + snapshot.
4. **Backfill SQL** — the Phase 1 backfill at `docs/migrations/2026-05-08-phase1-org-candidates-backfill.sql` is a one-time data migration; not part of the drizzle migration. Add three more next to it:
   - `2026-05-09-applications-submitted-by-org-id.sql`: backfills `submitted_by_org_id = organization_id` for legacy non-vendor rows? (No — leave NULL; nullable column, queries handle it. Skip.)
   - `2026-05-09-roles-default-visibility.sql`: NOT NEEDED — schema default is `'private'`.
   - **None required** — all new tables are empty, all new columns are nullable or have defaults.

### D2. Pick a workflow: `db:push` or `db:generate + db:migrate`

The project currently does both: drizzle migrations 0000-0008 + schema-only changes via `db:push` for the recent branch. **Pick one.** Recommendation:

- **Use `db:generate` + `db:migrate` for prod** (audit trail).
- Keep `db:push` for local dev iteration only.
- Add to **`CLAUDE.md`** under a new "Migrations" section: "When adding a column, run `pnpm db:generate` and commit the SQL alongside the schema change. Never deploy `db:push` to prod."
- Add a CI gate that fails if `git diff src/db/schema/` is non-empty without a corresponding `drizzle/00XX_*.sql` change.

**Estimate:** 1–2 hours including verification.

---

## Phase E — e2e test coverage (0.5–1 day)

The project uses Playwright (`pnpm e2e`), not vitest, for behavior verification. The existing structure (`e2e/`) already has:
- Two auth personas: `auth.setup.ts` → `.auth/admin.json`, `auth.portal.setup.ts` → `.auth/portal.json`
- Serial chains: each project depends on a prior one and shares state via `e2e/helpers/state.ts`
- Helpers: `wizard.ts` (role wizard), `verify.ts` (data integrity), `tours.ts` (overlay dismissal), `lifecycle.ts`, `state.ts`
- Tracks: `team-track/` (recruiter), `candidate-track/` (portal user), `vendor-track/` (1 spec exists), `cross-cutting/` (smoke + multi-tenant + org-settings)

**Strategy.** Don't add per-function unit tests. Add focused e2e specs that exercise the must-fix behaviors through the real UI/API — same shape as existing tracks. One test-only API helper for things the UI can't drive (concurrency races).

### E1. New / updated specs

| # | File | Track / project | What it covers | Maps to fix |
|---|------|-----------------|----------------|-------------|
| 1 | **NEW** `e2e/tests/cross-cutting/csrf-claim-routes.spec.ts` | `cross-cutting` | (a) Cross-origin `fetch` to `/api/opportunities/claim` with `Origin: https://evil.example` returns 403/401, no application row created. (b) `<form action="…/api/opportunities/claim">` from same origin succeeds. (c) GET to the API route returns 405. (d) Same three cases for `/api/campus/claim`. | A1 |
| 2 | **NEW** `e2e/tests/candidate-track/09-public-funnel.spec.ts` | `candidate-track` (no auth fixture — uses an incognito context) | (a) Stranger visits `/opportunities/<slug>` → CTA goes to `/opportunities/claim?slug=…` (page, not API). (b) Click "Apply" → bounce to sign-in → sign up → land on confirmation page → click "Apply" → `/dashboard?reveal=<slug>` with RevealCard. (c) `/r/<token>` redirects to public landing with `?ref=…`. (d) Reveal banner shows referrer name + message. (e) Replay `claim` → same redirect, no duplicate application. | A1 + A3 + A2 |
| 3 | **NEW** `e2e/tests/vendor-track/02-referral-abuse.spec.ts` | `vendor-track` | After `01-vendor-flow` completes (vendor org exists with active partnership), a second-org user (or vendor user) tries to mint a referral for an unrelated *private* role of the hiring org. Expect 403/forbidden. Then the same user mints a referral for a role they have an application to → succeeds. | A2 |
| 4 | **NEW** `e2e/tests/cross-cutting/referral-race.spec.ts` | `cross-cutting` | Issuer creates a single-use referral. Two parallel `fetch()` POSTs to `/api/opportunities/claim?ref=…` from two different signed-in candidate sessions. Exactly one ends up with `claimedByCandidateId = self`; the other gets `{ ok: false, reason: "used" }`. Use `Promise.all` to fire both within the same tick. | A3 |
| 5 | **NEW** `e2e/tests/team-track/08-public-visibility.spec.ts` | `team-track` (after `01-create-role`) | (a) Recruiter opens `RolePublicVisibilityCard` with no `org.publicProfile` set → "Anonymized" option is disabled and an error toast surfaces if forced via direct action call. (b) Set publicProfile to a quadruple with bucket < 3 → "Anonymized" rejects with `k_anonymity_blocked`. (c) Set valid quadruple → "Anonymized" succeeds, slug appears, role lands on `/opportunities`. (d) Flip back to "Private" → slug retained but listing 404s. | B1 |
| 6 | **NEW** `e2e/tests/cross-cutting/rate-limit.spec.ts` | `cross-cutting` | Hammer `/api/public/opportunities` 130× in quick succession from one Playwright context → first 120 succeed, rest 429. Same shape for `/api/opportunities/claim` POST (30/10min). For `createReferralAction`: 21st referral creation in an hour returns rate-limited error. | C1 |
| 7 | **UPDATE** `e2e/tests/vendor-track/01-vendor-flow.spec.ts` | `vendor-track` | Add a step that creates a referral as a vendor user for a role outside the partnership → expect 403 (closes the abuse path). Add a step that toggles partnership to `paused` and verifies the vendor's NEXT page request shows zero roles (the no-cache contract). | A2, vendor scope sanity |
| 8 | **UPDATE** `e2e/tests/cross-cutting/multi-tenant.spec.ts` | `cross-cutting` | Extend with a vendor-scope assertion: vendor in Org V partnered with Org A cannot see Org B candidates even when navigating directly to known IDs. Cross-org candidate read returns 404/empty. | Vendor scope (existing) |

### E2. Test-only helper — concurrency races

Add `e2e/helpers/concurrent.ts`:
```ts
export async function fireConcurrent<T>(
  fns: Array<() => Promise<T>>,
): Promise<Array<{ ok: true; value: T } | { ok: false; error: unknown }>> {
  return Promise.all(
    fns.map(async (fn) => {
      try { return { ok: true as const, value: await fn() }; }
      catch (error) { return { ok: false as const, error }; }
    }),
  );
}
```
Used by spec #4 to fire two POSTs in the same tick from two independent `request` contexts.

### E3. Test-only API surface

Two of the specs need to bypass the UI:
- **CSRF**: drive raw cross-origin `fetch` via `request.post(url, { headers: { Origin: "https://evil.example" } })`.
- **Race**: simultaneous POSTs from two contexts.

Both use Playwright's `request` fixture — no new server-side test endpoints needed. The existing `e2e/helpers/verify.ts` pattern of using the public `/api` from tests is fine.

For the visibility-card test (#5) we need to programmatically poison `org.publicProfile` to a sub-floor quadruple. Two options: (a) drive the `/recruit/settings/identity` UI with playwright (slow but real), or (b) call a small admin-only seed action. Pick (a) — there's already an org-settings spec that drives that page.

### E4. playwright.config.ts updates

Add five new project entries (mirroring existing patterns). For the CSRF and rate-limit specs, no `storageState` is needed — they create their own contexts. For the visibility spec, depend on `team-01-role`. For the public-funnel spec, depend only on `auth` (the spec creates its own role + flips it public).

```ts
{ name: "team-08-visibility",     testMatch: "tests/team-track/08-public-visibility.spec.ts",
  use: { storageState: "e2e/.auth/admin.json" },  dependencies: ["team-01-role"] },

{ name: "candidate-09-public",    testMatch: "tests/candidate-track/09-public-funnel.spec.ts",
  // Intentionally no storageState — exercises sign-up flow
  dependencies: ["team-08-visibility"] },

{ name: "vendor-02-referral",     testMatch: "tests/vendor-track/02-referral-abuse.spec.ts",
  use: { storageState: "e2e/.auth/admin.json" },  dependencies: ["vendor-01-flow"] },

{ name: "cross-csrf",             testMatch: "tests/cross-cutting/csrf-claim-routes.spec.ts",
  dependencies: ["team-01-role"] },

{ name: "cross-referral-race",    testMatch: "tests/cross-cutting/referral-race.spec.ts",
  use: { storageState: "e2e/.auth/portal.json" },  dependencies: ["candidate-09-public"] },

{ name: "cross-rate-limit",       testMatch: "tests/cross-cutting/rate-limit.spec.ts",
  dependencies: ["team-08-visibility"] },
```

### E5. Keep `tests/anonymize.test.ts` (vitest)

This is the only existing vitest test and it works at the right granularity — it pins the security-boundary DTO via snapshot. **Don't migrate** to Playwright; pure-function snapshot is faster and tighter than driving the UI. Keep `pnpm test` running just this one file.

### E6. Update `e2e/COVERAGE.md`

The repo has a coverage tracker — add the new specs to it so future-you can see what's covered.

### Estimate

- Cross-cutting CSRF + rate-limit + race: 3 hours (mostly thinking through the cross-origin fetch from Playwright's request context)
- Public funnel happy path (incognito): 2 hours (sign-up + reveal)
- Visibility k-anon: 2 hours
- Vendor referral-abuse + multi-tenant updates: 1.5 hours
- Helper + config wiring + COVERAGE.md: 0.5 hour

**Total: ~1 day.** Land as the last PR after Phases A–D are in.

---

## Sequencing & rollout

```
Day 1 morning:    A1 (CSRF posts) ─┐
                  A2 (referral auth) ┤── PR 1
                  A3 (atomic claim) ─┘

Day 1 afternoon:  B1 (k-anon gate)  ─┐── PR 2
                  C2 (catch blocks)  ┘

Day 2 morning:    C1 (rate limit)   ── PR 3
                  D1 (migrations)   ─

Day 2 afternoon:  E1 (e2e specs)    ── PR 4

Total:            ~2 working days, 4 PRs
```

### Out of scope for this fix plan

These were called out in the analysis but are not blockers:
- BETTER_AUTH_SECRET fallback for slug HMAC (document it; future hardening)
- Career-path explorer caching (cost optimization)
- RoleDetailClient.tsx further trim (housekeeping)
- Referral expiry sweeper / status flip worker (cosmetic)
- Magic-string sentinel `__no_partnerships__` in vendor scope (cleanup)

### Smoke test checklist before deploy

1. Recruiter flips a role to `anonymized` with sub-floor bucket → fails with clear error (B1).
2. Stranger embeds `<img src="/api/opportunities/claim?slug=X">` or cross-origin `<form>` → no application created (A1).
3. Two browsers race to claim a single-use referral → one wins, the other shows "already used" (A3).
4. Signed-in user tries to mint a referral for an unrelated private role → 403 (A2).
5. Curl `/api/public/opportunities` 130 times in 10min from one IP → first 120 succeed, rest 429 (C1).
6. Schema diff vs drizzle: `pnpm db:generate` produces empty diff (D1).
7. `pnpm e2e` green; `pnpm test` (anonymize) green (E1).
