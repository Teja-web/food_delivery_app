# Borrowings from `ai-sdlc-framework/ai-sdlc`

**Source:** https://github.com/ai-sdlc-framework/ai-sdlc — declarative governance framework for AI-augmented SDLCs.

**Why we care:** same domain as coznt, with several abstractions we don't yet have. Their model is a CLI/orchestrator running in a single repo against its backlog; ours is a multi-tenant hosted platform. We borrow **concepts**, not code.

This doc is the plan for what to bring in, in what order, and why. Nothing here is implemented yet — review and edit before we start.

---

## Top picks (recommended)

These are the three highest-leverage borrowings. Each maps cleanly onto coznt's existing shape and unblocks a concrete gap.

### 1. AdapterBinding — `project ↔ external system` mapping

**Borrowed from:** `spec/adapters.md` — `AdapterBinding` resource type.

**Gap it closes:** when a GitHub `deployment_status` webhook arrives at coznt, we currently can't tell which coznt project it belongs to. Same for Jira issue events, ADO PR events, Confluence page edits. I deferred wiring webhook → `recordDeployment` because of this. AdapterBinding fixes it.

**Schema sketch:** new table `adapter_bindings`.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `organizationId` | text | scoped |
| `projectId` | text FK projects | the coznt project |
| `provider` | text | `github` / `jira` / `ado` / `confluence` |
| `externalKey` | text | repo full_name / Jira project key / ADO project / Confluence space |
| `config` | jsonb | branch filter, label filter, env mapping |
| `createdAt` / `updatedAt` | timestamp | |

Unique constraint on `(provider, externalKey, organizationId)`.

**Files:**
- `src/db/schema/adapter-binding.ts` (new)
- `src/operations/adapter-bindings.ts` (CRUD via `createEntityCrud`)
- `src/actions/adapter-bindings.ts`
- `src/lib/integrations/resolve.ts` — `resolveProjectForWebhook(orgId, source, externalKey) → projectId | null`
- `src/automations/tasks/process-webhook-event.ts` — call resolver, then create deployment / work-item rows
- `src/app/(app)/projects/[id]/page.tsx` — show + edit bindings
- One migration: `drizzle/00XX_adapter_bindings.sql`

**Effort:** ~half a day. Unblocks the GitHub deploy → metrics loop end-to-end.

---

### 2. Action governance in rule frontmatter

**Borrowed from:** their `agent-role.yaml` — `blockedActions`, `blockedPaths`, `requireTests`, `maxFilesPerChange`.

**Gap it closes:** coznt rules today only validate plan *content* (keyword-presence). They don't constrain what skills can *do*. As skills become more autonomous, we need declarative guardrails.

**Approach:** extend the rule frontmatter validator dispatch in `src/operations/rule-engine.ts`. Today only `validator: keyword-presence` is implemented. Add `validator: action-policy` with these fields:

```yaml
---
validator: action-policy
appliesTo: skill              # or "task" / "deployment"
blockedActions: ["*--force*", "rm -rf*"]
blockedPaths: [".github/**", ".ai-sdlc/**"]
requireTests: true
maxFilesPerChange: 15
---
```

**Where it's enforced:**
- `src/operations/skill-invocation.ts` — wrap skill invocation, evaluate matching action-policy rules against the proposed action set, throw `RuleViolationError` on `error` severity.
- `src/automations/tasks/*` — same enforcement when tasks mutate code.

**Files:**
- `src/operations/rule-engine.ts` — add `evaluateActionPolicy()` alongside existing `evaluateKeywordPresence()`
- `src/lib/rule-validators/action-policy.ts` — new
- Tests: invariant — a skill blocked by `requireTests: true` cannot be invoked without a passing test reference.

**Effort:** 1 day. Lays foundation for #3.

---

### 3. Progressive autonomy ledger for skills

**Borrowed from:** `spec/autonomy.md` — Intern (0) → Junior (1) → Senior (2) → Principal (3), with promotion criteria and immediate demotion on incidents.

**Gap it closes:** coznt has no way to say "this skill has earned the right to auto-merge low-complexity changes." Without it, every approval needs a human, regardless of skill track record.

**Schema sketch:**

| Table | Columns |
|---|---|
| `skill_outcomes` | `id`, `skillId`, `invocationId`, `verdict` (`success` / `rolled_back` / `incident`), `severity`, `recordedAt` |
| `skill_autonomy` | `skillId` PK, `level` (0-3), `levelSetAt`, `lastReviewedAt`, `nextReviewAt` |

**Promotion logic** (cron / nightly task):
- Compute 30-day rolling: `successRate`, `rollbackRate`, `incidentCount`
- Promote if at-level minimum elapsed AND criteria met
- Demote immediately on any `severity=critical` incident

