# Developer Velocity — Comprehensive Execution Plan

Companion to [dev-velocity-implementation.md](dev-velocity-implementation.md). The implementation doc is the parts-list; **this is the execution narrative**: MCP audit findings, architecture constraints, per-milestone phasing with acceptance criteria, risks, and open decisions to make before kickoff.

## 1. Executive summary

**What we are shipping.** The developer-velocity contract from [developer-velocity.md](../product/developer-velocity.md), delivered through the **Govern → Verify → Trust** operating model in [positioning.md](../product/positioning.md). The analytical engine is the verification-debt thesis in [verification-debt-thesis.md](../product/verification-debt-thesis.md). The doctrine survived a vision-alignment self-audit captured in [super-productivity-feature-gap.md](../product/super-productivity-feature-gap.md).

**Total scope.** ~6,200 LOC across ~35 files over four milestones (B bridge → C → D → E). No new infrastructure. No CRUD-factory or auth changes.

**Key MCP changes.** Add 8 new tool verbs, expose provenance metadata on plans/work_items, expose autonomy paths. The existing 41-tool surface is preserved; new verbs follow the same `tool({ name, description, schema, run })` pattern in `src/mcp/server.ts`.

**Doctrine that constrains every decision.** From the existing `src/mcp/server.ts` comment, locked in by architecture review:

> If it changes a file on the dev's machine, a branch in their repo, or a ticket in their tracker, it belongs to the agent/dev surface. If it changes a verdict, an approval, or a ledger row, it belongs here.

Every new tool, action, and writeback in this plan is checked against this rule.

## 2. MCP server audit

### 2a. Current state (41 tools, mature)

The existing MCP server (`src/mcp/server.ts`) is well-organized. Tools group cleanly into seven categories:

| Category | Existing tools | Notes |
|---|---|---|
| **Orientation / navigation** | `get_my_context`, `get_project_status`, `get_phase_checklist`, `get_requirements`, `get_assigned_work`, `get_outcomes`, `get_plans`, `check_standards`, `session_start`, `session_end` | All in `ALWAYS_ALLOWED`. `get_my_context` already surfaces *autonomy levels per skill* — partial coverage of `coznt_autonomy`. |
| **Phase governance** | `submit_phase_for_review`, `advance_phase`, `mark_gate_passed`, `submit_for_approval` | `submit_for_approval` *creates* approval rows; no tool *resolves* them. |
| **Search** | `search_audit`, `search_outcomes`, `search_plans`, `search_learnings` | Solid foundation for the `coznt_verification_debt` debt-by-evidence story. |
| **Requirements (phase-gated)** | `draft_requirement`, `list_draft_requirements`, `update_draft_requirement`, `delete_draft_requirement`, `push_requirements`, `create_requirement` | Local-buffer + push model is the prototype for short-syntax authoring. |
| **Design / Dev / Test / CICD** | `log_decision`, `get_design_context`, `generate_tests`, `update_work_item_status`, `update_test_result`, `get_pipeline_status`, `generate_pipeline`, `trigger_pipeline` | Phase-gated via `TOOL_PHASE_MAP`. |
| **Plan write** | `upsert_plan` | **Already exists.** New `coznt_plan` verb does not need a new tool — extend this one with short-syntax accept. |
| **Agent-loop governance** | `log_prompt`, `rate_prompt`, `get_prompt_author`, `flush_local_prompts` | Prompt observability is *already* in `ALWAYS_ALLOWED`. This is the bedrock for plan/work-item provenance. |
| **Choreography distribution** | `list_choreographies`, `sync_choreographies`, `list_custom_choreographies` | Already implements the "push to `.coznt/skills/`" model. |
| **Skill execution** | `invoke_skill` | Phase-policing happens inside the skill (per `phase-tool-map.ts` comment). |

### 2b. Deliberately excluded (must remain excluded)

Per server.ts comment, these are **agent/dev surface**, never MCP:

