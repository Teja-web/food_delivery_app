# dilliznt — Architecture Plan

A web platform that orchestrates the full software delivery lifecycle. Generic by design — no editor lock-in. Built on the recruit/dilliznt template (single Next.js app, Drizzle, Better Auth, pgmq workers, AI agents, hybrid search).

---

## 1. Vision

**SDLC's scope, recruit's shape, a plan-driven distribution model.**

Where the original SDLC platform leans on a Cursor-specific MCP server to push rules/skills into developer environments, dilliznt instead treats the SDLC as a **versioned, markdown-first plan workflow** — inspired by:

- **Claude Code's plan mode** — every change starts as an approvable plan document
- **OpenSpec** — proposals, deltas, and tasks live as markdown in `openspec/changes/<id>/`, reviewable via PR
- **gstack** — phases are slash-command-style skills (`/plan-ceo-review`, `/ship`, `/review`, `/qa`) that any agent can invoke

Net result: the platform produces and curates **plan artifacts** (specs, ADRs, test cases, CI configs). Agents — Cursor, Claude Code, Aider, Codex, humans — consume them through a generic surface (HTTP API + CLI + optional git sync). No proprietary glue.

---

## 2. Target architecture (mirrors recruit)

```
dilliznt/
├── src/
│   ├── actions/                  "use server" wrappers around operations
│   ├── app/
│   │   ├── (app)/                Authenticated workspace UI
│   │   │   ├── projects/[id]/
│   │   │   ├── plans/[id]/
│   │   │   ├── adrs/
│   │   │   ├── rules/
│   │   │   ├── skills/
│   │   │   ├── approvals/
│   │   │   ├── integrations/
│   │   │   └── analytics/
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
│   ├── domain/                   Pure business logic (phase transitions, gates)
│   ├── lib/
│   │   ├── ai/                   generate(), model registry, NL read/write
│   │   ├── auth/                 Better Auth config + plugins + org plugin
│   │   ├── crud.ts               createEntityCrud() factory (ported from recruit)
│   │   ├── events/               Event bus, SSE stream
│   │   ├── integrations/         GitHub, Jira, ADO, Confluence, Slack clients
│   │   ├── plan/                 Plan rendering, diff, markdown ↔ DB
│   │   ├── git-sync/             Push/pull plan files to project repos
│   │   ├── search/               Hybrid FTS + semantic
│   │   ├── anonymize/            HMAC slug for public approval URLs
│   │   ├── rules.ts              Rules engine (entity, op, condition → tasks)
│   │   ├── queue.ts              pgmq client
│   │   └── worker.ts             Poll loop
│   └── operations/               Entity CRUD wrappers (one per entity)
├── scripts/
│   ├── worker.ts                 Worker entry point
│   ├── db-setup.ts               Create DB, extensions, schemas, admin
│   ├── db-seed.ts                Seed triggers, platform org, agents, rules
│   ├── db-reset.ts               Truncate operational data
│   └── crud-triggers.sql         PG trigger templates (table → pgmq)
├── packages/
│   └── cli/                      `npx dilliznt …` — the agent-facing CLI
├── drizzle/                      Versioned migrations
├── docs/
└── tests/                        Vitest + Playwright
```

**Stack** (lifted from recruit, current versions):

- Next.js 16, React 19, Tailwind 4, shadcn/ui, Radix
- Drizzle ORM + Postgres + pgmq + `pg_trgm` + `pgvector`
- Better Auth + org plugin + admin impersonation
- Vercel AI SDK (`@ai-sdk/openai`, `@ai-sdk/groq`) — model-agnostic
- Vitest + Playwright
- `concurrently` for web + worker
- `pnpm`, single package (CLI is the only workspace)

---

## 3. The plan-driven SDLC model

Every unit of work in dilliznt is a **Plan**. A plan is a markdown document with structured frontmatter, stored in DB (source of truth) and optionally synced to the project's git repo as a file.

### Plan lifecycle

```
draft → in_review → approved → in_progress → completed
                ↓                       ↓
            rejected              cancelled
```

### Plan kinds (one schema, six templates)

| Kind | SDLC phase | Frontmatter shape | Template file |
|---|---|---|---|
| `requirement` | Requirements & Planning | `acceptance_criteria[]`, `personas[]`, `priority`, `effort` | `requirement.md` |
| `adr` | Design & Architecture | `decision`, `context`, `consequences`, `alternatives[]` | `adr.md` |
| `feature_plan` | Development | `scope`, `tasks[]`, `affected_files[]`, `risks[]` | `feature.md` |
| `test_plan` | Testing & QA | `coverage_targets`, `test_cases[]`, `gates[]` | `test.md` |
| `release_plan` | CI/CD | `pipeline`, `environments[]`, `rollback`, `gates[]` | `release.md` |
| `incident` | Monitoring | `severity`, `timeline[]`, `root_cause`, `action_items[]` | `incident.md` |

All six share one `plans` table (Drizzle), differentiated by `kind` enum. Phase-specific fields live in a `details` JSONB column validated by Zod per kind.

### Rules and Skills as first-class entities

- **Rule** = a constraint, validated by an agent on demand (e.g. "all PRs must reference a requirement"). Stored as markdown with YAML frontmatter, served via API.
- **Skill** = a reusable workflow definition (system prompt + tool list + I/O schema). Server-side, callable from any agent over HTTP — same shape as Claude Code skills, OpenAI tools, or Cursor commands.

Distribution: agents fetch rules and skills by `project_id` + `phase` over HTTP. They don't need an SDK — `curl` works. Optional CLI (`npx dilliznt rules list`) and optional git sync (`.dilliznt/rules/*.md`).

---

## 4. Generic agent surface (no MCP requirement)

