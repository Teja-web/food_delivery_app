# Milestone A — scope

The architecture doc (`docs/architecture.md:214`) defines Milestone A as:

> **Milestone A — Loop runs end-to-end on one project, Mode 1**
> *"Here is one project's loop running on its existing SDLC, with no AI agents touching it yet."*

This doc scopes the work concretely. The audit below shows ~70% of the infrastructure already exists; the remaining ~30% is **deterministic outcome assessment** plus a small amount of operator-side install work.

---

## Why Milestone A matters

Until Milestone A runs on a real repo with real GitHub traffic, every screen coznt ships is running on the seeded fixture. The autonomy ledger, the execution gate, the audit log — all functionally correct, all populated by `seed-sample-workspace.ts`. **Milestone A is the gate where coznt stops being a demo and starts being a system.**

The demo statement says it explicitly: *no AI agents in Mode 1.* Milestone A's signal comes entirely from observed human work — *did the PR merge cleanly, did the deploy succeed, did the gate pass without override.* That's enough to prove the loop is real. AI-agent signal layers on top in Milestone C.

---

## Audit — what's already there

| Piece | State | Where |
|---|---|---|
| Webhook ingest endpoint | ✓ Built | `src/app/api/v1/webhooks/[source]/route.ts` |
| `webhook_events` dedupe + insert | ✓ Built | (same) |
| Rules engine that fires on `webhook_event:insert` | ✓ Built | `src/lib/rules.ts:58` |
| Worker that drains pgmq + dispatches to tasks | ✓ Built | `scripts/worker.ts` + `src/lib/worker.ts` |
| `processWebhookEvent` task with GitHub handler | ✓ Built | `src/automations/tasks/process-webhook-event.ts` |
| `pull_request` event → execution gate evaluation | ✓ Built (this session) | (same) |
| `deployment_status` event → `recordDeployment` | ✓ Built | (same) |
| `skill_outcomes.projectId` + per-(skill, project) autonomy | ✓ Built | `src/db/schema/skill-outcome.ts`, `skill-autonomy.ts` |
| `recomputeSkillAutonomy` nightly + on-incident | ✓ Built | `src/operations/skill-autonomy.ts` |
| `recordDeployment` writes `deployments` table | ✓ Built | `src/operations/deployments.ts` |
| Adapter binding resolver (repo URL → projectId) | ✓ Built | `src/lib/integrations/resolve.ts` |
| `/integrations` UI for binding management | ✓ Built | `src/app/(app)/integrations/` |

The plumbing is essentially done. The missing piece is **what makes a `skill_outcome` materialise from a GitHub event** — that's the deterministic outcome assessor.

---

## What's missing

### 1. `src/domain/outcomes.ts` — deterministic outcome assessors

The file doesn't exist yet. It's a pure-function module that takes observed GitHub events and emits `skill_outcome` rows. Five assessors cover Milestone A's signal:

| Signal | Assessor | Verdict |
|---|---|---|
| PR merged, **no rollback within 7d**, **all required checks green** | `assessPrMerged` | `success` |
| PR **closed without merge after >24h open** | `assessPrAbandoned` | `rolled_back` (low severity) |
| PR merged then **reverted within 7d** | `assessPrReverted` | `rolled_back` (high severity) |
| Deploy **succeeded + no incident within 24h** | `assessDeployClean` | `success` |
| Deploy **rolled back or post-deploy incident < 24h** | `assessDeployIncident` | `incident` (critical if prod) |

Shape:

```ts
// src/domain/outcomes.ts
export interface OutcomeContext {
  organizationId: string;
  projectId: string;
  skillId: string;       // attribution from commit trailer
  /** Reference to the source event (PR ref, deploy id) — opaque string. */
  sourceRef: string;
  recordedAt: Date;
}

export type AssessorResult =
  | { verdict: "success"; severity: null; rationale: string }
  | { verdict: "rolled_back"; severity: "low" | "high"; rationale: string }
  | { verdict: "incident"; severity: "low" | "high" | "critical"; rationale: string }
  | { verdict: null; rationale: string }; // no-op — signal not actionable

export function assessPrMerged(pr: GhPullRequest, history: PrHistory): AssessorResult;
export function assessPrReverted(pr: GhPullRequest, revertCommit: GhCommit): AssessorResult;
// etc.
```

Pure functions, table-testable like `decideExecutionGate`. The plumbing layer (in `process-webhook-event.ts`) calls them and writes the `skill_outcome` row.

### 2. Skill attribution on non-PR events

For PR events, `attributeSkill` in `src/lib/integrations/skill-attribution.ts` parses commit trailers. **That works.** For *deploy* events, attribution has to be derived — the deploy's `sha` maps to a commit; the commit's trailer attributes the skill. New helper: `attributeSkillFromCommitSha(sha, ownerRepo, installationId)` that fetches the commit message via GitHub API and parses the trailer.