- `create-pr` — agent opens the PR; coznt grades it. Check-runs are governance metadata (allowed); creating the PR itself is work product (not allowed).
- `push-to-external` (write side) — Jira / Confluence own their record. Inbound webhook is the only sync direction.
- `setup-workspace` — `coznt connect` CLI does this in the open with a visible diff. A server-side MCP tool would hide the side-effect.

**Every new proposed verb is audited against this exclusion list below.**

### 2c. Gap analysis: proposed verbs vs existing

| Proposed | Existing equivalent | Verdict |
|---|---|---|
| `coznt_plan` (short-syntax-aware Plan create) | `upsert_plan` exists | **Extend** `upsert_plan`'s input to accept a `shortSyntax` string; server-side parser fills structured fields. No new tool. |
| `coznt_approve` (resolve approval) | None — `submit_for_approval` only *creates* approvals | **New tool.** Resolves an approval (approve / reject) — modifies a coznt ledger row, so doctrine-aligned. |
| `coznt_gate_status` | `get_phase_checklist` covers current-phase gates | **Extend.** Add optional `projectId` + `phase` params to query gates for an arbitrary phase. |
| `coznt_verification_debt` | None | **New tool.** Pure read against the ledger; doctrine-aligned. |
| `coznt_autonomy` | `get_my_context` returns autonomy levels | **New tool** with deeper structure: per-skill path to next level, recent autonomy events, contribution attribution. `get_my_context` stays the orientation entry-point. |
| `coznt_provenance` | `get_prompt_author` for prompts; nothing for plans/work_items | **New tool.** Reads new provenance columns; doctrine-aligned. |
| `coznt_sync` (refresh from source-of-record) | `sync_choreographies` (choreography-specific); inbound webhook is the existing pull path | **New tool**, named `refresh_from_external` to avoid collision. Triggers an *inbound* webhook-equivalent refresh; never writes upstream. Borderline doctrine — included because it's a read trigger, not a write. |
| `coznt_me` (personal dashboard payload) | Composes `get_assigned_work` + autonomy + outcomes | **New composite tool.** Pure read; composes existing operations. |

**Net delta: 5 new tools, 2 extended tools, 1 unchanged.**

### 2d. CLI binary architecture decision

The existing `src/mcp/bin.ts` is the **stdio MCP transport**, invoked by Cursor / Claude Code via `npx coznt-mcp`. It does *not* support direct CLI invocation (`coznt approve abc123`).

Two options for the developer-CLI:

**Option A (recommended): extend `bin.ts` with a verb dispatch mode.**
```bash
coznt-mcp                    # existing: stdio MCP server
coznt-mcp approve <id>       # new: invoke a single tool, print result, exit
coznt-mcp plan "fix #spec"   # new: short-syntax → upsert_plan
```
Reuses `tools` array from `server.ts` and the existing `CozntClient`. No new package, no new auth path. Print formatter (`--format json|table`) ~50 LOC.

**Option B: new `packages/cli/` package.** More code, more distribution surface, no behavior gain over A.

**Decision: Option A.** Single binary, single distribution path (the existing private install endpoint `/install/coznt-mcp/latest`). The `coznt-mcp` alias `coznt` can be shipped as an additional bin entry in the same package.

## 3. Architecture constraints

These are the constraints every milestone deliverable must satisfy. They derive from the gap-doc self-audit and the existing MCP doctrine.

1. **Coznt's writes to source-of-record are bounded by conflict semantics, not direction.** Four modes:
   - **Mirror in** (webhook → coznt): always allowed. Existing model.
   - **Narrow structured field writeback** (status, assignee, priority, estimate, dueDate, labels): **allowed**. Last-write-wins with ETag-equivalent conflict detection. Each writeback-eligible field carries `lastWrittenBy` + timestamp. This is what `positioning.md` line 68 endorses: *"status writes routed back via adapter."*
   - **Free-form body editing** (plan/work-item description, ADR prose): **forbidden**. Body is mirrored inbound only; coznt-side body edits propagate as *comments*, never as body overwrites. This is the drift problem the server.ts doctrine targets.
   - **Bootstrap** (one-shot greenfield creation of upstream record): allowed only via user-initiated CLI with visible diff. Refused if target already has content. Re-running is not idempotent for content; only for verifying current binding.
