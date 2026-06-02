# Coznt

AI-native SDLC platform. Plans, phase gates, and deployments are coordinated by skills (governed AI agents) under an autonomy ledger; DORA metrics accumulate from the same trusted timeline. Integrates with GitHub, Jira, Azure DevOps, and Confluence via adapter bindings.

## Setup

```bash
pnpm install
pnpm db:setup --reset  # creates DB, schema, triggers, default org + admin user
pnpm dev               # Next.js dev server + worker
# sign in at http://localhost:3029 with admin@coznt.app / admin123
```

`pnpm db:onboard` is optional — use it only to create an *additional* organization with its own owner.

For ongoing schema work:

```bash
pnpm db:push           # Fast iteration on a feature branch
pnpm db:generate       # Versioned migration before merge
pnpm db:migrate        # Apply committed migrations (prod path)
```

## Stack

- **Next.js App Router** (RSC + client components)
- **Drizzle ORM** + PostgreSQL (pgmq for async events, pg_cron for periodic jobs)
- **Vercel AI SDK** → OpenAI / Anthropic / Groq models
- **Zod** for validation (AI output + CRUD writes)
- **Better Auth** for sessions + organization scoping

## Routes

| Route | Description |
|---|---|
| `/projects`, `/projects/[id]`, `/projects/new` | Project workspace + phase gate state |
| `/plans`, `/plans/[id]`, `/plans/new` | Release / change plans |
| `/skills` | Governed AI agents (skills) and their autonomy levels |
| `/approvals` | Pending approvals queue |
| `/rules` | Automation rules (entity events → skill invocations) |
| `/metrics` | DORA + delivery analytics |
| `/api-keys` | Programmatic access tokens |

## API surface

Versioned at `/api/v1/*`: `projects`, `plans`, `deployments`, `metrics`, `rules`, `skills/[slug]/invoke`, `test-runs`, `work-items`, `webhooks/[source]`, `context`. SSE event stream at `/api/events/stream`.

## Architecture

See [CLAUDE.md](./CLAUDE.md) for patterns, conventions, and detailed architecture docs.