Three ways an agent — Cursor, Claude Code, Aider, a CI job, a human — consumes dilliznt:

1. **HTTP API** (`/api/v1`) — REST + JSON. Bearer token (project-scoped API key). Endpoints mirror MCP tools 1:1 (`GET /context`, `POST /plans`, `POST /plans/:id/submit`, `GET /rules?phase=development`, etc.).
2. **CLI** (`npx @dilliznt/cli`) — thin wrapper around the HTTP API. Reads `.dilliznt/config.json` in the project root for project ID + API key. Same commands as MCP tools.
3. **Git sync** (optional) — platform writes plan/rule/skill markdown into the project repo on a branch, agent reads files directly. Useful for offline / air-gapped workflows.

**MCP server is downgraded to an optional adapter**, not the primary surface. If the user wants Cursor/Claude Code MCP integration later, it's a 200-line wrapper over the HTTP API — same as recruit doesn't need MCP to work with AI tools.

---

## 5. Entity schema (one file per table)

Direct port from SDLC's Prisma, restructured for recruit's Drizzle pattern. Every entity is org-scoped, audit-trailed, has `searchFields` declared.

| Table | Purpose | Search fields |
|---|---|---|
| `organization` | Tenant. From Better Auth org plugin | `name`, `slug` |
| `user` | Better Auth | `name`, `email` |
| `project` | Top-level container, has phase, repo links | `name`, `description` |
| `plan` | Unified plan (requirement/adr/feature/test/release/incident) | `title`, `summary`, `body` |
| `plan_revision` | Versioned content, every save = new revision | `body` |
| `rule` | Markdown rule with YAML frontmatter | `title`, `body`, `tags` |
| `skill` | Reusable agent skill (prompt + I/O schema) | `name`, `description`, `body` |
| `approval` | Gate request linked to a plan | `note` |
| `comment` | Threaded review comment on a plan | `body` |
| `work_item` | Linked Jira/GitHub/ADO issue or PR | `title`, `description` |
| `integration` | Per-org credentials (encrypted) | `kind`, `label` |
| `webhook_event` | Inbound webhook log + dedupe | `source`, `payload` |
| `audit_log` | Every state change | `summary` |
| `automation_log` | Worker task execution log | `task`, `status` |
| `rate_limit` | Per-API-key rate buckets | `key` |
| `intelligence` | AI-generated annotations attached to any entity | `summary`, `body` |
| `document` | Embeddings index for semantic search | `title`, `body` |
| `notification` | In-app + email queue | `subject`, `body` |
| `event` | Domain event log (SSE source) | `kind`, `summary` |

---

## 6. What to port from SDLC verbatim

- All **integration clients** (`packages/integrations/*`) → `src/lib/integrations/{github,jira,ado,confluence}.ts`. Swap Octokit + `node-fetch` calls, keep the shapes.
- **Phase enforcement logic** (`apps/mcp-server/src/phase-enforcement.ts`) → `src/domain/phases.ts`. Pure functions, no MCP coupling.
- **Rule/skill markdown templates** → seed data in `scripts/db-seed.ts` + reference files in `docs/templates/`.
- **MCP tool contracts** (input/output Zod schemas in `apps/mcp-server/src/tools/*`) → `src/actions/*.ts` + `src/app/api/v1/*/route.ts`. Same shapes, just HTTP not stdio.
- **SDLC walkthrough doc** (`docs/sdlc-governed-flow-walkthrough.md`) → keep as the canonical product spec.

## What to drop

- **Turborepo monorepo** — single Next.js app + one CLI workspace, no turbo
- **Prisma + tRPC + NextAuth** — replaced by Drizzle + server actions + Better Auth
- **Stdio MCP server as primary surface** — replaced by `/api/v1` + optional MCP adapter
- **`@modelcontextprotocol/sdk` dependency** — not needed for core platform
- **Per-Cursor sync logic** — replaced by generic git-sync that any tool can read

---

## 7. Build order (suggested phases)

1. **Scaffold** — clone recruit's skeleton into a new repo, swap `dilliznt` → `dilliznt`, ports/secrets/db name.
2. **Auth + org** — Better Auth + org plugin working, seed admin.
3. **Core entities** — `project`, `plan`, `plan_revision`, `rule`, `skill`, `approval`, `audit_log`. Use the CRUD factory; build minimal UI.
4. **Plan workflow** — phase transitions, approval gates, comments, revisions. Domain logic in `src/domain/phases.ts`.
5. **Agent HTTP API** — `/api/v1/*` mirroring the SDLC MCP tools. Bearer auth, rate limits.
6. **CLI** — `packages/cli`, ~10 commands, published to npm.
7. **Integrations** — GitHub first (OAuth + webhooks + PR linking), then Jira, ADO, Confluence.
8. **Automations** — pgmq triggers; first task = AI requirement drafter, second = ADR generator, third = test case generator.
9. **Analytics** — DORA-ish metrics view; reuse recruit's reports pattern.
10. **(Optional) MCP adapter** — small standalone process that proxies stdio → HTTP for Cursor/Claude Code users who want it.

---

## 8. Open decisions

1. **Repo location** — new sibling at `/Users/ram/Projects/dilliznt`, scaffolded from recruit, or a `dilliznt/` subdir? (Recommend new sibling.)
2. **AI default model** — same as recruit (`gpt-5-mini` or whatever recruit uses) or switch to Claude via `@ai-sdk/anthropic`?
3. **Public approval portal** — keep recruit's HMAC slug pattern for approvers without accounts (yes, good fit) or require sign-in?
4. **CLI distribution** — npm public package, or private GitHub package?

Decide these and the next step is `cp -r ../recruit ../dilliznt && rg -l dilliznt | xargs sed -i '' s/dilliznt/dilliznt/g` followed by the entity work in step 3.
