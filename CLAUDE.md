# Coznt — LLM Context

## What this is

Coznt is **AI-DLC Governed** — the governance + observability layer that turns individual AI productivity (Cursor, Claude Code, Devin) into safe organizational throughput. Peer set Linear, Vercel, Datadog, Grafana, Cursor. Not an ATS.

The operating spine is **Govern — Verify — Trust**:
- **Govern** — `governance_policies` define rules; `governance_records` apply them on plan-artifact transitions. Four kinds (gate, approval, review, exception), one unified status machine. Rule engine (`keyword-presence`, `action-policy`) + per-project autonomy thresholds layer on top. What an AI is allowed to do.
- **Verify** — deterministic outcome ledger (`skill_outcomes`), autonomy recompute from a 30-day window of evidence. Whether what AI produced actually held up.
- **Trust** — hash-chained audit log, `evidence_links` from every plan to the proof artifact, **verification debt** as the load-bearing analytical primitive (= plans in `completed` with missing expected evidence). *"Trust observable"* is the UX thesis under this pillar.

Canonical positioning source: `docs/positioning.md`. Governance schema: `docs/spec/governance-schema-simplified.md`. Verification-debt formula: `docs/product/verification-debt-thesis.md`.

Core domain (real, ground truth in `src/db/schema/`):

- **Project** — thin delivery container in one of two statuses (`active`, `archived`). Multi-repo + multi-environment per project. No phase column — SDLC progression is expressed through plan-artifact status.
- **Repository** — registered code/tracker source bound to a project. Sources: `github` | `jira` | `ado` | `confluence`. Multi-repo per project; replaces the old per-project `repoUrl/jiraProjectKey/adoProjectId/confluenceSpaceKey` columns.
- **Environment** — explicit deploy target. Tier: `production` | `preproduction` | `development`.
- **Plan Artifact** — the universal governance subject. One table, nine kinds: `epic`, `feature`, `story`, `spec`, `adr`, `test_plan`, `release_plan`, `risk_register`, `incident`. Per-kind structured fields live in `details` JSONB (validated by `src/lib/plan/schemas.ts`). Status flow: draft → in_review → approved → in_progress → completed | rejected | changes_requested | cancelled.
- **Plan Relationship** — typed link between two plan artifacts. Kinds: `parent_of` (Epic→Feature→Story), `supersedes` (ADR succession), `derived_from`, `blocks`, `relates_to`, `causes`, `references`. No privileged `parentPlanId` column — all hierarchy is one of these relationships.
- **Governance Policy** — rule definition at the org tier, scoped to any level (`organization` | `project` | `repository` | `environment` | `plan_artifact`). Kind discriminator: `gate` | `approval` | `review` | `exception`. Per-kind config in `details` JSONB.
- **Governance Record** — rule application, always attached to a `planArtifactId`. Same four kinds. Single status state machine: `pending → passed | failed | skipped | expired`. Per-kind sub-states (approval decisions, review rounds, exception expiry) live in `details` JSONB. **Exceptions** point at a failing record via `details.supersedesRecordId` and override it until `expiresAt`.
- **Evidence Link** — polymorphic pointer from a plan_artifact to the proof artifact. Types: `deployment` | `test_run` | `metric_snapshot` | `work_item` | `skill_outcome` | `incident` | `external_link`. The single canonical attachment surface; verification-debt is "plans in `completed` with no `evidence_links` row of the expected type."
- **Skill** — a capability invoked by AI agents. Skills earn autonomy **per-project**: 0 observe, 1 propose, 2 merge, 3 lead.
- **Skill Outcome** — append-only ledger row. `verdict`: `success` | `rolled_back` | `incident`. `sourceKind`: `invocation` (AI path) or one of the deterministic assessors (`pr_merge`, `pr_revert`, `pr_abandon`, `deploy_clean`, `deploy_incident`). Drives autonomy recompute.
- **Skill Autonomy** — current level per `(skillId, projectId)` pair. Recomputed from the trailing 30-day window of outcomes.

Autonomy overrides (AI agent blocked at PreToolUse) are **NOT** governance_records — they're a distinct mechanism logged via `automation_log` with `taskId='pre-tool-use:*'` and `status='blocked'`. They surface under the Governance → Skills subnav, not the Governance Records list.

See `docs/spec/governance-schema-simplified.md` for the full spec and §10 design discipline rules: **kind is a filter chip, not a route; one CRUD per primitive; one evaluator dispatcher.**

## Two Sources of Truth

Every data type derives from exactly one of:

