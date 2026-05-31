# Developer-Velocity Implementation Changelist

Concrete engineering work required to deliver [developer-velocity.md](../product/developer-velocity.md), filtered through the cuts in [super-productivity-feature-gap.md](../product/super-productivity-feature-gap.md).

Organized by *what you actually have to write*. Schema → code locations → existing files to edit → external surfaces → sequencing.

## 1. Schema migrations

All additive. Use `pnpm db:generate`, commit `drizzle/00XX_*.sql` + `_journal.json`.

### 1a. Provenance — load-bearing

Add to both `src/db/schema/plans.ts` and `src/db/schema/work-items.ts`:

```ts
aiAuthored: boolean().notNull().default(false),
generatedByModel: text(),                // "claude-opus-4-7"
generatedBySkillId: uuid().references(() => skills.id),
autonomyAtGeneration: integer(),         // 0–3 snapshot
promptHash: text(),
generatedAt: timestamp(),
```

Also on `work_items.ts` only:
```ts
implementsPlanId: uuid().references(() => plans.id),  // spec linkback
```

Index `implementsPlanId` and `generatedBySkillId`.

### 1b. Autonomy event log

New file `src/db/schema/skill-autonomy-events.ts` — append-only:

```ts
id, organizationId, skillId, projectId,
direction: enum("promoted" | "demoted"),
fromLevel: integer(), toLevel: integer(),
reason: text(),                          // e.g. "5 clean outcomes in 30d"
triggeringOutcomeIds: uuid().array(),
createdAt: timestamp(),
```

Add to relations file. Update `src/db/schema/index.ts`.

### 1c. Gate overrides

New columns on `src/db/schema/phase-gates.ts` (or new table `gate_overrides`):

```ts
overriddenAt, overriddenBy, overrideReason,
overrideAuthorizingPlanId,
overrideAutonomyAtTime: integer(),
```

### 1d. Migration backfill

`drizzle/00XX_..._backfill.sql` — set `aiAuthored = false` on all existing rows. (The `.default(false)` handles new rows.)

## 2. New code files

### 2a. Libraries (`src/lib/`)

| Path | Purpose |
|---|---|
| `src/lib/short-syntax/parser.ts` | Tokenizer + parser for `#kind +project @assignee →approval:x 2d` |
| `src/lib/short-syntax/grammar.ts` | Regex constants and grammar table |
| `src/lib/short-syntax/parser.test.ts` | Unit tests for each token form |
| `src/lib/provenance/record.ts` | Helper to populate provenance fields on insert (called from agent tasks) |
| `src/lib/provenance/summarize.ts` | Compute provenance summary (counts, ratios) for an entity |
| `src/lib/verification-debt/score.ts` | Implement the formula from `verification-debt-thesis.md` |
| `src/lib/source-of-record/writeback.ts` | Adapter-dispatching `postComment(entityRef, body)` |

### 2b. Operations (`src/operations/`)

| Path | Purpose |
|---|---|
| `src/operations/personal.ts` | `listMyOpenApprovals`, `listApprovalsBlockingMe`, `getMyAutonomyAcrossProjects`, `getMyOutcomesInWindow` |
| `src/operations/autonomy-events.ts` | `recordAutonomyEvent`, `listAutonomyEventsForUser` |
| `src/operations/verification-debt.ts` | `computeProjectDebt(projectId)`, `projectedDeltaForPR(prId)` |
| `src/operations/gate-overrides.ts` | `recordOverride(gateId, planId, reason)` |

### 2c. Actions (`src/actions/`)

| Path | Purpose |
|---|---|
| `src/actions/me.ts` | `getMeDashboard()` (composite call into `personal.ts`) |
| `src/actions/blockers.ts` | `requestApproval(approvalId)` — writes source-of-record comment via `writeback.ts` |
| `src/actions/gates.ts` (extend) | `overrideGate(gateId, reason, planRef)`, `selfApprove(approvalId)` |
| `src/actions/short-syntax.ts` | `parseShortSyntax(input)` for live-preview web quick-add |
| `src/actions/plan.ts` (extend) | `createPlanFromShortSyntax(input)` — composes parser + normal CRUD |

### 2d. Async tasks (`src/automations/tasks/`)

| Path | Trigger |
|---|---|
| `src/automations/tasks/notify-autonomy-change.ts` | After `skill_autonomy_events` insert — posts comment to bound PR/issue |
| `src/automations/tasks/tag-provenance.ts` | After `plans`/`work_items` insert from agent path — fills provenance fields if not set |
| `src/automations/tasks/refresh-verification-debt.ts` | After `skill_outcomes` insert — recomputes project debt (materialized) |
| `src/automations/tasks/post-pr-provenance-comment.ts` | After webhook event for PR open / push — composes provenance summary, posts via adapter |

Register triggers in `scripts/db-setup.ts`. Register tasks in `src/lib/rules.ts`.

### 2e. MCP tools (`src/mcp/`)