**Where it changes behavior:**
- `src/operations/approvals.ts` — auto-approve when `skill.autonomy >= required` AND change-complexity is below threshold
- Phase gates can declare a `minSkillAutonomy` requirement
- `/skills` page shows current level + next review date

**Files:**
- `src/db/schema/skill-autonomy.ts` (new)
- `src/db/schema/skill-outcome.ts` (new)
- `src/automations/tasks/record-skill-outcome.ts` — invoked from skill-invocation post-hook + on rollback
- `src/automations/tasks/recompute-skill-autonomy.ts` — periodic
- `src/app/(app)/skills/page.tsx` — render level, badges
- 2 migrations

**Effort:** 2-3 days. Highest-leverage but depends on #2 being in place.

---

## Consider (next tier — defer to a later sprint)

### 4. JSON Schema export of resources

Their resource types all have JSON Schema 2020-12 definitions in `spec/schemas/`. Useful for AI agents introspecting what plans/projects/skills look like.

For coznt: derive `zod-to-json-schema` from existing Zod schemas in operations + agent definitions, expose at `/api/v1/schema/{resource}`. Half a day, mostly mechanical.

**Why "consider" not "recommend":** speculative until an external agent actually asks for it. Build when the demand surfaces.

### 5. Three-reviewer cross-harness pattern

Their orchestrator runs every PR through Claude + Codex + Cursor reviewers in parallel. Stronger guarantees than any single agent.

For coznt: extend `/api/v1/skills/[slug]/invoke` with a `reviewers: ["agent-a","agent-b","agent-c"]` mode that fans out and aggregates verdicts. Useful when we add an agent-driven plan-approval workflow.

**Why later:** coznt doesn't yet drive code review through skills — that surface needs to exist first.

### 6. Workflow pattern detection from telemetry

They mine `PostToolUse` JSONL with n-grams (n=3 to 8) and propose new commands/skills/hooks for repeated workflows.

For coznt: mine `audit_logs` + `automation_log` for repeated entity-mutation sequences, propose new rules. Mildly nice; not load-bearing.

---

## Defer (not pursuing)

### 7. DSSE attestation envelopes

Strong supply-chain integrity story. Sign every plan revision, deployment, and review with a DSSE envelope so anyone can verify what an agent did.

**Why defer:** cryptographic key management, key rotation, verification UX, and auditor onboarding are all real costs. Audit_logs + plan_revisions cover 80% of the value at 10% of the cost. Revisit when a customer needs SLSA-level provenance.

### 8. Pattern-C worktree isolation

Per-task `.worktrees/<task-id>/` with MCP routing. Solves a problem coznt doesn't have — we don't run agents that mutate local repos. Skip.

### 9. CLI surface (`ai-sdlc tick / start / status`)

Useful for ops in a CLI-first product. Coznt is a hosted UI; the equivalent is the `/metrics` and `/projects` pages plus the worker process. Skip unless we ship a CLI for self-hosters.

### 10. Conformance test suite

Language-agnostic conformance suite — only meaningful if we publish a spec for others to implement against. Not us.

---

## Already aligned (no work needed)

| Their concept | Coznt equivalent |
|---|---|
| QualityGate enforcement levels (block / warn / info) | `rules.severity = error / warn / info` |
| QualityGate | `phase_gates` |
| AgentRole | `skills` (lighter) |
| Pipeline | `plans` of kind `release_plan` + linked work items |
| Adapters: Linear / Jira / GitHub | `webhook_events.source` + `integration_credentials.provider` |
| Metrics surface | `metrics` table with DORA types |

---

## Suggested sequence

1. **#1 AdapterBinding** (0.5 day) — unblocks deferred work from earlier sprint.
2. **#2 Action-policy rule validator** (1 day) — foundation for autonomy.
3. **#3 Progressive autonomy** (2-3 days) — visible product win.
4. Re-evaluate #4 / #5 / #6 after #3 ships and we see how skills are actually invoked.

Total scope of recommended work: ~5 days. Each step is independent enough that we can stop after any one and still ship value.

---

## Open questions

- **AdapterBinding key scheme:** is `repo full_name` enough for GitHub, or do we want `(host, owner, repo)` separately to support GitHub Enterprise? Probably the latter; cheap to design in upfront.
- **Autonomy criteria thresholds:** should defaults live in code or per-org config? Suggest in code with org-level overrides via a `org_settings` jsonb column.
- **Action-policy `appliesTo`:** does this scope to a single skill, all skills in a project, or org-wide? Mirror the `rules.projectId` nullable pattern (null = org-wide).