| Source | Owns | Where |
|--------|------|-------|
| **Drizzle schema** | DB shape, relations, `$inferSelect` types | `src/db/schema/*.ts` |
| **Zod schema** | AI agent output shape + per-kind `details` JSONB shapes | `src/automations/agents/definitions/*.ts`, `src/lib/plan/schemas.ts`, `src/lib/governance/schemas.ts` |

No manual TypeScript interfaces for data shapes. Everything else is derived. Per-kind JSONB validation lives co-located in a single Zod file per primitive (one for plan-artifact kinds, one for governance kinds) — per spec §10, the Zod file is the contract for what's queryable inside `details` without per-kind columns.

## Page Data Pattern

Every page follows the same 4-layer pattern:

```
Drizzle schema ($inferSelect)
  → Operations (CRUD factory, custom queries)
    → serialize.ts (transform + derive client types)
      → ComponentName.tsx (import types, render)
```

| Layer | File | Rule |
|-------|------|------|
| **Operations** | `src/operations/*.ts` | All DB access. Pages never import `db` directly |
| **Actions** | `src/actions/*.ts` | Thin "use server" wrappers around operations |
| **Serializer** | `src/app/**/serialize.ts` | Imports Drizzle types, exports client types. One per route |
| **Client component** | `src/app/**/ComponentName.tsx` | Imports types from `serialize.ts`. Never declares data interfaces |

### Adding a new field end-to-end

When a new field needs to be produced by an AI agent (e.g. `riskRationale`), touch exactly 3 files:

1. **Zod schema** — add field to the agent's output shape (`src/automations/agents/definitions/`)
2. **Drizzle schema** — add column (`src/db/schema/`), then run `pnpm db:generate` to produce a versioned migration in `drizzle/`. **Commit the SQL alongside the schema change.**
3. **Task** — store it in the DB write (`src/automations/tasks/`)

The serializer picks it up via Drizzle relations. The client picks it up via the type import. No manual interface updates.

### Migrations workflow

- **Local dev**: `pnpm db:push` is fine for fast iteration on a feature branch.
- **Before merging to main**: run `pnpm db:generate` and commit the generated `drizzle/00XX_*.sql` + the updated `drizzle/meta/_journal.json`.
- **Production**: `pnpm db:migrate` applies committed migrations. Never `db:push` to prod — it bypasses the audit trail and silently drops/recreates indexes.
- If you change a schema file in a PR, the diff against `drizzle/meta` should produce a new migration. CI should fail if `pnpm db:generate` produces an uncommitted diff.

### Example: Skill detail page

```
page.tsx:   fetchSkillDetail(id)                    → serializeSkillDetail(skill) → <SkillDetailClient {...props} />
              ↓                                       ↓
actions:    getSkillDetail(id)                       serialize.ts exports types
              ↓                                       ↓
operations: skillCrud.get(id, { with: {              SkillDetailClient.tsx imports from serialize.ts
              outcomes: { project: true },             (no manual interfaces)
              autonomy: true,
              invocations: true,
            }})
```

### What NOT to do

- Don't import `db` in page components — use actions/operations
- Don't declare data interfaces in client components — import from `serialize.ts`
- Don't write raw `db.select().from().innerJoin()` in pages — use the CRUD factory's `.get()` or `.list()` with `with` for relations
- Don't duplicate types between Zod schemas and Drizzle schemas — they serve different purposes (AI output vs DB storage)
- Don't name client components `_client.tsx` — use descriptive PascalCase names (e.g. `SkillDetailClient.tsx`, `PortfolioOverview.tsx`)

## AI Agent Pattern

> Status: **SHIPPED.** `change-risk-classifier` is the first agent — definition at `src/automations/agents/definitions/change-risk-classifier.ts`, prompt at `src/automations/agents/prompts/change-risk-classifier.ts`, task at `src/automations/tasks/classify-change-risk.ts`. The agent runs from `process-webhook-event` on inbound PR webhooks and writes its classification to `skill_outcomes` + `intelligence`. The autonomy gate at PreToolUse (`src/operations/tool-events.ts`) decides whether a skill invocation executes or is blocked; blocked invocations are recorded in `automation_log` (not `governance_records` — autonomy overrides are a separate mechanism per spec §11.5 J10).

Every AI call follows the same 3-file pattern:

```
src/automations/agents/
  definitions/change-risk-classifier.ts    — Agent config + Zod output schema
  prompts/change-risk-classifier.ts        — System prompt + context builder
src/automations/tasks/
  classify-change-risk.ts                  — Orchestration: fetch data → build prompt → generate() → store results
```

### Agent definition