Audit `src/mcp/phase-tool-map.ts` first to identify which already exist. Target verb set:

| Verb | Action |
|---|---|
| `coznt_plan` | Accepts short syntax; creates draft Plan |
| `coznt_approve` | Approve by id (server checks autonomy) |
| `coznt_gate_status` | Fetch gate status for project |
| `coznt_verification_debt` | Fetch debt score + breakdown |
| `coznt_autonomy` | Fetch autonomy per skill/project |
| `coznt_provenance` | Fetch provenance for a PR/Plan/WorkItem |
| `coznt_sync` | Read-only refresh from source-of-record |
| `coznt_me` | Personal dashboard payload |

### 2f. UI routes + components

| Path | Purpose |
|---|---|
| `src/app/(app)/me/page.tsx` | `/me` route |
| `src/app/(app)/me/serialize.ts` | Drizzle → client types |
| `src/app/(app)/me/MePersonalDashboard.tsx` | Client component |
| `src/components/verification-debt/BlockerMap.tsx` | Drop into Plan detail + portfolio |
| `src/components/provenance/SummaryPanel.tsx` | Counts + ratios only; no code rendering |
| `src/components/autonomy/OutcomeHeatmap.tsx` | Drop into Skill detail |
| `src/components/search/CommandPalette.tsx` | Global `Shift+F` |

### 2f-bis. Tanznt component references (mine before writing fresh)

Per [[reference_recruit_portal]] memory: mine these `/Users/ram/Projects/tanznt` patterns for *layout and structure*. Do **not** import directly; write fresh in coznt's design system (DM Sans + Bricolage + JetBrains Mono per `globals.css`, dark-default per `DESIGN.md`).

| Coznt deliverable | Tanznt pattern to mine | What to take |
|---|---|---|
| `MePersonalDashboard.tsx` | `src/app/(candidate)/(protected)/dashboard/` + `src/app/(portal)/(protected)/dashboard/dashboard-client.tsx` | Dashboard composition: section ordering, eyebrow + tile grid + actionable rows |
| `BlockerMap.tsx` | `src/components/TriageItem.tsx` + `src/components/portal/nudge-tray.tsx` | Actionable-row pattern: title + meta + action button; tray density |
| `SummaryPanel.tsx` | `src/components/portal/stat-tile.tsx` | Single-stat tile is the building block; SummaryPanel is a grid of these |
| `OutcomeHeatmap.tsx` | `src/components/portal/trajectory-canvas.tsx` + `talent-radar.tsx` | Time-series + progression dataviz patterns |
| `CommandPalette.tsx` | `src/components/portal/candidate-command-palette.tsx` | Palette UX: keybind capture, fuzzy match routing, result type rendering |
| All section headers in new routes | `src/components/portal/eyebrow-heading.tsx` | Small-caps eyebrow label above section content |
| All empty list states | `src/components/empty-state.tsx` | Empty-state composition |
| Multi-tab views on `/me` (if added) | `src/components/portal/role-tab-nav.tsx` | Tab navigation |
| App shell / sidebar (if not yet final) | `src/components/shell/AppShell.tsx` | Layout primitives |

**What NOT to mine from tanznt:** color/typography (coznt has its own design system), domain code (candidates / opportunities / assessments — irrelevant), direct imports.

## 3. Existing files to edit

| File | Change |
|---|---|
| `src/mcp/phase-tool-map.ts` | Add the verbs listed above |
| `src/automations/tasks/recompute-skill-autonomy.ts` | After autonomy delta, insert into `skill_autonomy_events` |
| `src/automations/tasks/process-webhook-event.ts` | On PR-open event, enqueue `post-pr-provenance-comment` |
| `scripts/db-setup.ts` | Register new pgmq triggers (autonomy events, provenance tag, PR provenance) and the `coznt:linkback_health` cron |
| `src/lib/rules.ts` | Register the four new task params |
| `src/automations/agents/definitions/*.ts` (when added at M-C) | Agent tasks must call `provenance/record.ts` on insert |
| `src/lib/crud.ts` | `createEntityCrud` — pass through optional `provenance` arg so agent-path inserts populate fields atomically |
| `src/operations/skills.ts`, `src/operations/work-items.ts`, `src/operations/plans.ts` | Add `sourceLink` extraction where missing; verify uniform iconography contract |
| `CLAUDE.md` | Add the verification-debt + provenance pattern to the agent-pattern section |

## 4. New external surfaces

### 4a. `coznt` CLI binary

- Location: `packages/cli/` (new pnpm workspace package) or top-level `bin/coznt`
- Transport: stdio MCP client → existing MCP server
- Auth: API key from existing `api-keys` page (env var `COZNT_API_KEY`)
- Output: `--format table|json`, default table
- Verbs: 1-to-1 with the MCP tool list above
- Package + ship: `npm pack` to a private registry (per [[feedback_mcp_private_distribution]]) — never publishes to public npm

### 4b. VS Code extension

