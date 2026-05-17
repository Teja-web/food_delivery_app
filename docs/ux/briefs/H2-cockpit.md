# H2 Brief — `/projects/[id]` Cockpit

**References:** `docs/ux/DESIGN.md`, `docs/ux/sample-data.md`, `docs/ux/moments.md` (Moment 2), `docs/ux/personas.md` (Sam).

## Anchor (read this first)

Coznt's project cockpit is **Sam's per-project deep view**. He's a player-coach Tech Lead. He arrives here after seeing a flag on the portfolio (H1), or directly when he needs to advance the project to its next phase. The job-defining moment: he hits "Advance to next phase" and the gate fails — today this means a vague "tests failing" message and 30 minutes hunting in CI logs. With coznt's cockpit, the failed gate names its unmet criteria, names the assignee, links to the source of record, and shows what changed since the last green check.

Two things the cockpit must do that the current implementation doesn't:
1. **Per-phase guidance panel** — port the prior SDLC pattern: this phase's description, suggested actions, the condition that advances to the next phase
2. **Named unmet criteria with assignees + SLAs** — never "gate failed" alone; always "ADR-0014 review pending @rohan since Tuesday (3d)"

## Persona & primary action

- **User:** Sam (with occasional Devin/Jordan looking)
- **Primary action:** understand current phase, see what's blocking, advance the gate when ready
- **Secondary:** open a plan; review a gate item; jump to a pending approval on this project; open the linked GitHub PR / Jira ticket; grab the Cursor connect snippet

## Layout direction (resolved)

**Two-column layout above a single-column activity stream.** Left column (60%): header + current phase guidance + gates list. Right column (40%): adapter bindings, plans-in-this-project, recent activity. Below: full-width activity stream (last 14 days).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ◀ Northwind › Auth Service Migration                          [Connect Cursor]│
│   slug: auth-service-migration · Created Nov 21 · Phase ⚠ TESTING (BLOCKED)  │
│                                                                              │
│ ┌──── 60% ─────────────────────────────┐ ┌──── 40% ────────────────────────┐│
│ │ THIS PHASE: TESTING                  │ │ ADAPTER BINDINGS                ││
│ │ Run the full test plan, verify       │ │ GH  northwind/auth              ││
│ │ rollback, secure CAB sign-off.       │ │ Jira AUTH                       ││
│ │                                      │ │ ADO  —                          ││
│ │ Suggested actions:                   │ │ Confluence  —                   ││
│ │ • Get E2E pass rate to 95%+          │ │                                 ││
│ │ • Document rollback procedure        │ │ [+ Bind another provider]       ││
│ │ • Submit for CAB sign-off            │ ├─────────────────────────────────┤│
│ │                                      │ │ PLANS (4)                       ││
│ │ Next phase opens when:               │ │ feat  Migrate /auth/login       ││
│ │   All gates passed + Sam approves    │ │ test  E2E smoke tests           ││
│ │                                      │ │ inc   Migration rollback 5/8    ││
│ │ [Advance to CICD →]  (disabled: 2    │ │ adr   Better-Auth migration plan││
│ │                       gates pending) │ │                                 ││
│ ├──────────────────────────────────────┤ │ [+ New plan]                    ││
│ │ GATES (this phase)                   │ ├─────────────────────────────────┤│
│ │                                      │ │ AUTONOMY EVENTS (7d)            ││
│ │ ✓ Test plan approved                 │ │ ↓ schema-migration-reviewer     ││
│ │ ✗ E2E pass rate 95%+   87% — fixing  │ │   demoted Senior → Junior 5/10  ││
│ │   3 flakes in session-cookie suite   │ │ • frontend-test-author          ││
│ │ ✓ Rollback verified                  │ │   review pending 6/4            ││
│ │ ⏳ CAB sign-off — @jordan since 1d   │ │                                 ││
│ │                                      │ │                                 ││
│ │ Last green: 2026-05-09 (3d ago)      │ │                                 ││
│ └──────────────────────────────────────┘ └─────────────────────────────────┘│
│                                                                              │
│ RECENT ACTIVITY (last 14 days)                                              │
│ ────────────────────────────────                                            │
│ 2026-05-10 ↓ schema-migration-reviewer demoted Senior → Junior              │
│ 2026-05-10 ⚡ incident plan_auth_i1 RESOLVED — session-cookie rollback      │
│ 2026-05-10 ⚙ PR #441 session-cookie-fix opened by Marco (autoapprove req'd) │
│ 2026-05-09 ✓ ADR-0011 (Outbox) re-reviewed by Rohan                         │
│ 2026-05-08 ⚡ incident plan_auth_i1 OPENED — session cookie mismatch        │
│ 2026-05-07 ▲ deploy v0.4.2 to staging (Devin)                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

1. **Page header** — back-link to portfolio, breadcrumb, project name, slug + created date, phase badge with status (TESTING / BLOCKED), "Connect Cursor" button (top-right, opens modal with `.cursor/mcp.json` snippet)
2. **Per-phase guidance card** — title ("THIS PHASE: TESTING"), description, suggested actions bullet list, "Next phase opens when" condition, **Advance button** (primary CTA, disabled with reason if blocked)
3. **Gates card** — list of gates for current phase. Each row: status icon (✓ passed / ✗ failed / ⏳ pending / ◯ skipped), gate name, **named unmet criterion** with current value + target + assignee + age. Bottom: "Last green: <date>" indicator for state-diff awareness.
4. **Adapter bindings card** — compact list of bound providers. Unbound shows as `—`. "+ Bind another" link.
5. **Plans card** — compact list by kind. Each row: kind badge + title + status. Click → plan detail.
6. **Autonomy events card** — last 7d events affecting skills on this project. Demotions visually distinct from promotions.
7. **Recent activity stream** — chronological, mixed event types (autonomy, gate, deploy, incident, plan), each with timestamp + author + entity link.