2. **No code rendering in coznt UI.** Provenance summaries (counts, ratios) only. Diff viewing belongs to GitHub / GitLab.
3. **No coznt-owned notification channels.** Comments to source-of-record fire the existing notification stack.
4. **CI runs stay upstream.** Coznt deep-links to CI rerun; never triggers (note: `trigger_pipeline` exists for the CICD phase and is gated — it is the one exception, scoped to deployment orchestration, not gate retry).
5. **Webhook-driven inbound sync.** `refresh_from_external` triggers the webhook handler manually; does not introduce polling.
6. **Page data pattern.** Every new route follows Drizzle → Operations → serialize.ts → ComponentName.tsx per CLAUDE.md. No raw `db.select()` in pages.
7. **MCP tools follow the existing `tool({ name, description, schema, run })` pattern.** Zod input schemas, `CozntClient` for HTTP calls, phase-gated via `TOOL_PHASE_MAP` or added to `ALWAYS_ALLOWED`.
8. **Provenance is opt-out-by-default-false, not opt-in.** Existing rows backfill to `aiAuthored: false`. Agent-path inserts populate provenance columns atomically via the CRUD factory hook.

9. **Mine tanznt UI patterns before writing fresh components.** Per [[reference_recruit_portal]] memory, `/Users/ram/Projects/tanznt` has shipping-quality layout, shell, stat-tile, command palette, triage-row, empty-state, and dashboard composition patterns. Coznt's `dev-velocity-implementation.md` §2f-bis maps each new component to its tanznt reference. Architectural patterns (page-data 4-layer, AI-agent 3-file, CRUD factory) are already aligned via shared CLAUDE.md lineage and do not need re-derivation. Mine *layout and structure*; never import directly; rewrite in coznt's design system.

## 4. Per-milestone execution

### Milestone B bridge — Foundation (Verify pillar + provenance schema)

**Goal.** Land the schema and operations that everything else depends on. No new external surfaces; visible delta is on existing portfolio / plan / skill detail pages.

**Deliverables:**

| # | Item | Path |
|---|---|---|
| B1 | Provenance columns on `plans` + `work_items` (6 + 1 fields) | `src/db/schema/plans.ts`, `work-items.ts`, new migration |
| B2 | `skill_autonomy_events` append-only table | `src/db/schema/skill-autonomy-events.ts` |
| B3 | `gate_overrides` columns | `src/db/schema/phase-gates.ts` |
| B4 | Backfill migration (`aiAuthored: false`) | `drizzle/00XX_*.sql` |
| B5 | `src/lib/provenance/` (record + summarize helpers) | new |
| B6 | `src/lib/verification-debt/score.ts` | new |
| B7 | `src/operations/personal.ts`, `verification-debt.ts`, `autonomy-events.ts`, `gate-overrides.ts` | new |
| B8 | `src/actions/me.ts`, `gates.ts` extensions | new + edit |
| B9 | `/me` route end-to-end | `src/app/(app)/me/` |
| B10 | `BlockerMap.tsx` component drop into Plan detail + portfolio | new |
| B11 | `SummaryPanel.tsx` provenance counts on Plan + WorkItem detail | new |
| B12 | Edit `recompute-skill-autonomy.ts` to insert `skill_autonomy_events` | edit |
| B13 | `sourceLink` audit and universal "open in source-of-record" affordance | edit operations + new component |

**Acceptance criteria:**
- `pnpm db:generate` produces a clean migration; CI passes
- `/me` renders for any logged-in user with: open approvals waiting on me, open approvals blocking me, my contribution to project autonomy, my recent outcomes
- Plan detail shows: provenance summary panel (AI-authored %, skill mix), verification-debt blocker map with at least 3 blocker types (failing gate, open approval, rule violation)
- Portfolio overview shows: per-project verification debt score with 30-day sparkline
- Every entity row in coznt UI that mirrors external state has a consistent "open in source-of-record" affordance
- `skill_autonomy_events` rows appear for every autonomy delta after the edit to `recompute-skill-autonomy.ts`

