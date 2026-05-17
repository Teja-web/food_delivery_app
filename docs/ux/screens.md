# Coznt Screens

Derived from `moments.md`. Each screen names its moment(s), primary user, primary action, data, and key states. If a screen isn't here, it's either out of scope or admin-stock.

## Resolving the H4/H7 question

Moments 4 (Trust Earned) and 7 (CISO Drill) shared hero #4 in the moments doc. Locking the split now: **two screens, shared data**.

- **`/skills`** — celebration ledger. Trust earned, observable. Hero #4.
- **`/audit`** — parameterized query + export across plans, projects, approvals, deployments, and skill outcomes. Functional, not a hero. Different cognitive register, different visual treatment. (Route renamed from `/skills/audit` on 2026-05-12 when the page scope expanded beyond skills.)

The split keeps the celebration moment from being polluted by query-builder chrome, and keeps the audit moment from feeling like a side feature.

---

## Hero screens (5 — get 3-variant exploration)

### H1. `/projects` portfolio view

- **Moment:** 1 — Friday Portfolio Sweep
- **Primary user:** Sam (player-coach, 2-4 active projects)
- **Primary action:** Scan portfolio status in 90 seconds and answer the skip-level's "where are we?"
- **Secondary actions:** drill into a project; jump to a blocking approval; jump to a recent autonomy event
- **Data needed:**
  - Sam's projects (org-scoped, filtered to teams he leads)
  - Per project: name, phase, gate status with named unmet criteria, open approvals count, last deploy timestamp, 30-day change-failure sparkline, autonomy events (last 7d)
  - Portfolio rollup: total open approvals, total deploys this week, autonomy promotions/demotions this week
- **Key states:**
  - Loading: skeleton cards
  - Empty: "No projects yet" with create CTA (rare for Sam)
  - 30+ projects: group by team or status (decide at variant stage)
  - Stale project (no activity 60d+): visual de-emphasis, not hidden
  - Broken integration on a project: warning chip, not silent data gap
- **Currently:** flat table, Name / Phase / Status / Updated, 47 lines
- **Needs:** portfolio cockpit — dense scannable cards with sparklines, rollup strip at top, gate-status ribbons, drill paths

### H2. `/projects/[id]` cockpit

- **Moment:** 2 — Blocked Gate
- **Primary user:** Sam
- **Primary action:** understand current phase, see what's blocking, advance the gate when ready
- **Secondary actions:** open a plan; review a gate item; open the linked PR; ping the assignee
- **Data needed:**
  - Project basics, current phase
  - Current-phase gate criteria with status (pending/passed/failed/skipped) and **named unmet criteria** with assignee + SLA + link to source-of-record
  - Per-phase guidance — description, suggested actions, next condition (port from prior SDLC)
  - Plans in this project (grouped by kind)
  - Recent activity stream (gate decisions, plan changes, deploys)
  - Adapter bindings (read-only)
- **Key states:**
  - Brand-new project: onboarding affordance (no plans yet)
  - Failed gate: prominently highlighted, with diff if previously passed
  - All gates passed: "Advance to {nextPhase}" is the primary CTA
  - Final phase (Monitoring): different layout, focus on metrics + incidents
  - Multiple unmet criteria: each addressable independently
- **Currently:** phase + status cards, advance button, gates list, bindings, plans — bones are there
- **Needs:** per-phase guidance panel, named unmet criteria with assignees, gate-diff when state flips, recent-activity stream

### H3. `/approvals` inbox

- **Moment:** 3 — Daily Approval Inbox
- **Primary user:** Sam (occasionally Jordan when reviewing infra changes)
- **Primary action:** approve or reject quickly with full context
- **Secondary actions:** bulk-approve same-skill low-risk; view skill track record inline; defer to a peer; require more info
- **Data needed:**
  - Sam's pending approvals across all his projects
  - Per approval: entity type (requirement / phase_gate / release / work_item), change summary, requesting skill with autonomy level, evidence (PR diff link, test results, gate status), age, requested-by
  - Tabs: Mine (default), Team, All
