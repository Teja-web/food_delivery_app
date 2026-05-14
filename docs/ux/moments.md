# Coznt Moments

Seven specific moments worth designing for. Each is the answer to "what would make this user say 'I can't go back to the old way' after 30 days?"

A moment is not a feature. It's a **trigger → outcome** loop with a visible **trust signal** that wasn't possible before coznt. Screens emerge from moments. If a screen doesn't serve a moment on this list, it's an admin surface, not a hero surface.

## Load-bearing vs second-tier (added 2026-05-12)

Under the autonomy-with-observability spine (`docs/positioning.md`, `docs/architecture.md`), three of the seven moments carry the loop. The other four are second-tier — still worth designing, but they ship after the load-bearing three are real.

| Tier | Moment | Loop role | Milestone |
|---|---|---|---|
| **Load-bearing** | #1 Friday Portfolio Sweep | Observability — proves cross-project visibility works | B |
| **Load-bearing** | #4 Trust Earned | Autonomy — proves the ledger compounds | A (first per-project pair earns) → C (AI signal joins) |
| **Load-bearing** | #7 CISO 24-Hour Drill | Audit defense — proves the ledger is exportable | B |
| Second-tier | #2 Blocked Gate | Substrate (gates) — visible in cockpit | B |
| Second-tier | #3 Daily Approval Inbox | Loop participation — humans-only in B, agent-aware in D | B → D |
| Second-tier | #5 DORA Regression Diagnosis | Observability rollup — diagnostic, not first sale | B |
| Second-tier | #6 The First-Call (any MCP client) | Input surface for the loop — adoption, not value proof | E |

Build sequence: prove the load-bearing three on real data (Milestones A–B). Layer second-tier moments on top once the spine is honest. Don't let #6 (Devin's MCP client) pull ahead of the loop being real — it's the input surface, not the value.

---

## The seven moments

### 1. The Friday Portfolio Sweep — Sam

