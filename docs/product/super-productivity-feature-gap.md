# Super-Productivity → Coznt Developer-Velocity Gap

Required changes to make [developer-velocity.md](developer-velocity.md) a reality, derived from super-productivity's shipped feature set. Super-productivity is personal productivity; coznt is governed SDLC. The patterns to steal are the **speed-of-thought authoring, surface ergonomics, and extension model** — not the productivity features themselves (pomodoro, break reminders, manual time tracking).

Source pages indexed: SP README, SP Short Syntax, SP Keyboard Shortcuts, SP Plugin API, SP Issue Integrations.

## Feature-by-feature mapping

| Super-productivity feature | Coznt equivalent today | Gap | Maps to invariant |
|---|---|---|---|
| **Short syntax** (`#tag +project 2h @due`) — 4 forms, regex-driven, per-form toggle | Forms-driven plan/approval creation | No shorthand authoring | #6 Surfacing without overhead |
| **Keyboard shortcuts** — global / nav / task mgmt / UI panel categories, user-configurable | Web app keyboard hooks minimal; no IDE surface | No editor-native verbs | #1 No verb requires a dashboard |
| **Global hotkeys** (system-wide, Electron) — `globalShowHide`, `globalAddTask` | None | N/A — coznt is overlay, not standalone productivity app | (deliberately skip) |
| **Trigger Sync action** | Webhook-driven background sync | No explicit "refresh from source-of-record" verb dev can invoke | #5 Source-of-record links work |
| **Plugin architecture** — manifest + JS + optional iframe UI, hooks on lifecycle, sandboxed | Skills (server-side) + MCP server; no client-side plugin surface | No third-party UI extension model | #4 Provenance is default + extensibility |
| **Plugin API** — tasks, projects, counters, notifications, dialogs | MCP verb surface (server-side only) | No client-side plugin SDK | #1, #6 |
| **Issue integrations** — Jira, Trello, GitHub, GitLab, Gitea, OpenProject, Linear, ClickUp, ADO, CalDAV | GitHub, Jira, ADO, Confluence | Missing **Linear, GitLab, ClickUp** at minimum | #5 Source-of-record links work |
| **Core integration capabilities** — enabled-check, test-connection, open-in-external, fetch-by-id, search, add-as-task, refresh | Webhook ingest; UI lookup partial | No universal "open in source-of-record" affordance on every entity | #5 Source-of-record links work |
| **Status transitions from app** (Jira, OpenProject) | Status writes route via adapter when bound | Adapter exists; surface to *trigger* transition from coznt is partial | #2 Every blocker is actionable |
| **Worklog submission** (Jira, OpenProject) | Time-in-phase derived from phase transitions | Coznt's derivation is cleaner; no change needed | (deliberately skip) |
| **Auto-import + poll interval** per provider | Webhook-driven (push) | Webhook is superior; coznt doesn't need polling | (deliberately skip) |
| **Search bar** (`Shift+F`) — global, fuzzy | Per-entity search via CRUD factory | No global search surface | #6 Surfacing without overhead |
| **Focus mode** | None | N/A for governance | (deliberately skip) |
| **Pomodoro / break reminders** | None | Wrong category | (deliberately skip) |
| **Personal metrics** (routines, time series) | Outcome ledger is project-scoped, not user-scoped | No `/me` personal dashboard | #3 Autonomy is earned |

## Required changes, grouped by developer-velocity invariant

### #1 — No verb requires a dashboard

The biggest gap. Super-productivity has rich client-side keyboard surface; coznt has none on the developer side.

**Schema changes:** None.

**New surfaces:**
- **`coznt` CLI binary.** Terminal-native verbs: `coznt plan`, `coznt approve <id>`, `coznt gate-status [project]`, `coznt verification-debt [project]`, `coznt autonomy [skill]`, `coznt provenance <pr>`, `coznt sync <project>`. Thin transport wrapper around MCP — not a separate product.
- **MCP verb expansion.** Audit `src/mcp/phase-tool-map.ts` for parity with the CLI verb list; gaps shipped as new MCP tools.
- **VS Code extension.** Command palette entries for top 10 verbs; status bar item showing personal autonomy + open-approval count. Read + act-via-MCP; not a Cursor competitor.
- **JetBrains plugin** — **deferred**. Cursor / Claude Code already speak MCP; only build if usage data shows non-MCP-IDE demand. Don't pre-build IDE adapters speculatively.

