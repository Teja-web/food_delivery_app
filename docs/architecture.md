# coznt — Architecture Plan

Coznt closes a loop between AI-assisted action and earned organizational trust, hosted, multi-project. Built on the recruit/tanznt template (single Next.js app, Drizzle, Better Auth, pgmq workers, AI agents, hybrid search).

---

## 1. The spine: autonomy with observability

Every architectural decision is judged against one loop:

```
Action ──► recorded with context ──► outcome assessed ──►
trust ledger updates (per project) ──► next action allowed with less friction ──► …
```

Every feature either:
- **tightens the loop** — faster signal from action to ledger update,
- **makes one side cheaper** — more observation per dollar, more autonomy per outcome, or
- is **supporting plumbing** that doesn't belong in the spine.

A feature that only adds another chart is table-stakes. A feature that only adds another agent is a tool. A feature that tightens the loop is coznt.

### Two operating modes, in sequence

**Mode 1 — Ledger fills from non-AI signal.** The first source of ledger events is human + pipeline activity: PRs merged on time, deploys succeeded, gates passed, work items closed without rollback, incidents avoided. No AI agents required. The ledger learns what "good" looks like for each project from the team's existing SDLC behavior. The product ships and earns its first deals on observability alone.

**Mode 2 — Agents join the loop.** Once a project has a baseline of observed outcomes, AI agents are introduced into the loop. Their actions are scored against the same rubric and accumulate per-project autonomy. Trusted patterns unlock auto-approval; humans focus on architecture, judgment, and exceptions.

The schema and APIs are built for Mode 2 from day one. The runtime only fills the autonomy side when a project has been observed long enough to know what "earned" should mean.

### Per-project autonomy

Autonomy is scoped to `(skill, project)` pairs, not skills alone. A skill that is senior-level on a docs-only repo restarts at intern on a payments service. Cross-project rollups exist for the portfolio view, but the *act* of promotion is per-project. This matches how enterprise compliance reasons about scope.

---

## 2. Vision

### What organizations buy

**Autonomy with observability**, hosted, multi-project. AI agents earn the right to do more. Humans always see what they did and why. Audit defense falls out: if every autonomous action is observed and signed, the evidence packet already exists.

For organizations that have to ship faster *and* show their work.

### What coznt is not

- **Not a code-generation tool.** Cursor / Devin / Copilot already do that. Coznt sits above them — it governs what their output is allowed to do.
- **Not a work tracker.** Jira / Linear / Asana are systems of record. Coznt ingests them.
- **Not a pipeline runner.** GitLab / Azure DevOps already do that. Coznt observes deploys and routes governance.
- **Not a Cursor plugin.** MCP is one *input* surface among many (HTTP API, CLI, webhooks). Never the primary one.
- **Not a single-repo CLI.** `ai-sdlc-framework` is the OSS peer at that shape. Coznt is the hosted, multi-project equivalent.

It is the **connective tissue between AI-assisted action and earned organizational trust.**

---

## 3. How the loop maps to the schema

| Loop node | Schema table | Producer (Mode 1) | Producer (Mode 2 adds) | Consumer |
|---|---|---|---|---|
| **Action** | `webhook_events`, `automation_logs` | GitHub/Jira/ADO webhooks, worker tasks | Agent invocations via `/api/v1/*` | Rules engine matches |
| **Recorded with context** | `audit_logs`, `metrics`, `events` | Operations layer on state changes | Same | UI rollups, audit export |
| **Outcome assessed** | `skill_outcomes` | Deterministic assessors (PR merged on time, deploy succeeded, no incident in window) | Agent invocation result (success / rolled_back / incident) | `recomputeSkillAutonomy` |
| **Trust ledger** | `skill_autonomy` keyed by `(skillId, projectId)` | `recomputeSkillAutonomy` reading trailing 30-day window | Same | Skills ledger UI, approvals routing, agent dispatch gate |
| **Next action allowed** | `rules`, `phase_gates`, autonomy check | Rules engine, gate evaluator | Same, plus autonomy threshold | Approval flow, agent dispatch (Mode 2) |

Mode 1 fills the first three nodes with non-AI signal. Mode 2 adds AI-driven producers to nodes 1 and 3.

### Schema deltas the spine requires

- `skill_outcomes` — add `projectId` column; index `(projectId, skillId, recordedAt)`.
- `skill_autonomy` — key on `(skillId, projectId)` instead of `skillId` alone.
- `recomputeSkillAutonomy` — look up `(skillId, projectId)` from the outcome row and recompute per pair.
- `audit_logs` — hash-chained writes if "tamper-evident" is to be a defensible claim. Open decision (see §9).

---

## 4. Plans as containers, not the spine

Plans live within projects. They are *containers* for loop activity, not the spine itself. A plan represents one unit of work — a requirement, an ADR, a feature plan, a test plan, a release plan, an incident — that flows through the loop and accumulates outcomes against it.

One `plans` table; six template kinds differentiated by `kind` enum. Phase-specific frontmatter lives in a `details` JSONB column validated by Zod per kind.

