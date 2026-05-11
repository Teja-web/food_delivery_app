# Validation Checklist — Commit `28feaee` (Candidate Portal Phase 1 Foundation)

## 1. Schema / migration

- [ ] `auth.user.has_completed_onboarding` column exists in DB (boolean, NOT NULL, default `false`).
- [ ] Run `pnpm db:generate` — confirm a versioned migration file lands in `drizzle/` (commit author called for `db:push`, but per project rules a committed migration is required before merging to main).
- [ ] Verify default backfill: existing rows must get `false` so returning users hit `/welcome` once (or `true` if you want to skip onboarding for legacy accounts — decide explicitly).
- [ ] `drizzle/meta/_journal.json` updated and committed alongside the SQL.
- [ ] CI schema-drift gate passes (`db:generate` produces no uncommitted diff).

## 2. Routing & onboarding gate (`src/app/portal/page.tsx`)

- [ ] New user (`hasCompletedOnboarding=false`) hitting `/portal` → redirected to `/welcome`.
- [ ] Returning user (`hasCompletedOnboarding=true`) hitting `/portal` → redirected to `/dashboard`.
- [ ] Unauthenticated visit to `/portal` still routes through the auth guard (not the onboarding redirect).
- [ ] No infinite redirect loop between `/portal`, `/welcome`, `/dashboard`.
- [ ] Direct deep-link to `/dashboard` works for returning users; behavior for an un-onboarded user hitting `/dashboard` directly is intentional (allow vs. force back to welcome).

## 3. `completeOnboarding` server action (`src/actions/portal.ts`)

- [ ] Idempotent: calling twice does not error; second call is a no-op.
- [ ] "Skip" path with empty inputs flips the flag without writing preferences.
- [ ] With preferences (`situation`, `targetFunctions`, `targetLocations`) → values persisted on the candidate profile when `linkedCandidates.length > 0`.
- [ ] When no linked candidate exists, action still succeeds (only flips the flag).
- [ ] `requireCandidateContext()` rejects unauthenticated callers (no anonymous flag flip).
- [ ] After success, navigation lands on `/dashboard` (revalidate or client-side push).

## 4. `getPortalCandidateContext` + `PortalCandidateProvider`

- [ ] Wrapped in `react.cache` so the protected layout's call dedupes with any in-tree callers within one request.
- [ ] Layout no longer makes redundant session/candidate fetches (compare network/db calls vs. before).
- [ ] `usePortalCandidate()` throws clearly when used outside provider; `useMaybePortalCandidate()` returns `null` gracefully.
- [ ] Coach page (`coach/page.tsx`) still renders identically after migrating to context — no missing fields, no hydration mismatch.
- [ ] Context shape (`PortalCandidateContextValue`) exported from `src/operations/portal.ts` is what the client expects (initials, userName, linkedCandidates, activeApplications…).

## 5. Dashboard (`/dashboard`)

- [ ] Greeting renders correct first name (and falls back when `name` is empty).
- [ ] Heuristic advisory line composes from real data (interviews, offers, prep) — no hardcoded copy that survives an empty state.
- [ ] Stat tiles: Active applications / Interviews this week / Open offers / Prep streak — counts match what `/pulse` and `/interviews` show.
- [ ] "Up Next" surfaces upcoming interviews with countdown, active applications with stage, pending offers with expiry — order is by urgency.
- [ ] Quick Links navigate to the right routes (Coach, Roles, Assessments, Interviews, Pulse, Profile).
- [ ] Empty-state path: brand new user with zero applications still renders without crashing — uses `EmptyState`/`NudgeTray`.
- [ ] No layout shift on slow data loads (suspense or skeletons in place).

## 6. Welcome flow (`/welcome`)

- [ ] Step navigation: forward, back, skip all behave correctly; can't submit past the last step.
- [ ] Form state preserved when stepping back.
- [ ] Submit calls `completeOnboarding` then routes to `/dashboard`.
- [ ] Skip flow flips the flag without preferences (so user is not re-prompted on next login).
- [ ] Re-visiting `/welcome` after completion either redirects out or re-renders harmlessly (define expected behavior).

## 7. Portal shell nav (`portal-shell.tsx`)

- [ ] Apply group: Coach, Roles, Assessments, Interviews — each link active on the right path.
- [ ] Track group: Pulse, Profile — same.
- [ ] Active state styling: tinted, calmer per spec — no double-active when on a sub-route.
- [ ] Mobile/responsive: nav still usable at sm/md breakpoints.
- [ ] Dashboard and Welcome don't break the shell (header/footer/sidebar remain).

## 8. Design primitives (`EmptyState`, `EyebrowHeading`, `StatTile`, `NudgeTray`)

- [ ] Visual parity with the migrated Pulse client — no regression from previous Pulse design.
- [ ] `EmptyState` CTA renders both `href` (Link) and `onClick` (button) variants correctly.
- [ ] Components are fully typed (no `any`); accessibility: headings, button roles, focus states.
- [ ] Dark/light mode (if applicable) renders correctly.

## 9. Operations layer (`src/operations/portal.ts`)

- [ ] `getPortalCandidateContext` is org-scoped and respects the multi-candidate-link case (`ctx.linkedCandidates`).
- [ ] Active-applications query excludes terminal stages (`hired`, `rejected`, `withdrawn`) — confirm against existing pipeline taxonomy.
- [ ] No raw `db.select()` in pages — everything routed through operations per `CLAUDE.md`.
- [ ] `src/operations/schemas.ts` change is consistent with the new context shape.

## 10. Pulse migration

- [ ] Pulse renders identically (visual diff) before vs. after migration to design primitives.
- [ ] Reads from `usePortalCandidate()` context now, not from a separate fetch — confirm only one upstream call per request.

## 11. Tests / type checks / lint

- [ ] `pnpm typecheck` clean (especially around `PortalCandidateContextValue` propagation).
- [ ] Vitest gates around any pure helpers (greeting, advisory composition, stage filters).
- [ ] Playwright smoke: sign in as new user → land on `/welcome` → complete → land on `/dashboard` → reload → still `/dashboard`.
- [ ] Playwright smoke: sign in as legacy user (after backfill) → behavior matches the backfill decision in §1.

## 12. Risks worth a second look

- **`db:push` instead of `db:generate`** — the commit message explicitly says `pnpm db:push`, which violates project policy. Generate + commit migration before merging.
- **Onboarding flag on the `auth.user` table** — coupling product state to the auth schema is unusual; confirm the team is ok with it (alternative would be a `candidates`/profile-side flag).
- **Cached context** — `react.cache` only dedupes per-request; confirm no client component refetches the same data via an action and creates a second source of truth.
- **Heuristic advisory copy** — make sure the heuristic doesn't produce misleading or stale lines (e.g. "offer expires Friday" when offer was already accepted).