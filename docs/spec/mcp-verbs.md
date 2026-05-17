# MCP Verbs

*Purpose: inventory of every MCP verb coznt exposes, with per-verb implementation status.*

Coznt's MCP surface, mapped against the verb inventory of the prior product at [`/Users/ram/Projects/SDLC/apps/mcp-server`](file:///Users/ram/Projects/SDLC/apps/mcp-server) (GitHub: `skothapalli/SDLC`). Started as a forward plan; now a status-of-record with the small set of verbs still outstanding.

Companion docs: [`../product/architecture.md`](../product/architecture.md), [`../ux/briefs/DX-mcp-context.md`](../ux/briefs/DX-mcp-context.md), [`../product/walkthrough.md`](../product/walkthrough.md).

---

## Headline

- **31 MCP verbs registered** (started at 6 before this work; `upsert_plan` + `get_plans` added in Phase 3 of the SDLC `b0709c9` absorption; `list_choreographies` + `sync_choreographies` added in the daemon-and-choreography work — Tier 4 below).
- **All non-excluded SDLC verbs ported** (3 deferred — see "Blocked by design exclusion" below). Coznt-native additions absorb SDLC's document-management surface into the plan entity.
- **Phase enforcement** lives in two places: route-side authoritative (`src/lib/mcp/phase-enforcement.ts`) and MCP-side fast-fail (`src/mcp/phase-data.ts`). A drift between the two is a missed fast-fail, not a correctness bug.
- **Drafts are in-memory only** (per-MCP-process session). No new DB table.

---

## Status by tier

### Tier 1 — orientation + phase transitions

All ALWAYS_ALLOWED verbs from SDLC's phase-enforcement engine. Cross-phase navigation, validation, and the transition verbs themselves.

| Verb | Status | Notes |
|---|---|---|
| `set_project` | ✅ | Fuzzy match by id / slug / name |
| `switch_project` | ✅ | Same matcher; omit project to clear |
| `get_my_context` | ✅ | Now includes `allowedTools` (added in this round) |
| `get_project_status` | ✅ | Compact "where are we" snapshot |
| `get_phase_checklist` | ✅ | Per-phase gates + readyToAdvance |
| `get_requirements` | ✅ | Defaults to `kind=story` (coznt has no `requirement` kind) |
| `get_assigned_work` | ✅ | Resolves email → user via `auth.user` |
| `check_standards` | ✅ | plan or action mode; wraps existing rule-engine |
| `submit_phase_for_review` | ✅ | Creates approval rows per approval-type gate |
| `advance_phase` | ✅ | Wraps existing `/api/v1/projects/[id]/advance-phase` |
| `setup_workspace` | ❌ | **Blocked** by design exclusion in `src/mcp/server.ts` |

**9 of 10 shipped.**

### Tier 2 — authoring + delivery

| Verb | Status | Notes |
|---|---|---|
| `create_requirement` | ✅ | Wraps `planCrud.create`; default `kind=story` |
| `push_requirements` | ✅ | Inline batch OR push session drafts (since Tier 3) |
| `upsert_plan` | ✅ (Phase 3) | Coznt-native. SDLC's `upload_document` semantic absorbed into plans. Upserts by `(projectId, kind, slug)` — new draft on first call, `plan_revisions` row on subsequent calls. The canonical landing zone for generator-skill output. |
| `get_plans` | ✅ (Phase 3) | Coznt-native. SDLC's `get_documents` semantic. List with kind/status/slug filters; fetch by id returns body + revisions + approvals. |
| `log_decision` | ✅ already | Existing route at `/api/v1/mcp/decisions` already writes `plan kind=adr` with phase enforcement. Earlier doc claim that it "writes to audit_logs" was wrong. |
| `get_design_context` | ✅ | ADRs WITH bodies + active features+stories + work_items |
| `create_pr` | ❌ | **Blocked** by design exclusion |
| `update_work_item_status` | ✅ | Coznt-side only; upstream sync is `push_to_external` |
| `update_test_result` | ✅ | Wraps existing `/api/v1/test-runs` |
| `get_pipeline_status` | ✅ | Latest deploy + recent test runs + active release_plan |

**8 shipped + 2 coznt-native additions (excluding log_decision since it was already correct).**

### Tier 3 — convenience + AI invocation

| Verb | Status | Notes |
|---|---|---|
| `invoke_skill` | ✅ | Keystone Mode-2 verb. Wraps existing `/api/v1/skills/[slug]/invoke` |
| `generate_tests` | ✅ | Thin wrapper over `invoke_skill` with `slug="test-author"`; clean error if skill missing |
| `draft_requirement` | ✅ | In-memory; no DB |
| `list_draft_requirements` | ✅ | Returns session drafts |
| `update_draft_requirement` | ✅ | Patch by id |
| `delete_draft_requirement` | ✅ | Remove by id |
| `push_to_external` | ❌ | **Blocked** by design exclusion |

**6 of 7 shipped. (push_requirements with no items pushes session drafts — completes the draft→commit loop.)**

### Tier 4 — distribution (daemon ↔ dev repo)

Choreography distribution. Read-only verbs that serve workflow guides to the developer's repo via the `coznt sync` CLI. Available in every phase. Pushed *content* only — never destructive verbs (those remain excluded; see below).

| Verb | Status | Notes |
|---|---|---|
| `list_choreographies` | ✅ | Returns manifest `{slug, version, hash, description, minAutonomy}[]` for the bound project. SHA-256 hashes; `manifestHash` deterministic over sorted slug→hash pairs. |
| `sync_choreographies` | ✅ | Returns full content bundle; optional `slugs[]` filter preserves order. Unknown slugs error. |

