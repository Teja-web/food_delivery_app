# Rename plan: `dilliznt` → `coznt`

This repo (currently named `dilliznt`, the SDLC platform) becomes `coznt`. The existing `~/Projects/coznt` repo (L&D / careers product, GitHub `rdraju/coznt`) takes over the `dilliznt` name in a coordinated swap.

## Cross-repo coordination

The GitHub name `rdraju/coznt` is currently taken by the OTHER repo. Order of operations:

1. **Other repo first** — rename `~/Projects/coznt` → `~/Projects/dilliznt` and rename GitHub `rdraju/coznt` → `rdraju/dilliznt` (GitHub auto-redirects old URLs). This frees `rdraju/coznt`.
2. **This repo second** — apply the plan below, then create a fresh GitHub `rdraju/coznt` and push.

Local directory swap needs a temp name to avoid a collision:
```
mv ~/Projects/coznt          ~/Projects/_swap_tmp
mv ~/Projects/dilliznt       ~/Projects/coznt
mv ~/Projects/_swap_tmp      ~/Projects/dilliznt
```

## Substitution table

| Pattern | Replacement | Where |
|---|---|---|
| `dilliznt` | `coznt` | lowercase: schema, db, queue, env, log prefixes |
| `Dilliznt` | `Coznt` | title case: docs, headings, comments |
| `DILLIZNT` | `COZNT` | console banners |
| `dillizntSchema` | `cozntSchema` | TS variable name |
| `admin@dilliznt.app` | `admin@coznt.app` | seed default |

## Files to edit (catalog)

### Identity / docs
- `package.json` — `"name": "dilliznt"` → `"coznt"`
- `CLAUDE.md` — title + body mentions
- `README.md`, `docs/architecture.md`, `docs/borrowings-from-ai-sdlc-framework.md`

### Drizzle schema (Postgres schema name)
- `src/db/schema/schema.ts` — `pgSchema("dilliznt")` + exported symbol `dillizntSchema`
- `drizzle.config.ts` — `schemaFilter: ["dilliznt", "auth"]`
- All ~25 files in `src/db/schema/*.ts` — two patterns each:
  - `import { dillizntSchema } from "./schema"` → `cozntSchema`
  - Raw SQL template literals: `` sql`dilliznt.fts_vector(...)` `` (in GIN indexes — see `project.ts`, `skill.ts`, etc.)

### NL→SQL prompt (load-bearing strings, not just comments)
- `src/lib/sql/schema-context.ts` — `dilliznt.candidates`, `dilliznt.roles`, …  ⚠️ **Note:** these table names are *also stale* (talent-domain leftovers, current schema is SDLC). Rename string only; flag the staleness as a separate cleanup ticket.
- `src/lib/sql/parser.ts` — schema-prefix guard / comment

### Worker + events
- `scripts/worker.ts` — `APP_ID = "dilliznt"`, `QUEUE_NAME = "dilliznt_events"`, doc comment
- `src/lib/events/listener.ts` — `[dilliznt:listener]` log prefix
- `src/automations/tasks/process-webhook-event.ts` — comment refs

### Setup / seed scripts
- `scripts/db-setup.ts` — DB-name fallback (`postgres://…/dilliznt`), `CREATE SCHEMA dilliznt`, `dilliznt.immutable_concat_ws`, `dilliznt.fts_vector`, pg_cron gating, banner `DILLIZNT DATABASE SETUP`
- `scripts/db-onboard.ts` — `CREATE SCHEMA IF NOT EXISTS dilliznt`, `INSERT INTO dilliznt.departments`, banner
- `scripts/db-reset.ts` — table list `dilliznt.documents`, `dilliznt.automation_logs`, …
- `scripts/db-seed.ts` — `dilliznt_events` queue check, log prefix, `trigger_schema = 'dilliznt'`

### Env
- `.env`, `.env.example` — header comment, `DATABASE_URL=postgres://…/dilliznt`, `SEED_ADMIN_EMAIL` default

### Docker / Postgres infra
- `docker/docker-compose.yml` — `cron.database_name=dilliznt`
- `docker/postgres.Dockerfile` — same in `CMD`

### Migrations (DO NOT REWRITE)
- `drizzle/0000_*.sql` … `drizzle/0004_*.sql` and all `drizzle/meta/*_snapshot.json` files — leave untouched. They are an immutable history of what was applied to the old schema name. The `ALTER SCHEMA` migration below brings the existing tables under the new name; old migrations remain valid against history.

## Postgres schema rename (the load-bearing step)

Add a new migration:

```sql
-- drizzle/0005_rename_schema_to_coznt.sql
ALTER SCHEMA dilliznt RENAME TO coznt;
```

This single statement renames the schema and every table/index/sequence inside it atomically. Functions inside it (`fts_vector`, `immutable_concat_ws`) move with the schema.

After the migration runs, run `pnpm db:generate` once. It should produce **no new diff** if the source-side substitutions are correct. If it produces a diff, the substitutions missed something — investigate before committing.

The new snapshot file `drizzle/meta/0005_snapshot.json` will be `coznt.*` everywhere; older snapshots stay `dilliznt.*` and that's fine.

## Postgres database rename (separate from schema rename)

The PG **database** is also called `dilliznt` (not just the schema inside it). Rename:

```sql
-- Run from a different DB (e.g. postgres), no active connections to dilliznt
ALTER DATABASE dilliznt RENAME TO coznt;
```

Then update:
- `DATABASE_URL` in `.env` and `.env.example`
- `cron.database_name=dilliznt` → `coznt` in both docker files
- DB-name fallbacks in `scripts/db-setup.ts` (`/dilliznt` in the connection string and the `dbName === "dilliznt"` guard)

Restart the Postgres container after editing the docker config so pg_cron picks up the new `cron.database_name`.

## pgmq queue rename

The queue `dilliznt_events` is created by `db-setup.ts`. Easiest path in dev:

```sql
SELECT pgmq.drop_queue('dilliznt_events');
SELECT pgmq.create_queue('coznt_events');
```

Then update `QUEUE_NAME` in `scripts/worker.ts` and the queue-check string in `scripts/db-seed.ts`. The PG triggers that enqueue events will need to point at the new queue name too — check `scripts/crud-triggers.sql` (or wherever the trigger payloads are emitted) for `dilliznt_events` references.

## Execution order (single session)

1. Stop dev server + worker; ensure no clients connected to the DB.
2. Apply `ALTER SCHEMA` + `ALTER DATABASE` + queue drop/recreate against local Postgres.
3. Sed-pass the substitution table across all files in the catalog (case-sensitive, three passes for the three cases).
4. Hand-verify the migration files were *not* touched (`git status drizzle/`).
5. `pnpm db:generate` — expect no diff. If diff, investigate.
6. `pnpm type-check` and `pnpm test` — should pass with no behavioral changes.
7. `pnpm dev` — confirm worker connects to new queue, app loads.
8. Commit as a single rename PR (or one commit if no remote yet).
9. Rename local dir using the swap recipe above.
10. Create GitHub `rdraju/coznt`, push.

## Rollback

The whole rename is reversible while local-only:
- `ALTER SCHEMA coznt RENAME TO dilliznt;`
- `ALTER DATABASE coznt RENAME TO dilliznt;`
- `git revert` the rename commit.

After pushing to a remote and onboarding others, rollback gets harder — do this before that point.

## Out of scope (separate cleanups)

- Stale talent-domain table names in `src/lib/sql/schema-context.ts` (candidates/roles/applications) — current schema is SDLC. Rename pass keeps the strings, leaves the staleness for a follow-up.
- Logo / branding assets — none in repo currently.