**Dependencies / blockers:**
- None external. Pure additive schema + UI work.

**Exit criteria:** all B1–B13 merged + acceptance criteria pass + `pnpm typecheck` and `pnpm test` green.

### Milestone C — First AI agent (Govern pillar + short syntax + CLI verbs)

**Goal.** First AI agent joins. Short-syntax authoring is live in MCP and the new CLI verb-dispatch mode. PR-check provenance bot starts annotating PRs.

**Deliverables:**

| # | Item | Path |
|---|---|---|
| C1 | `src/lib/short-syntax/` (parser, grammar, tests) | new |
| C2 | Extend `upsert_plan` to accept `shortSyntax` input | edit `src/mcp/tools/upsert-plan.ts` |
| C3 | New MCP tools: `coznt_approve`, `coznt_autonomy`, `coznt_verification_debt`, `coznt_me`, `coznt_provenance` | `src/mcp/tools/*.ts` (5 new files) |
| C4 | Extend `get_phase_checklist` for arbitrary phase / project | edit |
| C5 | Update `phase-tool-map.ts`: add new tools to `ALWAYS_ALLOWED` (all reads + `coznt_approve`) | edit |
| C6 | CLI verb-dispatch mode in `bin.ts` (`coznt-mcp <verb> [args] [--format]`) | edit |
| C7 | Add `coznt` bin alias in `package.json` | edit |
| C8 | `post-pr-provenance-comment.ts` task + webhook wiring | `src/automations/tasks/` + edit `process-webhook-event.ts` |
| C9 | First agent definition wired through `provenance/record.ts` (the change-risk-classifier from CLAUDE.md example) | `src/automations/agents/definitions/`, `tasks/` |
| C10 | `OutcomeHeatmap.tsx` on skill detail | new |
| C11 | Web quick-add palette (Plan create with live preview) | new component |

**Acceptance criteria:**
- `coznt-mcp plan "fix payment edge case #spec +payments →approval:eng-lead 2d"` from a terminal produces a draft Plan with all fields populated
- `coznt-mcp me` returns the same payload as the `/me` route serializer
- A PR opened against a coznt-bound repo gets a provenance comment within 60s of webhook receipt; comment is idempotent on PR update
- First agent (change-risk-classifier) runs end-to-end: invocation → output validated → skill_outcomes row appended → plan/work_item provenance columns populated
- `OutcomeHeatmap` shows per-project streaks for each skill
- Short-syntax parser unit tests cover all 5 token forms + invalid-input cases

**Dependencies:**
- B1–B5 (provenance schema + libs) must be merged
- First agent in `src/automations/agents/definitions/` — first real entry into a previously empty directory

**Exit criteria:** C1–C11 merged + acceptance pass + first PR with provenance comment captured as proof artifact.

### Milestone D — Dispatch gate (Trust pillar + integration breadth + VS Code)

**Goal.** Coznt visible inside the editor. Two high-priority adapters (Linear, GitLab) ship. Approval-wait leverage works through source-of-record writeback.

**Deliverables:**