## Sample data — use `proj_auth` (Auth Service Migration) exactly

- Phase: TESTING, status BLOCKED
- Gates: 4 (test plan ✓, E2E pass rate ✗ at 87%, rollback ✓, CAB sign-off ⏳ @jordan 1d)
- Plans: 4 (one of each kind incl. the incident)
- Adapter bindings: GitHub `northwind/auth` ✓, Jira `AUTH` ✓, ADO + Confluence unbound
- Autonomy events: schema-migration-reviewer demotion (recent, prominent)
- Activity stream: 5-7 events from the fixture timeline

## Interactions

- **Click "Advance to CICD →"** — if all gates pass, opens confirmation. If blocked, button is disabled with tooltip naming the blocker.
- **Click a failed gate** — expands to show the criterion details + a "Re-check" action button (re-runs the gate evaluation)
- **Click an unmet criterion's assignee** → opens a small popover with their info + "Ping in Slack" action
- **Click adapter binding row** → drawer with config detail + last sync timestamp + "Unbind" action (with confirm)
- **Click "+ New plan"** → modal asking plan kind, then redirects to `/plans/new?projectId=<id>&kind=<kind>`
- **Click "Connect Cursor"** → modal with the `.cursor/mcp.json` snippet pre-filled with this project's API key. Copy-to-clipboard button. "View setup docs" link.
- **Click any autonomy event** → drilldown to `/skills/[id]`
- **Click any activity entry** → drilldown to its source (PR, plan, incident, etc.)

## States

- **Loading:** skeleton matching the three-card grid
- **Empty (brand-new project, no plans yet):** the activity stream shows "Project created" only; per-phase guidance points to "Draft your first requirement" as the suggested action
- **Gate previously green, now failed:** the gates card surfaces a "What changed?" diff inline — name the criterion that flipped and the value delta
- **All gates passed:** "Advance" button becomes the primary CTA at full prominence
- **Final phase (Monitoring) reached:** the per-phase card pivots to a "Monitoring view" — DORA snapshot + open incidents + "Mark project complete" action
- **Broken integration on this project:** prominent warning at the top of the adapter card with retry action
- **Stale project (no activity 30d+):** "Inactive 30d" pill in the header; no urgency styling

## Trust signals (load-bearing)

1. **Named unmet criteria** — "E2E pass rate 95%+: currently 87% (3 flakes in session-cookie suite)" is the design pattern. Never "gate failed" with no context.
2. **Assignee + age on pending criteria** — `@jordan since 1d`. Both pieces required.
3. **"Last green: 2026-05-09" indicator** on the gates card — the diff-from-known-good is critical for trust.
4. **Suggested actions are linked** — each bullet in the guidance card links to the relevant tool or plan to act on it.
5. **Advance button shows the blocker** — disabled state must name the specific gate(s) blocking advancement, not just "incomplete."

## Anti-patterns

- ❌ Vague gate states ("failed", "pending", "incomplete") with no named criterion
- ❌ Phase guidance hidden in a tooltip or settings page — it's the primary affordance
- ❌ Advance button enabled with a generic "Are you sure?" confirm — the system should know whether advancement is valid
- ❌ Per-phase guidance content hardcoded in the JSX (use a domain-layer source so it's overridable; flagged for resolution)
- ❌ Activity stream that mixes user-visible events with internal log spam
- ❌ Heavy hero header with project description as paragraph text — keep header to one line, description in a collapsible or attached plan

## Variant exploration prompt for Lovable

> Generate 3 variants of a project cockpit page for an SDLC governance platform. Two-column layout: left 60% (per-phase guidance + gates list), right 40% (adapter bindings + plans list + recent autonomy events). Below: full-width recent activity stream. Project: "Auth Service Migration" (slug: auth-service-migration), currently in TESTING phase, status BLOCKED. Per-phase guidance card: title "THIS PHASE: TESTING", description, 3 suggested actions, "Next phase opens when" condition, "Advance to CICD" button (disabled because 2 gates pending). Gates card: 4 gates with status icons — test plan ✓, E2E pass rate ✗ at 87% (target 95%, 3 flakes in session-cookie suite), rollback verified ✓, CAB sign-off pending @jordan since 1d. "Last green: 2026-05-09" indicator. Adapter bindings card: GitHub (northwind/auth), Jira (AUTH), ADO/Confluence unbound. Plans card: 4 plans across kinds. Autonomy events card: schema-migration-reviewer demoted Senior → Junior on 5/10. Activity stream: 6 entries. Information-dense, dark theme primary, theme-swappable. 13px base font, Inter, Lucide icons. shadcn Card primitive but with tight padding. No hero illustration, no marketing-style headers.

## Visual references

- Marketing one-pager (the dark/teal aesthetic)
- Prior SDLC `apps/web/src/app/(app)/projects/[id]/page.tsx` — had per-phase guidance and Advance button; structure was sound, aesthetic was light
- Linear's issue detail page (information density)
- GitHub PR page (the chrome-light density we want)

## What success looks like

Sam clicks into Auth Service Migration from the portfolio at 9:15 Tuesday morning. He sees in one glance: TESTING / BLOCKED, the E2E flakes issue at 87%, Jordan owes him a sign-off since yesterday. He pings Jordan in Slack via the assignee popover. He opens the E2E failure plan in a new tab. The advance button being disabled with a clear reason is *helpful*, not annoying. He moves to the next project.