| Kind | SDLC phase | Frontmatter shape |
|---|---|---|
| `requirement` | Requirements & Planning | `acceptance_criteria[]`, `personas[]`, `priority`, `effort` |
| `adr` | Design & Architecture | `decision`, `context`, `consequences`, `alternatives[]` |
| `feature_plan` | Development | `scope`, `tasks[]`, `affected_files[]`, `risks[]` |
| `test_plan` | Testing & QA | `coverage_targets`, `test_cases[]`, `gates[]` |
| `release_plan` | CI/CD | `pipeline`, `environments[]`, `rollback`, `gates[]` |
| `incident` | Monitoring | `severity`, `timeline[]`, `root_cause`, `action_items[]` |

### Rules and Skills as first-class entities

- **Rule** — a constraint, validated on demand (e.g. "all PRs must reference a requirement"). Stored as markdown with YAML frontmatter, served via API.
- **Skill** — a reusable workflow definition (system prompt + I/O schema). Server-side, callable from any agent over HTTP — same shape as Claude Code skills, OpenAI tools, or Cursor commands. Autonomy is scored per `(skill, project)`.

Distribution: agents fetch rules and skills by `project_id` + `phase` over HTTP. No SDK required — `curl` works.

---

## 5. Target architecture (mirrors recruit)

```
coznt/
├── src/
│   ├── actions/                  "use server" wrappers around operations
│   ├── app/
│   │   ├── (app)/                Authenticated workspace UI
│   │   │   ├── projects/[id]/
│   │   │   ├── plans/[id]/
│   │   │   ├── rules/
│   │   │   ├── skills/
│   │   │   ├── approvals/
│   │   │   ├── integrations/
│   │   │   ├── audit/
│   │   │   └── metrics/
│   │   ├── auth/                 Better Auth routes
│   │   ├── api/
│   │   │   ├── v1/               Public REST/JSON API (agent surface)
│   │   │   ├── webhooks/         GitHub / Jira / ADO / Confluence inbound
│   │   │   └── sse/              Live updates to UI
│   │   └── portal/               Public approval / review links (HMAC slugs)
│   ├── automations/
│   │   ├── agents/
│   │   │   ├── definitions/      Zod output schemas + model config
│   │   │   └── prompts/          System prompts + context builders
│   │   └── tasks/                Workflow orchestration (fetch → prompt → store)
│   ├── components/               UI, including ui/ shadcn primitives
│   ├── db/
│   │   ├── client.ts             Drizzle (pg Pool)
│   │   └── schema/               One file per entity + relations.ts + index.ts
│   ├── domain/                   Pure business logic (phase transitions, gates, outcome assessors)
│   ├── lib/
│   │   ├── ai/                   generate(), model registry
│   │   ├── auth/                 Better Auth config + plugins + org plugin
│   │   ├── crud.ts               createEntityCrud() factory
│   │   ├── events/               Event bus, SSE stream
│   │   ├── integrations/         GitHub, Jira, ADO, Confluence, Slack clients
│   │   ├── search/               Hybrid FTS + semantic
│   │   ├── rules.ts              Rules engine (entity, op, condition → tasks)
│   │   ├── queue.ts              pgmq client
│   │   └── worker.ts             Poll loop
│   └── operations/               Entity CRUD wrappers (one per entity)
├── scripts/
│   ├── worker.ts                 Worker entry point
│   ├── db-setup.ts               Create DB, extensions, schemas, admin
│   ├── db-seed.ts                Seed triggers, platform org, agents, rules
│   └── crud-triggers.sql         PG trigger templates (table → pgmq)
├── packages/
│   └── cli/                      `npx coznt …` — the agent-facing CLI
├── drizzle/                      Versioned migrations
├── docs/
└── tests/                        Vitest + Playwright
```