**2 of 2 shipped.** Source of truth is filesystem (`src/automations/skills/<slug>/CHOREOGRAPHY.md`); DB `coznt.skills` enforces `enabled` flag and project scoping (project-id match OR `NULL` for org-wide). See [`./skill-choreography.md`](./skill-choreography.md).

---

## Blocked by design exclusion

`src/mcp/server.ts` lines 14–17:

> *Excluded by design (let GitHub/Jira stay the source of truth, observe via webhook): create-pr, push-to-external, setup-workspace.*

Three SDLC verbs are intentionally not shipped:

1. **`setup_workspace`** (Tier 1) — would return templated MCP client configs (`.cursor/mcp.json`, `.claude/mcp.json`, …).
2. **`create_pr`** (Tier 2) — would create a GitHub/ADO PR.
3. **`push_to_external`** (Tier 3) — would push plans → Jira / Confluence.

**The shared rationale:** coznt observes; the source-of-truth lives in GitHub / Jira / Confluence. The webhook surface is the inbound path. Adding write-side verbs that bypass those systems creates a divergent record.

**Decision needed:** keep the exclusion (status quo, robust observation model) or revisit it (adds delivery affordance but creates a new coordination problem). The three verbs share one decision — implement against the spec, or update the exclusion comment to reflect the new direction. ~½ day each if implemented.

---

## Files

### MCP server (`src/mcp/`)

```
src/mcp/
├── bin.ts                       — CLI entrypoint (unchanged)
├── client.ts                    — HTTP client to coznt API (unchanged)
├── server.ts                    — registers 27 tools; pre-dispatch phase check
├── session.ts                   — process-local session: project cache + drafts
├── phase-data.ts                — local phase-enforcement maps (mirrors route)
└── tools/                       — 27 tool files (was 6)
```

### Route handlers (`src/app/api/v1/mcp/`)

```
src/app/api/v1/mcp/
├── context/route.ts                          — existing
├── decisions/route.ts                        — existing (log_decision)
├── sessions/route.ts                         — existing
├── sessions/[id]/end/route.ts                — existing
├── approvals/route.ts                        — existing
├── history/route.ts                          — existing
├── gates/[id]/mark-passed/route.ts           — existing
├── projects/resolve/route.ts                 — NEW (set/switch_project)
├── projects/[id]/status/route.ts             — NEW (get_project_status)
├── projects/[id]/phase-checklist/route.ts    — NEW
├── projects/[id]/requirements/route.ts       — NEW (GET + POST single/batch)
├── projects/[id]/assigned-work/route.ts      — NEW (assignee email resolution)
├── projects/[id]/design-context/route.ts     — NEW
├── projects/[id]/submit-phase-for-review/route.ts — NEW
├── projects/[id]/pipeline-status/route.ts    — NEW
├── work-items/[id]/route.ts                  — NEW (PATCH status/assignee)
├── plans/route.ts                            — NEW (POST upsert + GET list)
├── plans/[id]/route.ts                       — NEW (GET detail + revisions + approvals)
└── check-standards/route.ts                  — NEW
```

### Route-side enforcement

```
src/lib/mcp/
├── build-context.ts             — get_my_context body; now populates allowedTools
├── phase-enforcement.ts         — AUTHORITATIVE check + getAllowedTools
└── schemas.ts                   — McpResponseSchema with allowedTools field
```

---

## Architectural decisions worth noting

1. **MCP server is a thin HTTP client.** Every verb routes through `/api/v1/mcp/*` (or `/api/v1/*` for shared agent endpoints). The DB is never touched directly from `src/mcp/`. Keeps the boundary clean and means a non-MCP integration calling the same endpoints gets the same enforcement.

2. **Phase enforcement is two-layered, route-authoritative.** `src/lib/mcp/phase-enforcement.ts` is the source of truth (uses coznt's `PHASE_GUIDANCE` for messages). `src/mcp/phase-data.ts` is a snapshot used for sub-ms fast-fail before network roundtrip. Drift = missed fast-fail, not a security bug.

3. **Session state is process-local.** `src/mcp/session.ts` carries the bound project + drafts. No new DB tables. The MCP server is per-IDE-process; if the IDE restarts, the agent re-calls `set_project`. SDLC follows the same model.

4. **Drafts have no DB persistence.** `draft_requirement` family writes to in-memory arrays. `push_requirements` (with no `items`) commits them and clears the buffer. SDLC's draft model is the same — drafts are ephemeral by intent.

5. **`generate_tests` delegates to `invoke_skill`.** Named verb for IDE discoverability, but the underlying machinery is general. The skill `test-author` doesn't have to exist for the verb to compile; it returns a clean error if missing.

6. **`log_decision` was already correct.** Earlier this doc claimed it "writes to audit_logs" — that was wrong. The route always wrote a plan with `kind=adr`. No adapter needed.

---

## Open follow-ups

1. **Cross-MCP-client fixture tests.** Zero tests on the 21 new verbs. `tests/mcp/` with one fixture per client (Cursor, Claude Code, Cline, Zed) would catch protocol drift.
2. **Product decision on the 3 excluded verbs.** Implement-against-spec or update the exclusion comment.
3. **Skill author registration.** `generate_tests` returns a clean error if `test-author` doesn't exist; a default org-wide `test-author` skill would make the verb work out of the box.
4. **MCP-side phase data sync check.** Optional CI lint that verifies `src/mcp/phase-data.ts` matches `src/lib/mcp/phase-enforcement.ts`. Five minutes; prevents the only correctness hazard from the two-layer model.
