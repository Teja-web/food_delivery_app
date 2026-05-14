# Execution Gate — scope

The MCP server gives the agent **read context and discipline writes**. It does not block a merge. Today the autonomy ledger can say "this skill is at Intern level" — but nothing physically prevents an Intern-level skill from merging a payments PR. The execution gate fixes that.

This doc scopes the work. It is not a build plan yet — it's the thing to review before scheduling.

---

## Where the gate sits

Three integration points, in priority order:

1. **GitHub Checks API on every PR (primary)** — coznt registers as a required status check. When a PR opens, coznt evaluates and returns `success` / `failure` / `neutral`. GitHub blocks the merge UI when required checks fail. This is the load-bearing point — it's where the autonomy decision becomes physically enforced.
2. **Deployment Protection Rules (secondary)** — GitHub's API for gating production deploys behind external approval. Coznt approves or rejects the deploy based on the skill's autonomy level for the target environment. Catches the *post-merge* path.
3. **Jira / ADO workflow webhooks (deferred)** — for orgs that gate work-item transitions, coznt can reject a workflow transition. Lower priority because most "did this ship" signal already flows through GitHub.

Existing pieces coznt already has that this plugs into:
- `skill_autonomy` per-`(skill, project)` row → the decision input
- `rules` engine with severity (`info | warn | error`) → rule-violation feed
- `phase_gate` state → phase-aware gating
- `audit_logs` → the gate's decision is logged
- `adapter_bindings` → resolves `(org, github, owner/repo) → projectId`

---

## What coznt evaluates per PR

Inputs the gate decision composes:

| Input | Source | Used for |
|---|---|---|
| Originating skill (if any) | PR description / commit trailer parser (`Made-by: skill-slug`) | Look up the skill's autonomy for *this project* |
| Skill autonomy level | `skill_autonomy(skillId, projectId)` | Threshold check |
| Change risk class | Heuristic: paths touched × diff size × file types | Map to autonomy threshold |
| Active rules at current phase | `listRulesForProject(projectId, phase)` | Hard-fail any `severity: error` rule violation |
| Project phase | `projects.phase` | Reject if PR is in a phase that forbids code changes (e.g. Design phase merge attempts) |
| Recent rollback signal | `skill_outcomes` last 7d for this skill | Auto-demote to manual review if rollback rate spiked |
| Human override | `approvals` row with `decision: approved` | Always allows merge, recorded |

Output: one of
- `success` — autonomy + risk + rules all clear; merge proceeds
- `failure` — at least one block; merge UI disabled with reason
- `neutral` — no signal yet (e.g. skill_outcomes empty for this skill); doesn't block but doesn't pre-approve either

---

## The decision policy

The gate's verdict is a pure function of inputs. The policy is centralized in a new operation, `src/operations/execution-gate.ts`:

```ts
type GateInput = {
  organizationId: string;
  projectId: string;
  skillId: string | null;     // null = no skill attribution (human PR)
  changeRisk: "low" | "medium" | "high";
  ruleViolations: Array<{ ruleId: string; severity: "info" | "warn" | "error" }>;
  phase: ProjectPhase;
  hasHumanApproval: boolean;
};

type GateVerdict =
  | { state: "success"; reason: string }
  | { state: "failure"; reason: string; details: string[] }
  | { state: "neutral"; reason: string };
```

Rules of the policy (v1):

1. **Any `severity: error` rule violation → failure.** Always. Autonomy never overrides a hard rule.
2. **Phase mismatch → failure.** Code change attempted in a non-`development` phase blocks (mirrors the `FORBIDDEN` list in `domain/phases.ts`).
3. **Human approval present → success.** Audit row records the override.
4. **No skill attribution (raw human PR) → neutral.** Coznt doesn't block what it can't reason about — leaves existing CI checks to do their thing.
5. **Skill attribution + level vs. risk threshold:**
   - `intern` (0) → all changes blocked (failure)
   - `junior` (1) → `low` allowed, `medium`/`high` blocked
   - `senior` (2) → `low`/`medium` allowed, `high` blocked
   - `principal` (3) → all risks allowed unless a rule violation says otherwise

Change-risk heuristic (v1):
- `low` — diff < 50 lines AND touches no path in the project's `critical_paths` list
- `medium` — diff 50–500 lines OR touches `critical_paths` AND < 200 lines
- `high` — diff > 500 lines OR touches a path in `production_critical_paths` (subset of critical_paths reserved for payments/auth-style code)

`critical_paths` and `production_critical_paths` live on the `projects` row (new JSONB column) so they're per-project, declared by the team that owns the project. Default both to empty arrays — first PR a team sees flagged is the prompt to declare them.

---

## GitHub Checks API integration shape

Flow when a PR opens:

```
PR opens / push → GitHub fires `pull_request` / `check_suite` webhook
  ↓
coznt /api/v1/webhooks/github   (already exists, extend)
  ↓
1. resolve project via adapter_bindings (`github.com/owner/repo` → projectId)
2. parse PR for skill attribution (commit message trailer)
3. compute changeRisk from diff (call /repos/.../pulls/{n}/files)
4. compute ruleViolations (run active rules against changed files)
5. compose GateInput, call decideExecutionGate(input) → verdict
6. POST /repos/.../check-runs:
     name: "coznt / autonomy gate"
     status: "completed"
     conclusion: verdict.state
     output: { title, summary, text: details with links back to coznt }
7. write audit_log row: action=execution_gate.evaluated, summary=verdict
```

On subsequent PR pushes, re-evaluate (idempotent — same inputs produce same verdict modulo new commit data).

On human override (someone approves the matching coznt approval row), POST a new check-run with `conclusion: success` and `summary: "Human override by {reviewer}"`.

Required GitHub App permissions (new — coznt doesn't have a GitHub App yet, this work creates one):
- `checks: write` — for the check-run POST
- `pull_requests: read` — for diff/files
- `metadata: read` — repo info
- Webhook events: `pull_request`, `check_suite`, `push`

---

## Deployment Protection Rules (secondary)

For production deploys, coznt registers as a *required reviewer* on GitHub Deployment Protection Rules. The flow:

```
deploy job kicks off → GitHub holds pending coznt approval
  ↓
GitHub fires `deployment_protection_rule` webhook
  ↓
coznt evaluates:
  - The PR(s) in this deploy — were any of their gates `success`?
  - The originating skills' autonomy levels at *this moment* (an Intern-demoted skill blocks until promoted again)
  - The target environment — production rejects below senior; staging permissive
  ↓
POST /repos/.../actions/runs/{run_id}/deployment_protection_rule
   with decision: approved | rejected
```

This is the *"demote in real time"* lever. If a skill was Senior at PR-merge but demoted before deploy (because an outcome assessor flagged a critical incident on a sibling deploy), the deploy gets rejected. That's the loop closing.

---

## What happens on demote

This is the load-bearing dynamic the gate creates. The flow:

1. Skill `X` runs at Senior on Project A
2. `X` ships a PR that triggers a production incident → `skill_outcomes` records `(verdict=incident, severity=critical)`
3. `recomputeSkillAutonomy(X, A)` runs → demotes `X` to Junior immediately
4. Every **open PR** authored by `X` on Project A is re-evaluated by the gate:
   - The gate's check-run is updated to `failure`
   - Merge UI is now blocked on those PRs
   - The skill detail page surfaces "{N} PRs blocked by recent demotion"
5. Every **queued deploy** that contains `X`'s commits is rejected at the protection-rule step

This is the moment the autonomy ledger stops being a leaderboard. The receipts that earn `X` Senior level *also* enable the gate to revoke that authority in real time when an incident lands.

---

## What's NOT in v1

Deliberately out of scope:

- **Block-with-explanation UX inside the PR comment** — v1 is just check-run state + summary text. PR comments come later if the summary text isn't enough.
- **Per-rule skill exceptions** — "this skill is auto-approved for rule X but not Y." v1 is just severity-based.
- **Multi-skill PRs** — if a PR's commits come from multiple skills, v1 uses the *lowest* autonomy level among them. Smarter aggregation comes later.
- **Cross-repo PR dependencies** — out of scope; the gate evaluates one PR at a time.
- **GitHub Enterprise variants** — works against `github.com` only in v1. GHE comes when a customer asks.

---

## Rollout path

1. **GitHub App registration** — new package work, hosted at `github.com/apps/coznt`. ~1 day.
2. **`/api/v1/webhooks/github` extension** — already exists; add the pull_request handler and the check-runs poster. ~2 days.
3. **`src/operations/execution-gate.ts`** — pure decision function with the policy above. ~1 day.
4. **`change-risk` heuristic** — diff-size + path-match scorer. ~1 day.
5. **`critical_paths` per-project column + UI in `/projects/[id]/settings`** — schema migration + a settings panel. ~1 day.
6. **Demote-triggered re-evaluation** — hook into `recomputeSkillAutonomy` to enqueue re-eval of open PRs for demoted skill. ~1 day.
7. **Deployment Protection Rules handler** — secondary integration. ~2 days.
8. **`/skills/[id]` surfaces blocked-PR count** — UI thread. ~0.5 day.

**Total**: ~10 days for v1 (single engineer + AI). Phase 1 (steps 1–4) is the minimum demoable cut — gate evaluates and blocks PRs based on autonomy + rules. Phases 2–3 (steps 5–8) add the dynamic demote-revoke pipeline and the deploy-side gate.

---

## Why this is the actual wedge

Without the execution gate, coznt is a dashboard with strong opinions. With it, coznt becomes the only thing in the table at `positioning.md:50` that *both* (a) detects risk *and* (b) physically restricts what an unproven agent can do. Sonar/Snyk detect; they don't restrict. Cursor/Devin act; they don't restrict themselves. ai-sdlc-framework restricts within one repo via its CLI. coznt restricts **across the organization, regardless of which orchestrator the agent is running through** — and the restriction loosens or tightens in real time as outcomes accumulate in the ledger.

That's *"AI agents earn the right to do more"* made physical, not advisory. The positioning thesis depends on it.