- **Key states:**
  - Empty: "Nothing pending — nice."
  - Approving: optimistic UI with 5-second undo
  - Rejecting: required reason textarea
  - Bulk select: same-skill batch confirm modal
  - Stale (>7d): visual aging
  - Referenced entity deleted: graceful "linked entity no longer available"
  - Self-requested: cannot approve own request (UI grays out the action)
- **Currently:** read-only table, no approve/reject, 60 lines
- **Needs:** inline approve/reject action surface, skill track-record badge per row, tabs, required-reason on reject, bulk-select with confirm, optimistic UI

### H4. `/skills` autonomy ledger

- **Moment:** 4 — Trust Earned
- **Primary user:** Priya (weekly), with Sam + Jordan as secondary readers
- **Primary action:** scan portfolio-wide autonomy state; absorb the trust direction at a glance
- **Secondary actions:** drill into a skill's detail; review a pending promotion; open the audit query (`/audit`)
- **Data needed:**
  - All skills with current level, level history (timeline), enabled flag
  - Recent events (last 14d): promotions, demotions, threshold-pending-review
  - Per skill: 30-day rolling stats (success rate, rollback rate, incident count), projects it ran on, last invocation
- **Key states:**
  - Loading: skeleton timeline
  - Empty: no skills yet (with config hint)
  - Promotion event this week: prominent banner with celebratory visual
  - Demotion event this week: distinct red banner — negative trust signal must be visually separate from positive
  - Pending review at threshold: amber, "approve to promote" inline
  - Skill disabled: still listed but visually subdued
- **Currently:** flat list with level pill + blurb + enabled flag, 87 lines
- **Needs:** the trust-earned visualization — promotion/demotion banners, level pills with movement indicators (↑ promoted, ↓ demoted), per-skill 30-day outcomes sparkline, link to skill detail

### H5. `/metrics` cross-project DORA

- **Moment:** 5 — DORA Regression Diagnosis
- **Primary user:** Priya (portfolio) + Jordan (cross-team SRE)
- **Primary action:** diagnose where a portfolio-level metric came from; attribute regressions causally
- **Secondary actions:** drill into a specific project's DORA; jump to the triggering deploys; open an incident plan with evidence pre-populated
- **Data needed:**
  - Portfolio aggregates: lead time, deploy frequency, change-failure rate, MTTR (and the 4 secondary types)
  - Per-project small multiples for each metric
  - Per-skill attribution: which auto-approving skills are correlated with which metrics over the window
  - Time selectors: 7d / 30d / 90d
- **Key states:**
  - Loading: skeleton grid
  - Empty: "No DORA data yet" with hint on how data flows in (webhook setup link)
  - Regression visible: the spiking project(s) visually obvious in the small-multiples grid
  - Trend arrows: week-over-week direction per project
  - Missing data for a project (no GitHub binding): graceful "—" not "0"
- **Currently:** per-project only, 8-up grid by type, hand-rolled bars, 80 lines + Sparkline.tsx
- **Needs:** portfolio rollup on top, small-multiples-per-project below, causal attribution (which skill auto-approved the regressing deploys), real chart primitive instead of div-bars

---

## DX track (Moment 6)

### MCP `/api/v1/mcp/context` endpoint (and Cursor onboarding)

- **Moment:** 6 — Cursor First-Call
- **Primary user:** Devin
- **Primary action:** return grounded project context to Cursor in <1s
- **Surface in-Cursor:** plain text + structured citations Cursor renders inline
- **Data returned:**
  - Project (from API key/session): id, name, slug, phase
  - Devin's active work items (from linked Jira/GitHub)
  - Rules in force for this project + phase, each with a back-link
  - Skills available for this phase, each with autonomy level + slug + invocation pattern
  - Recent ADRs that bind this work (last 30d)