| # | Item | Path |
|---|---|---|
| D1 | VS Code extension (private VSIX) | `packages/vscode-extension/` |
| D2 | Linear adapter | `src/lib/integrations/linear/` |
| D3 | GitLab adapter | `src/lib/integrations/gitlab/` |
| D4 | `src/lib/source-of-record/writeback.ts` adapter-dispatch | new |
| D5 | `requestApproval` action writes comment via writeback | `src/actions/blockers.ts` |
| D6 | `refresh_from_external` MCP tool (manual inbound refresh) | `src/mcp/tools/refresh-from-external.ts` |
| D7 | `notify-autonomy-change.ts` task — posts comment to bound issue | new task |
| D8 | `coznt:linkback_health` cron | `scripts/db-setup.ts` |
| D9 | Global `CommandPalette.tsx` (Shift+F) | new |
| D10 | Adapter contract documentation | `docs/dev/adapter-contract.md` |
| D11 | `coznt bootstrap` CLI verb + adapter `bootstrap()` capability + post-bootstrap authority flip. Greenfield-only: refused if target has content. | edit `bin.ts`, new method on every adapter |
| D12 | Structured field writeback contract — `writeFields(entityRef, fields, etag)` with conflict detection. Whitelisted fields: `status`, `assignee`, `priority`, `estimate`, `dueDate`, `labels`. | extend `src/lib/source-of-record/writeback.ts`, new method on every adapter |
| D13 | Field-level authority model — `authorityOwner: 'coznt' \| 'upstream'` on `projects` + `plans`; `lastWrittenBy` + timestamp per writeback-eligible field. Audit page surfaces last-writer per field. | schema migration + `src/lib/source-of-record/authority.ts` |

**Acceptance criteria:**
- VS Code command palette has 10 verbs; status bar shows personal autonomy + open-approval count, refreshed every 60s
- Linear adapter passes a 6-capability test suite: enabled-check, test-connection, open-in-external, fetch-by-id, search, post-comment, refresh
- GitLab adapter passes the same suite
- Clicking "request approval" on an open approval in `/me` posts a comment to the bound PR / Linear issue / Jira ticket within 5s
- Autonomy promotion / demotion posts a comment to the bound source-of-record for every contributor on the affected project
- `coznt:linkback_health` flags 100% of broken links within one cron cycle
- `Shift+F` opens the command palette with sub-100ms response on a 10k-entity project
- `coznt bootstrap --repo github:<owner>/<name> --tracker linear:<workspace>` creates an empty repo + Linear project, publishes the project's native Plans as Linear issues, then flips `projects.authorityOwner` from `coznt` to `upstream` (per-domain). Re-running on an already-bootstrapped target is refused with a clear "bind to existing" hint.
- Structured field writeback (status, assignee, priority, estimate, dueDate, labels) from coznt to upstream succeeds end-to-end for Linear, GitLab, and the existing GitHub/Jira adapters. ETag-equivalent conflict detection returns a clear "upstream changed since last read" error when applicable.
- `lastWrittenBy` + timestamp are recorded for every writeback-eligible field on every relevant entity. Audit page filters by last-writer.
- Body content (plan / work-item description, ADR prose) is **never** writeback'd to upstream after bootstrap. Coznt-side body edits propagate as comments only. UI surfaces this as a tooltip on every bound body field.

**Dependencies:**
- B and C complete
- API key + auth flow for VS Code is the existing pattern; no new auth surface
- D11 (bootstrap) requires customer-minted write-scoped credentials per adapter; project-pinned, not org-wide standing creds

**Exit criteria:** D1–D10 merged + acceptance pass + demo video of an end-to-end Linear-bound workflow.

### Milestone E — IDE input (polish + ClickUp)

**Goal.** Lower-priority integration polish. JetBrains deferred indefinitely per the gap-doc audit.

**Deliverables:**

| # | Item | Path |
|---|---|---|
| E1 | ClickUp adapter | `src/lib/integrations/clickup/` |
| E2 | Adapter improvements based on M-D feedback | edits |
| E3 | (deferred indefinitely) JetBrains plugin | — |

**Acceptance criteria:**
- ClickUp passes the 6-capability suite
- M-D feedback items addressed (TBD at M-D close)

**Exit criteria:** scope determined at M-D close.

