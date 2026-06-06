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

## Process model

Three product binaries, all symmetric under `src/`:

| Binary | Entry point | Start command |
|---|---|---|
| Next.js web | `src/app/` | `pnpm dev` / `pnpm start:server` |
| pgmq worker daemon | `src/worker.ts` | `pnpm dev:worker` / `pnpm start:worker` |
| MCP server | `src/mcp/bin.ts` | `pnpm mcp` |
| CLI | `src/cli/cli.ts` | `pnpm cli` |

`pnpm dev` and `pnpm start` run web + worker together via `concurrently`.

## CLI

The `coznt` CLI ships as a self-contained tarball produced by `pnpm cli:pack` (or rolled up with `pnpm prebuild`). Install from your local dev server:

```bash
pnpm i -g http://localhost:3029/install/coznt-cli-0.1.0.tgz
coznt --help
```

To reset to a fresh build (after `pnpm prebuild` produces a new tarball at the same version):

```bash
pnpm rm -g coznt-cli
pnpm store prune
rm -rf ~/.npm/_npx ~/.npx
pnpm i -g http://localhost:3029/install/coznt-cli-0.1.0.tgz
```

The same install URL pattern works for the MCP server (`coznt-mcp-0.1.0.tgz`) and the prompt hook (`coznt-prompt-hook-0.1.0.tgz`) — both also produced by `pnpm prebuild`.

## Architecture

See [CLAUDE.md](./CLAUDE.md) for patterns and conventions. For the file-organization layout (layer-first top level, domain-family subfolders), see [docs/dev/file-organization-strategy.md](./docs/dev/file-organization-strategy.md).