- **Key states (this is DX, not UI — but they're load-bearing):**
  - Sub-1s response on cache hit; <2s on cache miss
  - Wrong-project guard: response includes project name and slug at the top so a wrong response is visually obvious in Cursor
  - No project bound to this API key: explicit onboarding error message with copy-paste fix
  - Rate limit: graceful — return cached context with a "stale" marker rather than 429
  - Partial data (e.g., Jira down): return what we have, mark the gap explicitly
- **Companion web surface:** `/projects/[id]` cockpit has a "Connect Cursor" action that produces the `.cursor/mcp.json` snippet with this project's API key. Simple modal, not a hero screen but high-leverage.
- **Currently:** does not exist
- **Needs to be built:** the route, the response schema, the Cursor setup modal

---

## Functional screens (DESIGN.md tokens, no variant exploration)

These exist, work, look clean. They use the design system but don't get the variant-exploration budget.

### `/audit`

- **Moment:** 7 — CISO 24-Hour Drill
- **Primary user:** Priya (v2: Marcus)
- **Primary action:** run a parameterized audit query, export the result
- **Data:** date range, scope (skills / projects / actions / autonomy-at-time), output format (CSV / JSON)
- **Output row:** timestamp, skill, action, project, change reference, reviewer (immutable session ID + role at time), autonomy at time, signature hash
- **Key states:** empty query refused; large result paginated; export reproducible (same params → same output)
- **Needs to be built:** route, query against `audit_log` + `skill_outcomes`, signed export

### `/projects/new`

- **Primary user:** Sam (or Priya bootstrapping a team)
- **Primary action:** create a project; auto-provision GitHub repo / Jira project / Confluence space / ADO project on active integrations
- **Note:** this is the "wow moment" from the prior SDLC walkthrough. Worth doing well even though it's not a hero. Failures are non-blocking (project created; missing integration noted as warning).

### `/plans` and `/plans/[id]`

- **Users:** Sam (reviews), Devin (creates via Cursor), Priya (reads)
- **Primary action:** browse plans; read a plan
- **Note:** plans are markdown-with-frontmatter authored in Cursor. Web is a viewer. Each detail page has an "Open in IDE" action that resolves to the source file. No web-side plan editor in v1.

### `/skills/[id]`

- **Users:** Priya, Jordan, Sam
- **Primary action:** see a skill's full history, criteria for next level, recent invocations, projects it runs on
- **Linked from:** the autonomy ledger (H4)
- **Currently:** does not exist

### `/rules`

- **Users:** Sam, Jordan, Priya
- **Primary action:** browse rules, see which projects/phases they apply to
- **Note:** rules are markdown-with-frontmatter, authored in Cursor like plans. Web is a viewer.
- **Currently:** read-only list, 35 lines

### `/integrations`

- **Primary user:** Jordan
- **Primary action:** two-level: org-level OAuth + per-project bindings
- **Org level:** connect GitHub / Jira / Confluence / ADO once, store credentials per-org (not env)
- **Per-project:** bind a provider to a project (which repo, which Jira project key, which Confluence space, which ADO project)
- **Note:** the binding step is currently `TODO: binding editor — follow-up` on the project detail page. Needs to land here.

### `/api-keys`

- **Users:** anyone with programmatic-access need (Jordan for webhook setup, Sam for the Cursor MCP)
- **Primary action:** create / rotate / revoke
- **Currently:** exists

---

## Admin / auth (stock shadcn — mostly done)

- `/auth/sign-in`, `/auth/forgot-password`, `/auth/reset-password` — exist, fine
- `/settings` (org + user profile) — minor work, stock

---

## Out of scope (separate tracks)

- **Marketing landing** (`/app/page.tsx`) — has its own design track; the one-pager is the reference
- **Marcus's v2 audit UI** — design intent preserved in v1's `/audit` data model; do not build the dedicated Marcus surface yet
- **Web-side plan editor** — Devin authors in Cursor; web is viewer-only
- **Notifications surface** — moments happen *because* of notifications; the side-panel notification list itself isn't a hero
- **Mobile** — coznt is desktop-first for v1. Sam, Devin, Jordan, Priya all work from laptops.

---

## Flow map (sanity check across personas)

### Sam's daily flow
1. Login → `/projects` portfolio (H1) — opens this first
2. Click project with pending gate → `/projects/[id]` cockpit (H2)
3. Click pending approval → `/approvals` (H3) → approve inline
4. Alternate path: hits `/approvals` directly first thing in the morning, Mine tab, clears inbox

### Priya's weekly flow
1. Login → `/skills` ledger (H4) — check the trust direction
2. → `/metrics` cross-project DORA (H5) — portfolio health
3. Click into a project from either if something's flagged

### Priya's audit flow (rare, critical)
1. `/audit` → parameterize → export → hand to CISO

### Jordan's flow
- Onboarding: `/integrations` → bind providers org-wide and per-project
- Daily: `/metrics` (H5) → if regression, open `incident` plan via `/plans` → continue investigation in linked tools
- Occasional: review infra approvals in `/approvals` (H3)

### Devin's flow
- Cursor open → `get_my_context` MCP call → grounded session, never opens web UI
- When he does open web: `/projects/[id]` to grab the Cursor setup snippet, or `/skills/[id]` to understand why a skill rejected his invocation

---

## Hero vs. functional vs. stock (summary table)

| Screen | Tier | Variants | Effort vs. today |
|---|---|:-:|---|
| `/projects` portfolio | Hero #1 | 3 | High — re-design from table to cockpit |
| `/projects/[id]` cockpit | Hero #2 | 3 | Medium — port per-phase guidance, polish |
| `/approvals` inbox | Hero #3 | 3 | High — build the action surface |
| `/skills` ledger | Hero #4 | 3 | High — trust-earned visualization is new |
| `/metrics` cross-project | Hero #5 | 3 | High — cross-project rollup is new |
| MCP `/context` endpoint | DX | n/a | High — does not exist, build from spec |
| Cursor connect modal | DX | n/a | Low — small modal on H2 |
| `/audit` | Functional | n/a | Medium — query builder + signed export |
| `/projects/new` | Functional | n/a | Medium — auto-provision flow |
| `/skills/[id]` | Functional | n/a | Medium — does not exist |
| `/integrations` | Functional | n/a | Medium — binding editor |
| `/plans`, `/plans/[id]` | Functional | n/a | Low — viewer polish |
| `/rules` | Functional | n/a | Low — viewer polish |
| `/api-keys` | Functional | n/a | Low |
| `/auth/*` | Stock | n/a | None |
| `/settings` | Stock | n/a | Low |

15 designed surfaces + 1 DX track. 5 hero, 7 functional, 3 stock-ish. Total variant explorations: **15** (5 heroes × 3 variants).

---

## Open questions to revisit at DESIGN.md stage

1. **Portfolio dense vs. cards.** H1 at 30+ projects might want a different shape than at 5. Variant exploration should include both density extremes.
2. **Phase guidance authorship.** H2's per-phase guidance content — is it a plan kind (one `phase_guidance` plan per phase per project, customizable) or hardcoded defaults in the domain layer with override? Affects scope but not visual variants. Decide before content goes into the cockpit.
3. **Skill detail (`/skills/[id]`) — read vs. configure.** Does it have any write surface (toggle enabled, set per-project override) or is it pure read? Decide before the variant pass on H4 — affects what "drill into a skill" feels like.
4. **Cross-project attribution (H5).** "Which skill caused the regression" requires correlating skill_outcomes with metric values around a deploy window. The model is non-trivial. Design the screen as if attribution works; flag the implementation effort separately.
5. **Bulk-approve trust modeling (H3).** Should we track who bulk-approves which skills? Future autonomy-trust input. Doesn't change the v1 design but worth a noted decision point.

---

## What this unlocks next

Per `methodology.md`: **DESIGN.md** comes next — color, type, spacing, motion tokens that lock the visual system before any variant exploration starts. Then variants for the 5 heroes. Then per-screen briefs for an external generator.