**Deliberately cut.** Global system-wide hotkey overlay — pulls coznt into "standalone productivity app" territory and violates the overlay positioning. If a dev needs "what's blocking me right now" from anywhere, the CLI verb is the right surface.

### #2 — Every blocker is actionable

Super-productivity treats issue status as a verb (transition from app); coznt currently treats gates as a noun (status display).

**Schema changes:**
- `gate_overrides` table or column on `phase_gates` — auditable "skipped with reason," requires Plan reference + autonomy snapshot.

**Deliberately cut.** `users.preferredPingChannel` — coznt must not own user notification routing. Instead, every "ping" is a comment written back to the source-of-record (Linear comment, Jira mention, GitHub PR check); the existing notification stack fires.

**New surfaces:**
- **Verification-debt blocker map UI** on Plan detail and PR-check comment: "3 things between you and merge: (1) coverage gate failing — deep-link to CI rerun, (2) approval waiting on Sarah — request via PR comment, (3) rule violation `no-direct-db` — edit Plan."
- **One-click verbs from blocker map:** deep-link to CI rerun (CI runs stay upstream — coznt never triggers), request-approval-via-source-of-record (posts a comment to the bound PR/issue), self-approve (if autonomy permits), override-with-reason.
- **Approval-wait leverage row** on `/me` dashboard: every approval the user is waiting on, with age and a "request" action that posts a comment to the bound PR / Linear issue / Jira ticket.

### #3 — Autonomy is earned, not granted

Coznt's autonomy ladder is load-bearing in the schema but has no developer-facing surface. Super-productivity's metrics dashboard is the inspiration for *how* this gets displayed; the substance is coznt-unique.

**Schema changes:**
- `skill_autonomy_events` table — promotion/demotion events with delta, reason, and triggering outcome IDs. Append-only.
- Index for "skill_outcomes by user (PR author) in window" — needed for personal contribution attribution.

**New surfaces:**
- **`/me` personal dashboard route.** Strictly a personal *slice of the audit ledger* — no personal todos, no time tracking, no goals. Drift into those is SP-territory and violates the overlay positioning. Surfaces:
  - "Your projects' average autonomy: senior" with per-project breakdown
  - "Your contribution to project autonomy: 14 clean outcomes in 30 days"
  - "Path to senior on `coznt-web`: 4 more clean outcomes; last reset by deploy_incident on 2026-05-18"
  - Open approvals waiting on you
  - Open approvals you're blocked by
- **Skill outcome heatmap** on skill detail page (per-project), showing streaks/resets.
- **Autonomy event writeback** — when a skill is promoted/demoted on a project you contribute to, post a comment to the bound Linear/Jira/repo so the dev sees it in their existing tool. In-app surface lives on `/me`; coznt never owns a separate notification channel.

### #4 — Provenance is default, not setting

This is the largest schema change. Coznt records `skill_outcomes` but plans/work_items don't carry generation metadata, so reviewers can't triage AI-generated PRs cheaply.

**Schema changes (load-bearing):**

Add to both `plans` and `work_items`:
```ts
aiAuthored: boolean().default(false).notNull(),
generatedByModel: text(),              // e.g. "claude-opus-4-7"
generatedBySkillId: uuid().references(() => skills.id),
autonomyAtGeneration: integer(),       // 0-3 snapshot
promptHash: text(),                    // for dedupe / audit
generatedAt: timestamp(),
```

Generate migration via `pnpm db:generate`. Backfill defaults to `aiAuthored: false`.

**New surfaces:**
- **PR-check provenance comment bot** — when a coznt-bound PR opens, post a status check: "Lines 42–78 generated by junior-autonomy `change-risk-classifier` (claude-opus-4-7) at autonomy 1. Lines 80–95 hand-written. 2 spec acceptance criteria covered, 1 missing." Provenance is rendered *in the GitHub/GitLab PR view*, where the reviewer already is.
- **Provenance summary panel** in coznt Plan/Work-Item detail — counts and ratios only (AI-authored %, skill mix, autonomy snapshot distribution). Never renders code. Coznt is not a Git host.
- **Spec linkback** — `work_items.implementsPlanId` (Plan-kind=`spec`) so reviewer sees acceptance criteria inline on the PR comment.