## 5. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Verification-debt formula does not match intuition; first portfolio rollout produces "scores nobody trusts" | medium | high | Ship the score as **internal only** for the first 2 weeks of M-B; collect feedback from 3 design-partner teams; tune weights before exposing on portfolio. |
| Provenance backfill on large `plans` / `work_items` tables takes a long migration window | low | medium | Backfill is `UPDATE … SET aiAuthored = false WHERE aiAuthored IS NULL` — uses default and is fast. Test on staging snapshot before prod. |
| CLI verb-dispatch in `bin.ts` breaks stdio MCP for existing Cursor / Claude Code users | medium | high | Verb-dispatch only triggers when `process.argv[2]` is not a known flag and not absent. Add integration test that confirms stdio MCP still works with no args. |
| VS Code extension test matrix (versions × platforms) blows up scope | medium | medium | Ship VSIX for VS Code stable only at M-D; defer Insiders / Codium support. Document supported versions explicitly. |
| Linear / GitLab adapter rate limits during heavy webhook traffic | low | medium | Reuse existing GitHub adapter's exponential-backoff + circuit-breaker pattern. Audit and document expected RPS. |
| PR provenance bot posts duplicate comments on every push | high | low | Idempotency key = PR number + last-relevant-commit-sha. Replace prior comment on update, not append. |
| Short-syntax grammar conflicts (e.g., `@2026-12-01` mistaken for assignee `@2026-12-01`) | medium | low | Disambiguate `@` by regex: ISO date pattern → due date; otherwise → assignee. Parser tests cover every ambiguity. |
| Agent-path provenance not populated for first agent because of CRUD-factory hook missing | medium | medium | Add CRUD-factory unit test that verifies provenance columns are populated when `provenance` arg is passed. Required for C9 acceptance. |
| Field-writeback conflict detection fails silently on adapters lacking ETag-equivalent semantics (some Jira deployments, GitHub Issues without `If-Match`) | medium | medium | Adapter capability advertising: `supportsConflictDetection: boolean`. If false, fall back to "fetch-then-compare-then-write" with explicit `warnOnConflict` flag in `writeFields`. Document per-adapter behavior in `adapter-contract.md`. |
| Customers expect free-form body sync after bind ("why isn't my Linear issue body updating when I edit the Plan?") | high | low | Explicit doc page `docs/operate/why-no-body-sync.md`. UI tooltip on bound body fields: "Coznt edits propagate as comments. Edit body in $tracker." Audit log surfaces the comment as evidence of the edit attempt. |
| Bootstrap held to drop standing write credentials post-flip, but customer rotates the token and rebinds; coznt accidentally re-bootstraps | low | high | Bootstrap is gated on `projects.authorityOwner === 'coznt'`. After flip, this is `'upstream'` and bootstrap is structurally impossible. Rotation only refreshes the writeback token, never re-enables bootstrap. |

## 6. Resolved decisions (locked at kickoff 2026-05-31)

All ten open items resolved with the recommended option. Each retains its rejected alternative as historical context so future contributors understand the choice was explicit, not a default fall-through.

1. **Verification-debt score computation** — **Materialized**, recomputed on outcome insert via `refresh-verification-debt.ts` task. Portfolio query stays sub-100ms; recompute is ~50ms async, off the request path. Rejected: computed-on-read Postgres view (slower at portfolio scale, harder to index).

2. **`coznt_me` MCP tool shape** — **Distinct tool** with its own contract: `{ autonomy: { avg, perProject[] }, approvals: { waitingOnMe[], blockingMe[] }, recentOutcomes[], pathToNext }`. One MCP roundtrip; server owns composition and can version independently. Rejected: client-side composition of `get_my_context` + `get_assigned_work` + `get_outcomes` (more roundtrips, client-owned shape drift).

3. **Verification-debt severity weights** — **Fixed defaults at M-B**: `security=3, coverage=2, lint=1, custom=1`. Per-org override via `rules` engine (`{ kind: 'debt_weight', body: { security: 5 } }`) merged at materialize-time, added at M-D **only if** real customer demand surfaces. Rejected: per-org configurable from day 1 (speculative tuning churn before formula is validated; cross-org score comparison breaks).

4. **CLI binary distribution** — **Same `coznt-mcp` package**, `coznt` added as a second `bin` entry mapping to the same compiled binary. `coznt-mcp` (no args) runs stdio MCP server; `coznt <verb> [args]` runs verb-dispatch. Single install endpoint (`/install/coznt-mcp/latest`), single rotation surface. Rejected: separate `coznt-cli` package (doubles install + rotation UX for no behavior gain).