- New repo or `packages/vscode-extension/`
- Command palette entries: 10 verbs above
- Status bar item: personal autonomy + open-approval count (polls `/me` action or MCP `coznt_me`)
- Distribution: private VSIX, not Marketplace (consistent with MCP distribution rule)

### 4c. New integration adapters (`src/lib/integrations/`)

| Adapter | Priority | Surface |
|---|---|---|
| `linear/` | high | `searchIssues`, `getIssue`, `postComment`, `webhookHandler` |
| `gitlab/` | high | mirror existing `github/` adapter |
| `clickup/` | medium | same minimal surface as Linear |

Each adapter must implement the writeback contract from `src/lib/source-of-record/writeback.ts`.

### 4d. PR-check provenance comment bot

- Implemented as a task (`post-pr-provenance-comment.ts`, listed above)
- Webhook path already exists in `src/automations/tasks/process-webhook-event.ts`
- Output: PR check status + comment with provenance summary, deep-link to coznt Plan detail
- Idempotent on PR update (replaces prior comment)

## 5. Cron jobs (`scripts/db-setup.ts` `setupCronJobs()`)

| Name | Cadence | Body |
|---|---|---|
| `coznt:linkback_health` | hourly | enqueue verification of `sourceLink` validity per entity batch |
| `coznt:verification_debt_recompute` | every 15min | enqueue debt recompute per active project (backstop to outcome-trigger) |

## 6. Sequencing (matches gap doc milestones)

### Milestone B bridge (next)
1. Schema 1a (provenance) + 1b (autonomy events) + 1d (backfill)
2. `src/lib/provenance/`, `src/lib/verification-debt/`
3. `src/operations/personal.ts`, `verification-debt.ts`, `autonomy-events.ts`
4. `src/actions/me.ts`, gate-overrides additions
5. `/me` route + `BlockerMap.tsx` + `SummaryPanel.tsx`
6. Edit `recompute-skill-autonomy.ts` to log autonomy events
7. `sourceLink` audit + universal iconography component

### Milestone C (first AI agent)
1. `src/lib/short-syntax/` (parser + tests)
2. MCP tools: `coznt_plan`, `coznt_autonomy`, `coznt_verification_debt`, `coznt_me`, `coznt_provenance`
3. `packages/cli/` (CLI binary)
4. `post-pr-provenance-comment.ts` task + webhook wiring
5. Agent definitions wired through `provenance/record.ts`
6. `OutcomeHeatmap.tsx` on skill detail

### Milestone D (dispatch gate)
1. VS Code extension (`packages/vscode-extension/`)
2. Linear adapter (`src/lib/integrations/linear/`)
3. GitLab adapter (`src/lib/integrations/gitlab/`)
4. `requestApproval` writeback via adapters
5. `coznt:linkback_health` cron
6. `CommandPalette.tsx` global search

### Milestone E (IDE input)
1. ClickUp adapter
2. (deferred indefinitely) JetBrains plugin

## 7. Quantified scope estimate

| Area | LOC est. | Files touched | Risk |
|---|---|---|---|
| Schema + migrations | ~150 | 5 schema files + 2 migrations | low (additive) |
| Provenance libs + tagging | ~250 | 4 new files, 3 edits | low |
| Verification-debt scoring | ~200 | 2 new files, 1 task | medium (formula tuning) |
| `/me` dashboard end-to-end | ~600 | 5 new files, 1 action | low (follows page pattern) |
| BlockerMap + SummaryPanel + Heatmap | ~700 | 3 new components | low |
| Short-syntax parser + tests | ~400 | 3 new files | low |
| MCP tool additions | ~500 | 8 verb handlers + map edit | low |
| CLI binary | ~600 | new package | medium (transport + auth) |
| PR provenance bot | ~300 | 1 task + GH adapter edit | medium (webhook idempotency) |
| Linear adapter | ~800 | 1 adapter package | medium |
| GitLab adapter | ~700 | mirror GitHub | low |
| VS Code extension | ~1000 | new package | high (test matrix) |
| Total (B–D) | **~6,200 LOC** | **~35 files** | mixed |

## 8. What this does NOT require

To validate scope honesty:

- No replacement of the CRUD factory — every new operation uses it
- No new auth surface — CLI uses existing API key model
- No new infra — pgmq, pg_cron, webhooks, MCP server already in place
- No new docs site — markdown in `docs/` is sufficient
- No personal todo / time tracking / pomodoro features (cut per gap doc)
- No code-rendering UI in coznt (cut per gap doc)
- No coznt-owned notification channel (cut per gap doc)
- No system-wide hotkeys (cut per gap doc)

## Related

- [developer-velocity.md](../product/developer-velocity.md) — the contract this implements
- [super-productivity-feature-gap.md](../product/super-productivity-feature-gap.md) — the audited gap
- [verification-debt-thesis.md](../product/verification-debt-thesis.md) — score formula source
- `CLAUDE.md` — page data pattern, CRUD factory, async task engine, agent pattern
