# Coznt — LLM Context

## Two Sources of Truth

Every data type derives from exactly one of:

| Source | Owns | Where |
|--------|------|-------|
| **Drizzle schema** | DB shape, relations, `$inferSelect` types | `src/db/schema/*.ts` |
| **Zod schema** | AI agent output shape | `src/automations/agents/definitions/*.ts` |

No manual TypeScript interfaces for data shapes. Everything else is derived.

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

When the AI produces a new field (e.g. `summary`), touch exactly 3 files:

1. **Zod schema** — add field to agent output (`src/automations/agents/definitions/`)
2. **Drizzle schema** — add column (`src/db/schema/`), then run `pnpm db:generate` to produce a versioned migration in `drizzle/`. **Commit the SQL alongside the schema change.**
3. **Task** — store it in the DB write (`src/automations/tasks/`)

The serializer picks it up via Drizzle relations. The client picks it up via the type import. No manual interface updates.

### Migrations workflow

- **Local dev**: `pnpm db:push` is fine for fast iteration on a feature branch.
- **Before merging to main**: run `pnpm db:generate` and commit the generated `drizzle/00XX_*.sql` + the updated `drizzle/meta/_journal.json`.
- **Production**: `pnpm db:migrate` applies committed migrations. Never `db:push` to prod — it bypasses the audit trail and silently drops/recreates indexes.
- If you change a schema file in a PR, the diff against `drizzle/meta` should produce a new migration. CI should fail if `pnpm db:generate` produces an uncommitted diff.

### Example: Role detail page

```
page.tsx:   fetchRoleDetail(id)                    → serializeRoleDetail(role)  → <RoleDetailClient {...props} />
              ↓                                       ↓
actions:    getRoleDetail(id)                       serialize.ts exports types
              ↓                                       ↓
operations: roleCrud.get(id, { with: {              RoleDetailClient.tsx imports from serialize.ts
              applications: { candidate, match },     (no manual interfaces)
              matches: { candidate },
            }})
```

### What NOT to do

- Don't import `db` in page components — use actions/operations
- Don't declare data interfaces in client components — import from `serialize.ts`
- Don't write raw `db.select().from().innerJoin()` in pages — use the CRUD factory's `.get()` or `.list()` with `with` for relations
- Don't duplicate types between Zod schemas and Drizzle schemas — they serve different purposes (AI output vs DB storage)
- Don't name client components `_client.tsx` — use descriptive PascalCase names (e.g. `RoleDetailClient.tsx`, `CandidatesList.tsx`)

## AI Agent Pattern

Every AI call follows the same 3-file pattern:

```
src/automations/agents/
  definitions/role-candidate-matcher.ts    — Agent config + Zod output schema
  prompts/role-candidate-matcher.ts        — System prompt + context builder
src/automations/tasks/
  match.ts                                 — Orchestration: fetch data → build prompt → generate() → store results
```

### Agent definition

```ts
// definitions/role-candidate-matcher.ts
export const roleCandidateMatchSchema = z.object({
  fitScore: z.number().min(0).max(100),
  alignment: z.array(z.object({ criterion: z.string(), score: z.number(), evidence: z.string() })),
  recommendation: z.string(),
  signal: z.string(),
  gaps: z.array(z.string()),
  summary: z.string(),
});

export const roleCandidateMatcherAgent = {
  slug: "role-candidate-matcher",
  model: DEFAULT_MODEL,
  temperature: 0.2,
  systemPrompt: roleCandidateMatcherPrompt,
};
```

### Prompt

```ts
// prompts/role-candidate-matcher.ts
export const roleCandidateMatcherPrompt = `You are a recruitment matching analyst...`;

export function roleCandidateMatcherPromptWithContext(params) {
  return `${roleCandidateMatcherPrompt}\n## ROLE: ${params.roleTitle}\n...`;
}
```

### Task (orchestration)

```ts
// tasks/match.ts
const prompt = roleCandidateMatcherPromptWithContext({ candidateProfile, roleCriteria, ... });
const result = await generate({ agent: roleCandidateMatcherAgent, prompt, output: roleCandidateMatchSchema });
// result.object is fully typed from the Zod schema
await db.update(matches).set({ fitScore: result.object.fitScore, ... });
```

### Rules

- **Zod schema** owns the AI output shape — the agent definition and task both reference it
- **`generate()`** in `src/lib/ai.ts` is the only AI call point. It handles model routing, retries, and validation
- **Tasks** never call LLM APIs directly — always go through `generate()`
- **Prompt** is separated from definition so context can be injected at call time
- **Output validation** happens automatically — `generate()` parses against the Zod schema and retries on failure (up to 3 attempts)

## CRUD Factory

All entity CRUD goes through `createEntityCrud()` in `src/lib/crud.ts`:

```ts
const roleCrud = createEntityCrud({
  db, table: roles, queryKey: "roles", idField: "id",
  schema: roleSchema,                         // Zod validation on write
  getWith: { applications: true },            // default relations on read
  searchFields: ["title", "team", "department", "location", "description", "businessCase"],
  searchConfig: { tableName: "roles" },       // enables hybrid search
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
const { items, total } = await roleCrud.list({
  offset: 0,
  limit: 25,
  sortBy: "createdAt",
  sortOrder: "desc",
});
```

**`search()`** — full-text search with stemming and prefix matching:

```ts
const { items, total } = await roleCrud.search("engineering manager", {
  offset: 0,
  limit: 25,
});
```

**`searchSemantic()`** — hybrid search, results sorted by relevance score:

```ts
const { items, total } = await roleCrud.searchSemantic("someone who can lead a team", {
  offset: 0,
  limit: 20,
});
```

### Search configuration

`searchFields` — every entity should declare these. Full-text search uses them directly on entity columns via GIN indexes (no extra tables). Include rich text fields like `resumeText`, `description`, `notes`, `transcript`. Each schema file has a matching GIN index on `to_tsvector('english', concat_ws(' ', ...fields))`.

`searchConfig` — opt-in. Only needed for entities that also have embeddings in `coznt.documents` for `searchSemantic()`.

For detail pages needing deeper relations, add a custom operation:

```ts
export async function getRoleDetail(id: string) {
  return roleCrud.get(id, {
    with: {
      applications: { with: { candidate: true, match: true, interviews: true } },
      matches: { with: { candidate: true } },
    },
  });
}
```

## Rules Engine

PG triggers fire on insert/update → pgmq → worker polls and matches rules → tasks run sequentially:

```ts
// src/lib/rules.ts
{ id: "candidate:insert", entityType: "candidate", operation: "insert",
  tasks: [candidateIntake, evaluateMatchesForCandidate] }
```

The HTTP response is instant. All AI processing happens async in the worker.

## Project Structure

```
src/
├── actions/          Server actions ("use server" wrappers around operations)
├── app/(app)/        Route pages + client components + serializers
├── automations/
│   ├── agents/       Agent definitions (config + Zod output schema) and prompts
│   └── tasks/        Workflow functions (fetch → prompt → generate → store)
├── components/       Shared UI components
├── db/schema/        Drizzle table definitions, relations, inferred types
├── lib/              Core utilities
│   ├── ai/           AI client, NL read/write engines, entity tools
│   ├── auth/         Authentication (JWT, context, actions)
│   ├── events/       Event bus, listener, SSE stream
│   ├── integrations/ External service connectors (Google Calendar, encryption)
│   ├── search/       Hybrid search (FTS + semantic)
│   └── sql/          SQL executor, parser, schema context
└── operations/       Entity CRUD — thin wrappers around createEntityCrud factory
```