5. **`refresh_from_external` MCP tool** — **Include.** Read-trigger (manual webhook-equivalent), not a write — doctrine-compliant. Without it the CLI / VS Code experience has no way to force a refresh when staleness is suspected. Rejected: skip (forces context switch to upstream UI; bad developer-velocity UX).

6. **Backfill `generatedBySkillId` for legacy rows** — **No.** All existing rows stay `aiAuthored: false`. Reconstruction from `skill_invocations` history would manufacture false provenance, violating the verification-debt thesis principle of "never self-report." Legacy stays legacy; only new agent-path inserts carry honest provenance. Rejected: backfill via invocations join (timestamp mismatches → false attribution).

7. **First agent for M-C** — **change-risk-classifier** per CLAUDE.md example. Classifies PR diff as `low / medium / high / critical` with rationale, signals, and recommended gates. Already designed; ships a tangible "first AI joins" moment that drives the autonomy ladder cleanly via `skill_outcomes` rows. Rejected: `spec-derived-test-generator` (depends on `spec` Plan kind not yet live), `verification-debt-explainer` (lower-risk but read-only — doesn't exercise the autonomy ledger).

8. **M-D structured writeback fields** — **`status`, `assignee`, `priority`, `estimate`, `dueDate`, `labels`.** Universal across Linear, Jira, GitHub Issues, ADO, GitLab. Closes dual-entry friction for every common dev workflow. Custom fields explicitly out of scope at M-D; revisit per-adapter custom-field mapping at M-E only on customer demand. Rejected: `status` only (insufficient — doesn't close dual-entry on the other five), `status + assignee + dueDate` triage-set (arbitrary middle ground).

9. **Bootstrap credential lifecycle** — **One persistent project-pinned token, write-scoped, named `coznt-bootstrap-and-writeback`.** Same credential covers the one-shot D11 bootstrap and the ongoing D12 field writeback. Single mint UX; rotation = re-bind. The credential check at write-time gates writeback; the `authorityOwner` check structurally prevents bootstrap re-runs even with a fresh token. Rejected: separate ephemeral bootstrap + persistent writeback tokens (doubles mint + rotation UX surface for theoretical security gain).

10. **Bootstrap into populated upstream** — **Refuse with bind-to-existing hint.** Error message prints the exact `coznt bind --repo ... --tracker ...` command to use instead. Bootstrap is greenfield-only by design (constraint #1, mode 4); the bind path is the brownfield equivalent and already exists via webhook ingest. Rejected: interactive bind-or-clobber prompt (footgun — customer might publish coznt-native Plans on top of 230 existing Linear issues by accident).

## 7. Kickoff readiness checklist

Status of the five readiness gaps as of 2026-05-31, after the open-decisions review, prereq-code audit, and M-A smoke harness inspection.

### Closed

| # | Gap | Resolution |
|---|---|---|
| 1 | 10 open decisions | All resolved §6, locked with rejected alternatives preserved |
| 2 | Prerequisite code checks | All three target files audited; clean extension points found (see below) |

### Open

| # | Gap | Next action | Owner |
|---|---|---|---|
| 3 | M-A operational status (deterministic outcomes firing in production) | `pnpm smoke:milestone-a` already exists as a 6-step harness — run against live deployment. Local run failed only because dev Postgres wasn't up. | ops |
| 4 | Design-partner alignment for verification-debt formula tuning | Identify 3 teams committed to the 2-week internal-only rollout window before exposing the score on portfolio | GTM |
| 5 | Execution capacity allocation | Allocate engineering to M-B (~1,500 LOC, ~15 files, 2–4 weeks depending on team size) | eng lead |

### Prereq audit findings (closing gap #2)

**`src/automations/tasks/recompute-skill-autonomy.ts`** — exists, correctly wired:
- Fires on `skill_outcomes.insert` via the rules registry in `src/lib/rules.ts`
- Already handles a `prompt_quality_signal` source kind with per-skill fan-out semantics — proves the pattern for the B12 extension
- B12 (insert into `skill_autonomy_events`) belongs **inside `src/operations/skill-autonomy.ts` `recomputeSkillAutonomy()`**, not in the task itself; the task is a thin lookup-and-dispatch wrapper

**`src/automations/tasks/process-webhook-event.ts`** — exists, mature per-source router:
- Already imports the deterministic assessors (`assessPrAbandoned`, `assessPrReverted`, `assessDeployIncident`), GitHub App integration with HMAC verification, adapter binding resolution, gate evaluation, skill attribution, change-risk classifier, deployment recording
- C8 (PR-open → provenance comment) adds one case to the existing router — **no structural change needed**

**`src/lib/crud.ts`** — exists with `afterCreate / afterUpdate / afterDelete` hooks:
- Provenance pass-through does **not** require a factory change. Add provenance fields to the entity's Zod schema + Drizzle table; agent-path callers include them in input; the factory validates and persists atomically.
- For agent-path callers, `afterCreate` hook is the natural place if any side-effect coordination is needed
- **C9 acceptance is met by schema additions + agent-task input wiring**, not by extending the factory

### M-A smoke harness already exists

`scripts/smoke-milestone-a.ts` (300+ LOC) is a 6-step end-to-end harness validating the exact M-A acceptance criteria:

| Step | What it asserts |
|---|---|
| 1 | Initial gate evaluation succeeds for a fresh PR |
| 2 | Synchronous revert assessor writes `pr_revert` `rolled_back` outcome |
| 3 | Idempotency: duplicate insert returns null |
| 4 | `recomputeSkillAutonomy` reflects the new outcome (level transition) |
| 5 | `pr_merge` `success` outcome row written via lookback path |
| 6 | Re-evaluated gate after autonomy change uses post-A level |

Plus criterion 4 (audit chain queryable) implicitly covered by every step writing audit log entries. **Do not duplicate.** The deliverable is to *run* it against live deployment.

### Bonus discovery

`prebuild` runs `mcp-pack.ts && cli-pack.ts && prompt-hook-pack.ts` — meaning CLI packaging infrastructure already exists. Decision #4 (same package, second `bin` entry) is even cheaper than the plan assumed; the build pipeline is in place.

### Recommended kickoff sequence

1. **Today**: ops runs `pnpm smoke:milestone-a` against live deployment to close gap #3. If it fails, that's the blocking work before M-B starts.
2. **This week**: GTM identifies the 3 design partners (#4). Eng lead allocates capacity (#5).
3. **Next week**: M-B kickoff with the B1+B2+B4 schema PR as the first merge.

## 8. Out of scope (explicitly)

- Personal todo tracking, time tracking, pomodoro features
- In-coznt code rendering / diff viewer
- Coznt-owned notification channel (Slack / email DMs from coznt directly)
- System-wide hotkey overlay
- Public npm distribution of the MCP server / CLI / VS Code extension (private only per [[feedback_mcp_private_distribution]])
- JetBrains plugin (deferred indefinitely)
- Per-Plan-kind short-syntax toggles, org-vocab short-syntax extension
- Polling-based integration sync (webhook-driven only)
- Real-time collaborative editing on Plans

## 9. References

- [developer-velocity.md](../product/developer-velocity.md) — the contract
- [positioning.md](../product/positioning.md) — Govern. Verify. Trust.
- [verification-debt-thesis.md](../product/verification-debt-thesis.md) — analytical engine
- [super-productivity-feature-gap.md](../product/super-productivity-feature-gap.md) — vision-aligned gap analysis
- [dev-velocity-implementation.md](dev-velocity-implementation.md) — parts list (this doc's companion)
- `CLAUDE.md` — page pattern, CRUD factory, agent pattern, async task engine
- `src/mcp/server.ts` — existing tool definitions and the architecture doctrine
- `src/mcp/phase-tool-map.ts` — phase-gate enforcement source of truth