**Deliberately cut.** In-coznt diff overlay rendering source code with AI-region shading — positions coznt as a Git host competitor and violates the overlay role. The reviewer's diff surface is GitHub / GitLab; coznt enriches it via the PR comment bot rather than replacing it.

### #5 — Source-of-record links work

Super-productivity's universal "open in external system" capability is the bar. Coznt has it partially.

**Schema changes:**
- Audit every entity that mirrors external state and ensure a typed `sourceLink` (URL + system identifier). Likely already present on `work_items`, `releases`; verify and add where missing.

**New surfaces:**
- **"Open in source-of-record" affordance** on every entity row in coznt UI — uniform iconography, one click.
- **Bidirectional writeback** — when coznt approves a gate or promotes autonomy, write a comment back to the source-of-record (Linear comment, Jira field, GitHub PR check) so the dev sees the coznt action in their tool of choice without coming to coznt.
- **Linkback health check** — pg_cron job that verifies external IDs still resolve; surface stale links as a portfolio-level issue.
- **Integration breadth** — add **Linear, GitLab, ClickUp** adapters. Use coznt's existing `Adapter` pattern; mirror SP's core-capability bar (test connection, fetch-by-id, search, refresh).

### #6 — Surfacing without overhead

Super-productivity's short syntax is the ergonomic gold standard for fast authoring. Coznt needs the same.

**Schema changes:** None.

**New surfaces:**
- **Short-syntax parser library** (`src/lib/short-syntax/`) — shared by MCP, CLI, web quick-add. Minimal initial grammar:
  - `#kind` — Plan kind (`#spec`, `#story`, `#adr`)
  - `+project-slug` — project binding
  - `@assignee` or `@YYYY-MM-DD` — assignee or due date (disambiguate by format)
  - `→approval:<role-or-user>` — approval routing
  - `2h` / `3d` — estimate
- **Web quick-add palette** — opens prompt with live preview of parsed Plan. Produces a draft Plan that flows through the normal CRUD path (validation, rules, audit). Not a personal quick-capture.
- **MCP verb input** — `coznt plan "fix edge case" #spec +payments →approval:eng-lead 2d` produces a draft Plan.
- **Global search surface** — fuzzy across plans, work_items, skills, projects; semantic search via existing `searchSemantic()` for deep mode.

**Deliberately cut.**
- **Per-Plan-kind syntax toggles** — rebuilds SP's settings surface speculatively. Ship one grammar; expand only when real usage demands it.
- **`organizations.short_syntax_config` for org-vocab extension** — speculative complexity. The `rules` engine and Plan kinds already encode org-specific governance; no second extension point needed yet.
- **`^priority` token** — speculative until a Plan kind genuinely needs it. Don't pre-add grammar slots.

## Cross-cutting: integrations breadth

Super-productivity supports 9 issue providers. Coznt has 4. The high-leverage additions for developer audience:

| Provider | Status | Priority |
|---|---|---|
| GitHub | shipped | — |
| Jira | shipped | — |
| Azure DevOps | shipped | — |
| Confluence | shipped (docs) | — |
| **Linear** | missing | **high** (dev-mover for modern teams) |
| **GitLab** | missing | **high** (enterprise parity with GitHub) |
| **ClickUp** | missing | medium |
| Bitbucket | missing | medium (acquired-by-Atlassian baseline) |
| Trello | missing | low |
| Gitea | missing | low (self-host niche) |
| OpenProject | missing | low |

Each new provider follows the existing `Adapter` pattern. SP's core-capability matrix (enabled-check / test / open / fetch / search / add / refresh) is the bar.

## Cross-cutting: client-side plugin surface

Super-productivity's plugin model (manifest + JS + optional iframe + sandbox + hooks) is *not* what coznt should ship today. Coznt's equivalent is the **skill + MCP** model, which is server-side and governed. The right move is:

- **Document the MCP server as the coznt plugin surface.** Position it explicitly as "the coznt plugin API." Add a `docs/dev/plugin-development.md` patterned after SP's plugin guide but pointing at MCP tool authoring + skill packaging.
- **Skill SKILL.md distribution** — per existing memory ([[project_skill_execution_modes]]), push SKILL.md *choreography* to `.coznt/skills/` in the developer's repo. This is the closest analog to SP's "load plugin from folder."
- **No iframe surface** in coznt. Web UI extension via plugins is a security and trust hit coznt cannot take and remain "trust observable."