**Stack** (lifted from recruit, current versions):
- Next.js 16, React 19, Tailwind 4, shadcn/ui, Radix
- Drizzle ORM + Postgres + pgmq + `pg_trgm` + `pgvector`
- Better Auth + org plugin + admin impersonation
- Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/groq`, `@ai-sdk/anthropic`) — model-agnostic
- Vitest + Playwright

---

## 6. Generic agent surface

Three ways an actor — Cursor, Claude Code, Aider, a CI job, a human — consumes coznt. None are the primary surface; the loop is.

1. **HTTP API** (`/api/v1`) — REST + JSON. Bearer token (project-scoped API key). `GET /context`, `POST /plans`, `POST /plans/:id/submit`, `GET /rules?phase=development`, `POST /telemetry/tool-use`, etc.
2. **CLI** (`npx @coznt/cli`) — thin wrapper around the HTTP API. Reads `.coznt/config.json`.
3. **Webhooks in / Git sync out** — receive external events, optionally write plan/rule/skill markdown into the project repo on a branch.

MCP is an *optional adapter* over the HTTP API. Useful for IDE entry; not load-bearing for the loop.

---

## 7. Entity schema (one file per table)

Every entity is org-scoped, audit-trailed, has `searchFields` declared.

| Table | Purpose | Key search fields |
|---|---|---|
| `organization` | Tenant | `name`, `slug` |
| `user` | Better Auth | `name`, `email` |
| `project` | Top-level container, phase, repo links | `name`, `description` |
| `plan` | Unified plan, six kinds | `title`, `summary`, `body` |
| `plan_revision` | Versioned content | `body` |
| `rule` | Markdown rule with YAML frontmatter | `title`, `body`, `tags` |
| `skill` | Reusable workflow definition | `name`, `description`, `body` |
| `skill_outcome` | One verdict per invocation (**add `projectId`**) | — |
| `skill_autonomy` | Current level per `(skill, project)` (**rekey**) | — |
| `approval` | Gate request linked to a plan | `note` |
| `comment` | Threaded review comment | `body` |
| `work_item` | Linked Jira/GitHub/ADO issue or PR | `title`, `description` |
| `phase_gate` | Mandatory checkpoint per phase | — |
| `integration` | Per-org credentials (encrypted) | `kind`, `label` |
| `webhook_event` | Inbound webhook log + dedupe | `source`, `payload` |
| `metric` | Recorded value (DORA, etc.) | — |
| `deployment` | Recorded deployment event | — |
| `audit_log` | Every state change (hash-chain TBD) | `summary` |
| `automation_log` | Worker task execution log | `task`, `status` |
| `intelligence` | AI-generated annotations | `summary`, `body` |
| `document` | Embeddings index for semantic search | `title`, `body` |
| `notification` | In-app + email queue | `subject`, `body` |
| `event` | Domain event log (SSE source) | `kind`, `summary` |

---

## 8. Build order — milestones that close the loop

Each milestone is gated on the loop being demonstrably closed at that scope.

### Milestone A — Loop runs end-to-end on one project, Mode 1

- Worker drains pgmq (the existing missing piece).
- Deterministic outcome assessors land in `src/domain/outcomes.ts`: PR merged within SLA, deploy succeeded, gate passed, work item closed without rollback within window.
- Schema deltas applied: `skill_outcomes.projectId`, `skill_autonomy` rekeyed.
- One project, one real GitHub binding, real webhook traffic → real `skill_outcomes` rows from non-AI signal → `skill_autonomy` updates → visible on the H4 ledger.
- **Demo statement:** "Here is one project's loop running on its existing SDLC, with no AI agents touching it yet."

### Milestone B — Portfolio + audit-grade visibility across projects

- H1 portfolio view rolls up Milestone A state across N projects.
- H5 cross-project DORA aggregates `metrics`.
- H4 skills ledger gains per-project default view + cross-project rollup pane.
- Audit export (`/audit`) — query builder over `audit_logs` + ledger history; exportable to evidence packets.
- **Demo statement:** "Here is every project's loop, rolled up, with audit trail."

### Milestone C — First real AI agent joins the loop (Mode 2 begins, one project)

- One agent definition in `src/automations/agents/definitions/` (proposed: test-plan-generator or rule-validator — small, low-blast-radius).
- Agent's invocations write `skill_outcomes` rows tagged with the project.
- Autonomy accumulates from real AI signal on that project; trust ledger reflects it.
- **Demo statement:** "Here is what happens after a real agent has been running for a month: it earned senior-level autonomy on docs-only repos; it is still intern on payments."

### Milestone D — Agent dispatch gate + approvals integration

- Approvals inbox (H3) routes both human-pending and agent-pending decisions.
- Autonomy threshold check on agent dispatch (`/api/v1/skills/:id/invoke`).
- PreToolUse and PostToolUse endpoints for external plugin telemetry (Claude Code, Cursor).
- **Demo statement:** "Trust earned in Milestone C now bypasses human review on low-risk paths; everything else routes here."

### Milestone E — Devin's input surface (Cursor / Claude Code)

- MCP context endpoint + Cursor connect modal.
- Plugin packaging for one-line install once the loop is real on the other end.
- **Demo statement:** "Coznt is now accessible from the IDE — same loop, new input surface."

Milestones A and B are required for any external use. C is the first sale of the long-term IP. D and E unlock the rest of the moments doc.

---

## 9. Open decisions

1. **Hash-chained `audit_logs`** — the positioning leans on "signed, tamper-evident." The borrowings doc defers DSSE. Either ship hash-chained writes (cheap, no key management) before any external claim of "audit-grade," or soften the positioning. Pick before Milestone B.
2. **Mode 1 → Mode 2 trigger** — how does a project graduate to allowing AI agents? Manual toggle? Threshold (≥30 days of observed activity, ≥N successful outcomes)? Codify in Milestone C.
3. **Mode 1 outcome rubric** — which deterministic signals count as `success` for autonomy bootstrap? Suggested defaults: PR merged with no rollback within 7 days; deploy success + no incident within 24 hours; gate passed without override. Codify in Milestone A.
4. **AI default model** — `gpt-5-mini` or Claude via `@ai-sdk/anthropic`?
5. **CLI distribution** — npm public package or private?