When attribution can't be found, the outcome falls back to `skillId: null` (legacy / org-wide pattern). That's still useful — it just doesn't feed any specific skill's autonomy.

### 3. The follow-up scheduler — "no rollback within 7d"

Most assessors aren't synchronous on the merge/deploy event itself. *"PR merged with no rollback within 7d"* requires observing the absence of a revert for 7 days. Three options, in increasing order of correctness:

| Option | Mechanism | Pros / cons |
|---|---|---|
| **A: Periodic batch** | Cron job nightly that scans `deployments` + `webhook_events` for the last N days and emits any newly-ripe outcomes | Cheap; the standard pattern. Latency up to 24h. |
| **B: Per-event scheduled job** | When a PR merges, enqueue a pgmq message with `vt = now + 7d` to re-assess | More precise. Uses pgmq's visibility timeout as a delay queue. |
| **C: Trigger-based** | On revert detection, look back for the original merge and emit a `rolled_back` outcome retroactively | Cleaner semantics but more bookkeeping. |

**Recommendation: A first** — a `scripts/assess-outcomes.ts` cron job, written to be idempotent. It scans the last 7 days of merged PRs that don't yet have a `skill_outcome` row attached, applies the assessor, writes the outcome. ~1 day of work. B and C are improvements.

### 4. GitHub App registration + installation on a real repo

Already documented in `docs/github-app-setup.md`. Out-of-band — coznt operator does it once per environment, customer org-admin installs the App on their target repo. Three env vars:

```bash
COZNT_GITHUB_APP_ID=<from App settings>
COZNT_GITHUB_APP_PRIVATE_KEY=<PEM>
COZNT_GITHUB_WEBHOOK_SECRET=<chosen>
```

Without these set: gate still evaluates, just doesn't POST check-runs back to GitHub. So this isn't a code blocker for Milestone A — it's a *visibility* blocker.

### 5. Webhook signature verification

`src/app/api/v1/webhooks/[source]/route.ts` currently uses bearer-token auth (the customer pastes their coznt API key into GitHub). GitHub Apps deliver via HMAC-signed payloads using a secret — those won't pass the bearer check. New code path: when a request comes in with an `X-Hub-Signature-256` header, verify against `COZNT_GITHUB_WEBHOOK_SECRET` instead of demanding a bearer token.

~0.5 day. The two auth paths can coexist (bearer for direct integrations, HMAC for the GitHub App).

### 6. A bound-real-repo smoke test

Once 1–5 land, the loop runs end-to-end against a staging repo. Verification:

```
Open PR with `Made-by: frontend-test-author` trailer →
  webhook arrives → /api/v1/webhooks/github verifies HMAC →
  webhook_events row inserted → worker picks it up →
  handleGitHub() → runExecutionGate() → POSTs check-run →
  PR merges → next webhook (closed=true, merged=true) →
  assessPrMerged() → skill_outcomes row written →
  recomputeSkillAutonomy() runs → skill_autonomy updates →
  visible on /skills/[id]
```

Run this in CI as a daily smoke check using a dedicated test repo. ~1 day to wire the test harness.

---

## What's NOT in Milestone A

Deliberately out of scope (these are Milestone B–E):