## Sequencing recommendation

Not everything ships together. Suggested ordering, aligned to the Milestone framing in [build-plan.md](../ux/build-plan.md):

**Milestone B bridge (next):**
- Provenance schema on `plans` + `work_items` (load-bearing for #4 and downstream PR comments)
- `/me` personal dashboard route (#3)
- Verification-debt blocker map on Plan detail (#2)
- Audit `sourceLink` coverage and add the universal affordance (#5)

**Milestone C (first AI agent joins):**
- Short-syntax parser library + MCP verb input (#6)
- `coznt` CLI binary (#1)
- PR-check provenance comment bot (#4)
- Skill outcome heatmap + autonomy event feed (#3)

**Milestone D (dispatch gate):**
- VS Code extension (#1)
- Linear + GitLab adapters (#5 integration breadth)
- Approval-wait ping leverage with `users.preferredPingChannel` (#2)
- Bidirectional source-of-record writeback (#5)

**Milestone E (IDE input):**
- ClickUp adapter (#5)
- JetBrains plugin (#1) — **deferred indefinitely**; revisit only with usage data showing material non-MCP-IDE demand.

## What deliberately NOT to copy from super-productivity

- **Pomodoro / break reminders / focus mode** — wrong category. Coznt's flow protection is approval-wait surfacing, not personal time boxing.
- **Manual time tracking with start/stop** — coznt derives time-in-phase from phase transitions, which is more accurate and zero-overhead. Adding manual tracking would violate invariant #6.
- **Local-first sync (Dropbox / WebDAV)** — coznt's audit story requires server-side ground truth. User-controlled blob storage breaks "trust observable."
- **Iframe plugins** — security and trust posture incompatible with coznt's governance role.
- **Polling-based integration sync** — coznt is webhook-driven, which is strictly better. Don't regress.

## Vision-alignment self-audit

After the first pass of this gap analysis, several proposals were caught as **SP-feature mimicry that violated overlay positioning**. The unifying error was coznt owning surfaces that the source-of-record already owns. Each was cut or recast per the principle:

> **Act on coznt's ledger. Write back to the source-of-record. Let the existing tools surface it to the developer.**

| Cut or recast | Why it violated the vision |
|---|---|
| In-coznt diff overlay rendering code | Coznt is not a Git host. Provenance belongs in the PR view via the comment bot; coznt shows summary, never code. |
| Rerun-gate-from-coznt button | CI runs stay upstream per stack position. Coznt deep-links to CI; never triggers a run. |
| `users.preferredPingChannel` | Coznt should not own notification routing. Comments to the source-of-record let the existing notification stack fire. |
| Global system-wide hotkey overlay | Pulls coznt into "standalone productivity app" territory. Overlay positioning forbids it. CLI verb is the right surface. |
| Per-Plan-kind short-syntax toggles | Rebuilds SP's settings surface speculatively. Ship one grammar; expand on real demand. |
| Org-vocab short-syntax extension | Speculative complexity. `rules` + Plan kinds already encode org governance. |
| `^priority` syntax token | Pre-added grammar slot with no Plan kind that needs it yet. |
| Pre-emptive JetBrains plugin | Cursor / Claude Code speak MCP. Don't pre-build IDE adapters without usage data. |
| In-app channel for autonomy event notifications | Coznt shouldn't own DMs. Writeback to bound Linear/Jira/repo; in-app surface lives on `/me`. |

Surfaces that **survived** the audit (kept) all share a property: they either (a) act on coznt's own ledger (autonomy, outcomes, gates, provenance), or (b) deep-link / write back to the system of record. None of them own a surface the source-of-record already owns.

The doctrine, written so it survives future PM trade-offs: **if a proposed coznt feature competes with a surface already owned by Git, the tracker, the CI, or the dev's notification channel, that feature is wrong.** Coznt's job is to enrich those surfaces from the audit ledger, never to replace them.

## Related

- [positioning.md](positioning.md) — buyer-facing operating model
- [developer-velocity.md](developer-velocity.md) — the contract this gap analysis serves
- [verification-debt-thesis.md](verification-debt-thesis.md) — analytical engine under "Verify"
- [build-plan.md](../ux/build-plan.md) — milestone execution plan
