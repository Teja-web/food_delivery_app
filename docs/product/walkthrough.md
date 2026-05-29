# Walkthrough

*Purpose: end-to-end narrative of how each persona uses coznt — read this before any individual surface doc.*

A day-in-the-life walkthrough for each of coznt's four primary personas, plus the one-time setup that makes the loop run.

For the underlying design rationale (who these personas are, why these moments earn hero status), see [`../ux/personas.md`](../ux/personas.md) and [`../ux/moments.md`](../ux/moments.md). For the runtime model and milestone sequencing, see [`./architecture.md`](./architecture.md).

---

## One-time setup — Jordan (platform / SRE)

Jordan owns the integration surface across all the teams' projects. Per project, once:

1. **Create the project** at `/projects/new` — name, slug, repo URL, starting phase (`requirements`).
2. **Wire integrations** at `/integrations` — GitHub webhooks (PR merge / deploys), Jira or ADO, Confluence. One binding per project per provider.
3. **Configure phase gates** — per phase, define what must pass before phase advance: `approval`, `coverage` with threshold, `lint`, `security`, or `custom`.
4. **Register skills** — at Milestone A these are deterministic assessors over observed signal (PR merge → `success`, revert → `rolled_back`, deploy incident → `incident`). AI-backed skills join at Milestone C.

After this, the loop runs without further input: GitHub webhooks → pgmq → tasks append `skill_outcomes` rows → autonomy recomputes per `(skillId, projectId)` → ledger updates → portfolio / approvals / metrics surfaces reflect it.

---

## Sam — team lead, daily user

Player-coach with 2–4 active projects. Lives in three surfaces.

### Monday 9am — `/approvals` inbox

12 approvals waiting across his 3 projects. He has 20 minutes before his first meeting.

Each row in the inbox shows:
- Change summary
- Requesting skill (if any) with its current autonomy level
- 30-day track record (e.g. *"Merge: 47 successes / 0 incidents / 2 rollbacks. Auto-approves below complexity threshold."*)
- Inline evidence — PR diff, test results, gate status
- Approve / Reject buttons with a required comment field

He clears 9 of 12 in 8 minutes. The 3 that need a real look get a focused click-through.

### Mid-week — `/projects/[id]` cockpit

Sam tries to advance a project from Design → Development. The gate fails.

The cockpit shows the **named unmet criteria** inline — not "gate failed" but:
> *"ADR-0014 review pending @rohan since Tuesday; test coverage 67% (gate: 80%)."*

Each criterion has its next action: assignee, link, expected SLA. The gate's pass/fail is deterministic — same project state → same gate result. If something passed yesterday and fails today, the diff is shown.

### Friday — `/projects` portfolio

90-second sweep across all his projects. Each card surfaces:
- Phase + gate status with named blockers
- Open approvals count
- Last deploy timestamp
- 30-day change-failure sparkline
- Autonomy events (promotions / demotions / incidents) in the last 7 days

Rollup strip at top: total open approvals, deploys this week, autonomy promotions/demotions this week. Answers the skip-level's "where are we?" without a status meeting.

---

## Devin — senior engineer, daily-invisible user

Devin never opens the web UI. He lives in an MCP-capable IDE (Cursor, Claude Code, Cline, Continue, Zed — any client speaking the open protocol).

**First message of a session:** *"What should I be working on?"*

His agent calls coznt's MCP `get_my_context`. In under a second it returns:
- Current project (the right one — wrong-project context is the most damaging failure)
- Current phase + phase discipline (allowed / forbidden lists)
- Rules in force, with links
- Skills he can invoke, with their autonomy levels (so he knows which will auto-approve)
- Binding ADRs for the work
- His assigned ticket

Every claim links back to coznt. No copy-pasting Confluence into chat. No re-orienting when he switches from Project A to Project B mid-week.

**Deal-breaker:** latency above ~2s, or wrong-project context. The structure of the response makes wrong-project failures immediately visible (wrong title at the top).

---

## Priya — director of engineering, weekly user (and primary buyer)

Sits 1–2 layers above Sam. Spans 4–8 teams / 12–30 projects. Checks in weekly, not daily.

### Weekly — `/skills` autonomy ledger

Scans cross-project trend. Which skills got promoted this week (`doc-updater` → merge), which got demoted (`schema-migration-reviewer` → propose after a rollback on payments). The "trust earned, visibly" view — the one that lets her tell legal and security that AI-assisted engineering is safe to keep doing.

### When metrics tilt — `/metrics`

Portfolio-wide DORA — lead time, deploy frequency, change-failure rate, MTTR — with per-project small multiples and week-over-week trend arrows. Sees a CFR spike on one project, drills to *which skill auto-approved* the regressing deploys. Causal attribution, not just numbers.

### The CISO 24-hour drill

Tuesday 4pm. CISO Slacks:

> *"Auditor is here Thursday. Show me every change an AI agent made to any payments-adjacent project in the last 90 days, and the human who reviewed each one."*

She has 24 hours. Without coznt, this is archaeology across 15 repos, Cursor logs, and Slack. With coznt:

1. Open `/skills`, filter by tag `payments-adjacent`
2. Pick date range + output format (CSV / JSON)
3. Export

Every row: timestamp, skill, action, project, change reference (PR link), reviewer (human ID with role at the time), autonomy level at action-time, signature hash. **Reproducible** (same params → identical output) and **non-repudiable** (reviewer captured at the time, not their current role). Hand directly to the auditor.

---

## Jordan — platform / SRE, weekly+ user

Owns the cross-project view. Lives in `/integrations`, cross-project `/metrics`, and incident plans when something breaks.

**Post-mortem flow.** A deploy goes bad on one of seven projects he supports. MTTR clock starts. He needs to know:
- What changed on *that* project
- Which gate let it through
- Which skill (if any) auto-merged it
- Whether the same skill ran clean on the other six projects

The autonomy ledger + signed action log + cross-project comparison is the post-mortem. He's not reconstructing it from Slack and Git.

**Why he keeps using coznt.** Adapter bindings live in one place across all seven projects, not scattered in squad-owned configs. DORA is computed for him at both per-project and cross-project granularity.

---

## The loop in one sentence

Project + integrations wire up the signal → skills are the unit of work → outcomes flow into the ledger → autonomy is earned per-project from the trailing 30-day window → approvals + gates consume autonomy to decide auto vs. human → portfolio + DORA make the whole thing legible up the org → MCP projects it back into the IDE where the work happens.

---

## Mapping back to the build

| Persona | Primary moment | Surface | Hero # |
|---|---|---|:-:|
| Sam | Friday Portfolio Sweep | `/projects` portfolio | H1 |
| Sam | Blocked Gate | `/projects/[id]` cockpit | H2 |
| Sam | Daily Approval Inbox | `/approvals` inbox | H3 |
| Priya | Trust Earned | `/skills` autonomy ledger | H4 |
| Priya + Jordan | DORA Regression Diagnosis | `/metrics` cross-project | H5 |
| Devin | First-Call (any MCP client) | MCP server (`@coznt/mcp`) | DX |
| Priya | CISO 24-Hour Drill | `/skills` ledger query/export | H4 (shared) |

See [`../ux/build-plan.md`](../ux/build-plan.md) for the phase-by-phase build sequence against these surfaces, and [`../operate/install.md`](../operate/install.md) for what ships first.