```ts
// definitions/change-risk-classifier.ts
export const changeRiskSchema = z.object({
  riskClass: z.enum(["low", "medium", "high", "critical"]),
  rationale: z.string(),
  signals: z.array(z.object({ kind: z.string(), evidence: z.string() })),
  recommendedGates: z.array(z.string()),
});

export const changeRiskClassifierAgent = {
  slug: "change-risk-classifier",
  model: DEFAULT_MODEL,
  temperature: 0.2,
  systemPrompt: changeRiskClassifierPrompt,
};
```

### Prompt

```ts
// prompts/change-risk-classifier.ts
export const changeRiskClassifierPrompt = `You are a change-risk analyst...`;

export function changeRiskClassifierPromptWithContext(params) {
  return `${changeRiskClassifierPrompt}\n## PROJECT: ${params.projectName}\n## DIFF:\n${params.diff}\n...`;
}
```

### Task (orchestration)

```ts
// tasks/classify-change-risk.ts
const prompt = changeRiskClassifierPromptWithContext({ projectName, diff, criticalPaths });
const result = await generate({ agent: changeRiskClassifierAgent, prompt, output: changeRiskSchema });
// result.object is fully typed from the Zod schema
await db.update(workItems).set({ riskClass: result.object.riskClass, ... });
```

### Rules

- **Zod schema** owns the AI output shape — the agent definition and task both reference it
- **`generate()`** in `src/lib/ai/` is the only AI call point. It handles model routing, retries, and validation
- **Tasks** never call LLM APIs directly — always go through `generate()`
- **Prompt** is separated from definition so context can be injected at call time
- **Output validation** happens automatically — `generate()` parses against the Zod schema and retries on failure (up to 3 attempts)
- **Every invocation appends a `skill_outcomes` row** via `src/operations/skill-invocation.ts` — `success` on clean return, `incident`/`high` on throw. This is what feeds the autonomy ledger.

## CRUD Factory

All entity CRUD goes through `createEntityCrud()` in `src/lib/crud.ts`. Real example from `src/operations/skills.ts`:

```ts
export const skillCrud = createEntityCrud({
  db,
  table: skills,
  queryKey: "skills",
  idField: "id",
  schema: skillSchema,                        // Zod validation on write
  searchFields: ["name", "description", "body"],
  onMutate: () => safeRevalidate("/skills"),
});
```

Gives you `.list()`, `.search()`, `.searchSemantic()`, `.get(id, { with })`, `.create()`, `.update()`, `.delete()` — all org-scoped, audit-trailed.

### Three data retrieval modes

| Method | What it does | Mechanism | Cost |
|--------|-------------|-----------|------|
| `list()` | Paginated listing, no filtering | Drizzle query, ordered by `createdAt desc` | Zero |
| `search(query)` | Full-text keyword search | PG `tsvector`/`tsquery` on `searchFields` columns | Zero |
| `searchSemantic(query)` | Deep semantic search | Hybrid (vector embeddings + BM25) via `coznt.documents` | OpenAI embedding API call |

All three return `{ items, total }` and support `offset` + `limit` pagination.

**`list()`** — paginated listing:

```ts
const { items, total } = await skillCrud.list({
  offset: 0,
  limit: 25,
  sortBy: "createdAt",
  sortOrder: "desc",
});
```

**`search()`** — full-text search with stemming and prefix matching:

```ts
const { items, total } = await skillCrud.search("schema migration reviewer", {
  offset: 0,
  limit: 25,
});
```

**`searchSemantic()`** — hybrid search, results sorted by relevance score:

```ts
const { items, total } = await skillCrud.searchSemantic("anything that touches the payments service", {
  offset: 0,
  limit: 20,
});
```

### Search configuration

`searchFields` — every entity should declare these. Full-text search uses them directly on entity columns via GIN indexes (no extra tables). Include rich text fields like `body`, `description`, `summary`, `rationale`. Each schema file has a matching GIN index on `coznt.fts_vector(...fields)`.

`searchConfig` — opt-in. Only needed for entities that also have embeddings in `coznt.documents` for `searchSemantic()`.

### Project-scoped + org-wide visibility

Skills and rules can be scoped to a single project OR org-wide (NULL `projectId`). The standard pattern, from `src/operations/skills.ts`:

```ts
export async function listSkillsForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.skills.findMany({
    where: and(
      eq(skills.organizationId, ctx.organizationId),
      eq(skills.enabled, true),
      or(eq(skills.projectId, projectId), isNull(skills.projectId)),
    ),
  });
}
```

For detail pages needing deeper relations, add a custom operation:

```ts
export async function getSkillDetail(id: string) {
  return skillCrud.get(id, {
    with: {
      outcomes: { with: { project: true } },
      autonomy: true,
      invocations: { limit: 50, orderBy: (i, { desc }) => desc(i.createdAt) },
    },
  });
}
```

## Async Task Engine (pgmq + triggers)

PG triggers fire on insert/update of watched tables → pgmq → worker polls and matches rules → tasks run sequentially. The HTTP response is instant; all AI / heavy work happens async in the worker.

Real example: when a `skill_outcomes` row is inserted, the trigger enqueues a job; the worker dispatches `recomputeSkillAutonomyTask` (in `src/automations/tasks/recompute-skill-autonomy.ts`) which re-runs promotion/demotion math for that `(skillId, projectId)` pair.

```ts
// Task receives a TaskParams with entityId of the row that triggered it
export async function recomputeSkillAutonomyTask(params: TaskParams): Promise<void> {
  // look up the outcome → recompute autonomy for its (skill, project) pair
}
```

Current tasks (`src/automations/tasks/`):
- `recompute-skill-autonomy.ts` — fires on `skill_outcomes` insert
- `compute-work-item-lead-time.ts` — fires when a work item closes
- `process-webhook-event.ts` — fires on inbound webhook events (GitHub PR, deploy)

`TaskParams` and rule registration live in `src/lib/rules.ts`.

> Separately, the `rules` table holds **declarative policy validators** (`keyword-presence`, `action-policy`) that gate plan writes and skill action attempts. Those run synchronously inside CRUD hooks — see `src/operations/rule-engine.ts`. Don't confuse them with the async task engine above.

## Project Structure

```
src/
├── actions/          Server actions ("use server" wrappers around operations)
├── app/(app)/        Route pages + client components + serializers
│                       projects/[id]/{overview,plans,work-items,governance,settings},
│                       plans, skills, audit, metrics, rules, integrations, api-keys, me
├── automations/
│   ├── agents/       Agent definitions (config + Zod output schema) and prompts
│   └── tasks/        Workflow functions fired by pgmq (fetch → prompt → generate → store)
├── components/       Shared UI components
├── db/schema/        Drizzle table definitions, relations, inferred types
│   ├── governance/   policies.ts, records.ts — the unified four-kind primitives
│   ├── plan/         plan-artifact.ts, plan-relationship.ts, plan-revision.ts, comment.ts
│   └── ...           project.ts, repository.ts, environment.ts, evidence.ts, etc.
├── domain/           Pure functions — e.g. outcomes.ts (deterministic assessors)
├── lib/              Core utilities
│   ├── ai/           AI client (generate()), NL read/write engines, entity tools
│   ├── auth/         Authentication (JWT, context, actions)
│   ├── events/       Event bus, listener, SSE stream
│   ├── governance/   schemas.ts — per-kind Zod for governance details JSONB
│   ├── integrations/ External service connectors (GitHub, encryption)
│   ├── plan/         schemas.ts — per-kind Zod for plan_artifact details JSONB
│   ├── search/       Hybrid search (FTS + semantic)
│   └── sql/          SQL executor, parser, schema context
└── operations/       Entity CRUD — thin wrappers around createEntityCrud factory
    ├── governance/   policies.ts, records.ts, evaluator.ts — single dispatch boundary
    ├── plan/         plans.ts (planArtifacts), relationships.ts, comments.ts
    ├── project/      projects.ts, repositories.ts, environments.ts, portfolio.ts, project-trust.ts
    └── evidence.ts   attach/list/dereference; one CRUD per primitive (no per-type tables)
```

### Design discipline — per spec §10

1. **One CRUD per primitive.** `governanceRecordCrud` and `evidenceCrud` via `createEntityCrud()` — no `approvalsCrud`, no `gatesCrud`. Thin convenience wrappers OK; parallel storage paths not.
2. **One status state machine.** `pending → passed | failed | skipped | expired`. Every kind maps onto these. Per-kind sub-states live in `details` JSONB.
3. **One policy-resolution engine.** `materializeGovernanceRecords({ planArtifactId, transitionFrom, transitionTo })` reads policies and creates records. Doesn't branch on kind.
4. **One evaluator dispatcher.** `evaluateGovernanceRecord(record)` in `src/operations/governance/evaluator.ts` is the **only** place `switch(kind)` is allowed.
5. **Kind is a filter chip, not a route.** No `/governance/approvals`, `/governance/gates` etc. — one `/governance/records` with kind chips.

Before adding any kind-specific table, column, operation, or UI route, see spec §10's three-question test.