- **User:** Sam (team lead, player-coach, 2-4 active projects)
- **Trigger:** It's Friday afternoon. His skip-level pings: *"Quick status across all your projects before the leadership review on Monday?"*
- **Today:** 3-4 hours. Open Jira for each project, eyeball the burndown. Switch to GitHub, scan open PRs. Check Slack for team standup notes. Mentally reconcile. Type a paragraph per project into a Notion page. Hope nothing leaked.
- **With coznt:** Opens `/projects`. Sees portfolio at a glance — each project's phase, blocking gates, autonomy events this week, deployment count, change-failure trend. Drops the link into Slack. 90 seconds.
- **Trust signal:** Every claim on the portfolio view is one click from its source of record — phase ribbon → recent gate decisions; deploy count → the actual GitHub deployments; open approvals → the specific PRs. No coznt-only numbers. Trust is observable.
- **Surface:** `/projects` portfolio view (hero #1)
- **Why this earns hero status:** This is the wedge surface. Multi-project is coznt's structural advantage; this moment makes it visible in 90 seconds.

### 2. The Blocked Gate — Sam

- **User:** Sam
- **Trigger:** Mid-week. Sam goes to advance one of his projects from Design → Development. The gate fails.
- **Today:** "Gate failed" or some vague status. Click into individual gate items. Hunt across CI logs, JIRA tickets, Slack threads to find what's actually missing. Ping three people. Wait.
- **With coznt:** Cockpit shows the failed gate inline with **named unmet criteria** — not "tests failing" but "ADR-0014 review pending @rohan since Tuesday; resume_text test coverage at 67% (gate: 80%)." Each criterion has the next action: assignee, link, expected SLA.
- **Trust signal:** The gate's pass/fail is *deterministic and reproducible* — the same project state always yields the same gate result. If something passed yesterday and fails today, the diff is shown. No magic.
- **Surface:** `/projects/[id]` cockpit (hero #2)
- **Why this earns hero status:** The phase-gate moment is where governance either feels like help or feels like bureaucracy. If we get this wrong, Sam stops trusting the gate system. If we get it right, the cadence becomes invisible.

### 3. The Daily Approval Inbox — Sam

- **User:** Sam (also: occasional Jordan when reviewing infra changes)
- **Trigger:** Monday 9am. 12 approvals waiting across his 3 projects. He has 20 minutes before his first meeting.
- **Today:** Click into each one. Each is from a different system (GitHub PR comment, Jira ticket transition, a Slack DM). Each needs separate context-gathering — what changed, why, who asked, what the rules say.
- **With coznt:** `/approvals` shows all 12 inline. Each row: change summary, requesting skill (if any) with current autonomy level, evidence (PR diff, test results, gate status), and Approve/Reject buttons with a required comment field. Sam can clear 9 of 12 in 8 minutes; the 3 that need a real look get a focused click-through.
- **Trust signal:** Each approval shows the requesting skill's **track record** — "Senior autonomy: 47 successes / 0 incidents / 2 rollbacks (30d). Auto-approves below complexity threshold." Sam knows whether to trust the request before he reads the diff.
- **Surface:** `/approvals` inbox (hero #3)
- **Why this earns hero status:** This is where most of Sam's daily coznt interaction happens. The inbox is where governance pays the user back for the overhead.

### 4. The Trust Earned Moment — Priya

- **User:** Priya (Director of Engineering)
- **Trigger:** Weekly Friday review. A skill — say, `frontend-test-author` — has been running clean for 30 days and the nightly recompute promotes it from Junior to Senior.
- **Today:** Doesn't happen anywhere. AI usage in her org is ambient; she has no way to know "this agent has earned more autonomy" vs. "this agent is rolling the dice."
- **With coznt:** Priya opens `/skills`. The autonomy ledger surface shows the promotion event prominently: skill name, badge change (Junior → Senior with the pill visual), the 30-day stats that earned it (success rate, rollback rate, projects it ran on), and the new permissions it unlocks (auto-approve PRs under N lines with ≥M% test coverage). She approves; one click.
- **Trust signal:** The promotion has **receipts**. Every claim is queryable: "show me the 47 successes" → list of PRs. "Show me what counts as a success" → the definition links to a plan of kind `policy`. Reversibility is visible: "If `frontend-test-author` ships an incident, it auto-demotes to Junior within 5 minutes."
- **Surface:** `/skills` autonomy ledger (hero #4)
- **Why this earns hero status:** This is the marketing thesis made physically visible. "Vibe coding, made auditable" means trust is earned, observable, and reversible. If this moment doesn't feel earned, the whole product positioning collapses.

### 5. The DORA Regression Diagnosis — Priya + Jordan

- **User:** Priya (portfolio-level) and Jordan (cross-team SRE)
- **Trigger:** Wednesday morning. Change-failure rate across the portfolio ticks up 4% week-over-week. Both get an alert.
- **Today:** Open the company's DORA dashboard (Datadog or a hand-built one). It shows aggregates. To diagnose, they drill into per-team dashboards (if those exist). They spend 90 minutes trying to figure out *which team's regression is driving the portfolio number.* Often inconclusive.
- **With coznt:** Open `/metrics`. The cross-project view shows the portfolio number on top, then a small-multiples grid: each project's change-failure rate as a sparkline. The two projects with the spike are visually obvious. Click into one — the spike is attributed to a specific window, three specific deploys, two of which were auto-approved by the same skill. The skill detail page (linked) shows that skill is now flagged for review.
- **Trust signal:** Attribution is **causal, not correlative**. The cross-project view doesn't just say "metric went up"; it points at the specific skill, the specific deploys, and the autonomy state at the time of each deploy. Jordan can open an `incident` plan in two clicks, with the evidence pre-populated.
- **Surface:** `/metrics` cross-project DORA (hero #5)
- **Why this earns hero status:** This is Priya's buying-decision moment. Per-project DORA is table stakes (every tool has it). Cross-project causal attribution is what makes coznt worth the line item.

### 6. The First-Call — Devin (any MCP client)

- **User:** Devin (senior engineer, lives in an MCP-capable IDE — Cursor today, equally Claude Code, Cline, Continue, Zed, or any future MCP client tomorrow)
- **Trigger:** Tuesday. He's been pulled onto a new project mid-sprint. Opens his IDE in the repo for the first time.
- **Today:** He spends 20-40 minutes orienting. Reads the README. Greps for the auth lib. Asks teammates which Confluence pages still apply. Copy-pastes a paragraph of project conventions into the chat. Loses context every session.
- **With coznt:** First message of the session: *"What should I be working on?"* The agent calls coznt's MCP `get_my_context`. Returns in <1s: the project (FinTrack), the phase (Development), Devin's specific JIRA ticket (FT-1024), the phase-discipline (allowed/forbidden lists), the rules in force (with links), the skills he can invoke (with autonomy levels — so he knows which ones are likely to auto-approve), and the ADRs that bind this work. No copy-paste.
- **Trust signal:** Every claim in the response is **grounded** — each rule, ADR, and skill is a linked URL back to coznt. If Devin doubts a citation, he clicks. If the response cites the *wrong* project (the most damaging failure), the structure makes that immediately visible — wrong title at the top.
- **Surface:** MCP server (`@coznt/mcp`, stdio) — speaks the open Model Context Protocol, so any compliant client mounts it. DX track, not a hero screen — but a hero *moment*.
- **Why this earns hero status:** This is where two-planes clarity is won or lost. If Devin trusts the MCP, the platform is invisible-but-load-bearing. If he doesn't, he turns it off and the entire wedge collapses. The screen is in the IDE, but the design decisions live in coznt — and the protocol is open, so this moment compounds as new MCP clients ship.

### 7. The CISO 24-Hour Drill — Priya

- **User:** Priya
- **Trigger:** Tuesday 4pm. The CISO Slacks: *"Auditor is here Thursday. Show me every change an AI agent made to any payments-adjacent project in the last 90 days, and the human who reviewed each one."* She has 24 hours.
- **Today:** Panic. There's no good answer. Best case: she pulls Git history for ~15 repos, cross-references against Cursor session logs (if she has them), tries to reconstruct who reviewed each PR from GitHub. Worst case: she tells the CISO honestly that she can't reconstruct this and watches her own credibility take damage.
- **With coznt:** She opens `/skills` → filters to skills tagged `payments-adjacent`. The cross-project autonomy ledger surface has a *Query* action — pick a date range, pick scope (skills / projects / changes), pick output format. The query runs. CSV/JSON downloads. Every row: timestamp, skill, action taken, project, change reference (PR link), reviewer (human ID with role), autonomy level at time of action, signature hash.
- **Trust signal:** The export is **reproducible** — same query parameters tomorrow yield identical output (immutable log). The reviewer attribution is **non-repudiable** — the human who approved is recorded with their session ID at the time, not their current role. The CISO can hand this directly to the auditor.
- **Surface:** `/skills` autonomy ledger (with query/export action) — same surface as #4
- **Why this earns hero status:** This is Priya's *fireable-consequence* moment. The single use case where coznt's absence is most costly. The export endpoint is technically also Marcus's v2 home, but Priya needs the basic query in v1 — she can't tell the CISO "wait until v2."

---

## What we explicitly chose NOT to make a moment

- **The integration setup wizard (Jordan).** Real, but a *task* not a *moment*. Jordan does this once per binding, doesn't need design exploration. Functional shadcn form. (Decision in `personas.md`: not a hero surface.)
- **The skill invocation log (Jordan / Priya).** Useful, but doesn't have a clear trigger → outcome shape. Lives as a detail view inside `/skills/[id]`, not its own moment.
- **The marketing landing page.** Important for sales, not for users-in-product. Separate design track.
- **The settings / org / API-keys screens.** Admin surfaces. Stock shadcn.
- **The plan editor.** Real, but Devin authors plans in Cursor (markdown + frontmatter). The web UI is a viewer with `Edit in IDE` actions, not an editor. Not a hero moment.
- **The notifications surface.** A coznt feature, but the moments happen *because* of notifications (gate failed, skill leveled up). The notification itself isn't the moment.

---

## Moments → personas → surfaces (sanity check)

| Moment | User | Surface | Hero # |
|---|---|---|:-:|
| 1. Friday Portfolio Sweep | Sam | `/projects` portfolio | 1 |
| 2. Blocked Gate | Sam | `/projects/[id]` cockpit | 2 |
| 3. Daily Approval Inbox | Sam | `/approvals` inbox | 3 |
| 4. Trust Earned Moment | Priya | `/skills` autonomy ledger | 4 |
| 5. DORA Regression Diagnosis | Priya + Jordan | `/metrics` cross-project DORA | 5 |
| 6. The First-Call (any MCP client) | Devin | MCP server (`@coznt/mcp`) | DX track |
| 7. CISO 24-Hour Drill | Priya | `/skills` autonomy ledger (query/export) | 4 (shared) |

- All 4 primary personas have at least one moment.
- 5 distinct hero surfaces + 1 DX track cover all 7 moments.
- Hero #4 (autonomy ledger) carries two moments — the positive (trust earned) and the audit (CISO drill). Worth a note for variant design: the screen must work for *both* the celebration moment and the export moment without compromising either.

---

## What this unlocks next

Next step from `methodology.md`: **screens** (`docs/ux/screens.md`). Each screen names its moment(s), user, primary action, data needed, key states. After screens, DESIGN.md, then variant exploration for the 5 hero screens.

Open question to revisit at screens-stage: Hero #4 (autonomy ledger) carries two very different moments (#4 celebration, #7 audit/export). Decide whether they're one screen with two affordances or two screens that share data.