- **AI agent autonomy** — Milestone C onward. A is "no agents touching it yet"; agents earn autonomy *from* Milestone A's signal, but they don't produce it.
- **Cross-project rollup** — Milestone B (already partly built — H1/H5).
- **Deployment Protection Rules** — secondary execution gate, in the execution-gate-plan.md doc, separate piece of work.
- **MCP server enterprise distribution** — Milestone E (Devin's surface). Not npm — coznt is for governed orgs whose supply-chain policy won't tolerate public-registry pulls. Likely path: bundled with the coznt deployment, served from the customer's coznt instance (`/install/coznt-mcp.tgz` or signed binary), with the IDE config pointing at the local install path. Final shape is a Milestone E decision.
- **Real outcome assessors for Jira / ADO / Confluence** — Milestone A is GitHub-only. Other adapters wait for proven demand.
- **DSSE / cryptographic signing of audit log** — explicitly punted in `architecture.md:256` and softened in positioning.md. v2 surface.

---

## Rollout — 5 days

| Day | Work |
|---|---|
| 1 | `src/domain/outcomes.ts` — five assessor functions + unit tests (table-driven, like `execution-gate.test.ts`) |
| 2 | Wire assessors into `process-webhook-event.ts` for synchronous-on-merge cases (assessPrReverted, assessDeployIncident); skill-attribution-from-sha helper |
| 3 | `scripts/assess-outcomes.ts` cron + idempotency markers on `skill_outcomes` so re-runs don't duplicate |
| 4 | Webhook HMAC verification path; `.env.example` updates; smoke test harness scaffolding |
| 5 | End-to-end run on a staging repo with the GitHub App installed; surface any seams; document what an operator does for a first install |

**Acceptance criteria** — Milestone A is done when:

1. A new PR opened on a coznt-bound staging repo with a skill attribution trailer produces a `skill_outcome` row within 1 minute of merge (success path) or revert (rolled_back path).
2. `recomputeSkillAutonomy` for that skill+project picks up the new outcome on its next run and reflects the changed level on `/skills/[id]`.
3. The execution gate's check-run on a fresh PR by the same skill reflects the post-Milestone-A autonomy level (which may be different from the seeded level).
4. `/audit` filtered to `scope=skills` shows the full chain of events for the test PR, with deterministic hashes.

That set is the *physical* version of the loop diagram on the marketing landing page.

---

## What customers see when Milestone A ships

Before A: every coznt screen shows seeded data. The autonomy ledger updates only when someone manually records an outcome (or `recomputeSkillAutonomy` runs against the fixture).

After A: a customer team binds their staging repo. Engineers add `Made-by: <skill-slug>` trailers to commits when they used a coznt-managed skill to help. PRs merge. Coznt watches. Within a few weeks the autonomy ledger has real receipts — *"`frontend-test-author` has 12 clean merges on this repo in the last 30 days; 30-day rolling success rate 94%; promoted to Senior at 2026-06-04."* That promotion has *real* receipts behind it, not seeded ones. The trust earned moment becomes load-bearing.

This is the smallest version of the loop that's externally credible.

---

## Open questions to settle while building

1. **What counts as a "rollback" for `assessPrReverted`?** Revert commit detected by message pattern (`Revert \"...\"`)? An explicit `Reverts: <sha>` trailer? Look at PR labels? Recommend: support all three, weight by reliability.
2. **For deploy assessment, what's the "incident window"?** v1 says 24h. Should it adapt per-environment (production: 24h, staging: 4h)?
3. **What about PRs with no skill attribution at all?** Today they just don't generate outcomes. Should we record `skillId: null` outcomes per-project for completeness, so DORA aggregates have a complete signal? Probably yes — opt-out per project.
4. **The cron schedule for `assess-outcomes.ts`** — hourly? daily? The 7-day lookback means latency floor is one cron tick. Hourly is cheap and gives a much tighter feedback loop.

---

## Implementation status (2026-05-14)

Days 1–4 landed; day 5 (live run against a bound staging repo) is the operator-side step that's documented but cannot be executed from this session.

| Day | Artifact | Status |
|---|---|---|
| 1 | `src/domain/outcomes.ts` + `tests/outcomes.test.ts` | ✅ landed — 28 table-driven tests, pure-function assessors with the spec's `AssessorResult` shape |
| 2 | `attributeSkillFromCommitSha` + `detectRevert` helpers; synchronous `assessPrReverted` / `assessPrAbandoned` / `assessDeployIncident` wired into `process-webhook-event.ts`; `recordAssessorOutcome` writer | ✅ landed |
| 3 | `skill_outcomes.{source_kind,source_ref,rationale}` columns + partial unique index (migration `drizzle/0000_uneven_boomer.sql`); shared `runOutcomeAssessment()` in `src/automations/tasks/assess-outcomes.ts`; pg_cron job `coznt:assess-outcomes` registered in `scripts/db-setup.ts` `setupCronJobs()` (SQL enqueues a `cron_tick` event onto `coznt_events` → worker → `rules.ts` → `assessOutcomesTask`); `pnpm assess-outcomes` retained as the local-dev / manual-run path; idempotent via partial unique index + `ON CONFLICT DO NOTHING` | ✅ landed |
| 4 | HMAC verification path on `/api/v1/webhooks/github` (coexists with bearer auth); `.env.example` adds `COZNT_GITHUB_APP_*`, `COZNT_GITHUB_WEBHOOK_SECRET`, `COZNT_TEST_INSTALLATION_ID`; `tests/github-webhook-hmac.test.ts` + `tests/skill-attribution.test.ts`; `scripts/smoke-milestone-a.ts` end-to-end harness; `pnpm smoke:milestone-a` script | ✅ landed |
| 5 | `docs/milestone-a-operator-install.md` operator runbook; acceptance verification awaits a live bound staging repo | 📘 docs landed; ⏳ live run is operator-side |

**Test summary:** `pnpm test` → 79 passing across 6 files (28 outcomes, 12 attribution, 7 HMAC, plus existing execution-gate + skill-autonomy + intel suites). `pnpm type-check` clean.

**Known v1 limits worth flagging in PR descriptions:**

- `assess-outcomes.ts` deploy-clean attribution requires `COZNT_TEST_INSTALLATION_ID` because adapter bindings don't yet persist a per-binding `installationId`. Tracked in `docs/milestone-a-operator-install.md` troubleshooting table.
- The cron's pr_merge assessor uses `gate_evaluations` as a proxy for "PR merged" (no per-PR merge table exists yet). False positives are bounded by the synchronous revert handler always running first.
- Skill attribution requires the original commit's message to contain the trailer; revert PRs attribute via SHA-match (preferred) or title-match (fallback) against `gate_evaluations`.

