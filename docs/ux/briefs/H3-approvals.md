# H3 Brief — `/approvals` Inbox

**References:** `docs/ux/DESIGN.md`, `docs/ux/sample-data.md`, `docs/ux/moments.md` (Moment 3), `docs/ux/personas.md` (Sam).

## Anchor (read this first)

This is Sam's actual inbox. Monday 9am, 12 pending approvals across his 3 active projects. He has 20 minutes before his first meeting. Today: each approval is in a different tool (a GitHub PR comment, a Jira ticket transition, a Slack DM, a stale plan-approval email). Each needs context-gathering — *what changed, why, who asked, what the rules say.* With coznt, all 12 are in one inbox, each with its evidence inline and a one-click approve/reject. The trust signal that closes the loop: each row shows the requesting skill's track record so Sam knows whether to trust the request before he reads the diff.

This is also where bulk-approve lives. Three of the 12 are auto-approval-eligible (low-risk, requested by Merge/Lead-autonomy skills). Sam should be able to clear them in a single confirmed action.

## Persona & primary action

- **User:** Sam (also Jordan for infra approvals; occasionally Priya)
- **Primary action:** approve or reject quickly with full context
- **Secondary:** bulk-approve same-skill low-risk batch; view a skill's track record; require more info; defer to a peer

## Layout direction (resolved)

**Email-inbox aesthetic: dense single-column row list with inline expansion.** Not cards. Tabs at the top (Mine / Team / All). Each row is one approval. Action buttons appear inline on hover and persist after click for a 5-second undo window.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Approvals                                  [Mine • 12]  Team (28)  All (47) │
│ ────────────────────────────────────────────────────────────────────────────│
│ [☐] Select  Bulk: [Approve eligible (3)] [Defer]                  Filter ▾  │
│                                                                              │
│ ☐ ⏳ release   payments-api  Q3 v2.4 rollout                         [✓][✗] │
│      Devin R · 2h ago · Release approval                                    │
│      Evidence: 4 PRs merged · CFR 8% · gate "release approval" passed       │
│                                                                              │
│ ☐ ⏳ gate      payments-api  Dev → Testing                           [✓][✗] │
│      system · 5h ago                                                         │
│      4/4 gates passed. Last green check 2026-05-12 14:00.                   │
│                                                                              │
│ ☐ ⏳ work-item payments-api  PR #1284 idempotency-keys                     │
│      bot · api-contract-checker [Merge · 92✓/1↻/0⚡ 30d] · 1d ago  [Auto ✓]│
│      Eligible for auto-approval: Merge autonomy + schema-only change       │
│      Evidence: PR diff (+47 -8) · tests pass · contract check pass          │
│                                                                              │
│ ☐ ⏳ plan      data-warehouse-v2  ADR-0014 logical decoding         [✓][✗] │
│      Yuki T · 3d ago · ADR · pending review                                 │
│      Quorum needed: 2 reviewers (currently 0).  Suggest @rohan @aisha       │
│                                                                              │
│ ☐ ⏳ work-item data-warehouse-v2  PR #93 schema-init               [✓][✗]  │
│      bot · schema-migration-reviewer [Propose · 18✓/4↻/1⚡ 30d] · 4h ago     │
│      ⚠ Manual review required — skill was demoted 5/10. No auto-approval.   │
│                                                                              │
│ ☐ ⏳ release   auth-service  hotfix rollback session-cookie  STALE 9d [✓][✗]│
│      Marco B · 9d ago · awaiting your action                                │
│                                                                              │
│ … 6 more                                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

1. **Tabs** — Mine (default, count), Team, All. Counts visible.
2. **Bulk action bar** — checkbox column. When auto-approval-eligible rows exist, "Approve eligible (N)" surfaces as primary. "Defer", "Reject", "Reassign" as secondary.
3. **Filter button** — opens a small panel: by project, by entity type, by skill, by age (stale 7d+).
4. **Row** — leading status icon, entity-type badge, project name, title, **inline action buttons** (✓ approve / ✗ reject with comment).
5. **Row meta line** — requester (user OR bot + skill), age, type-specific subtitle.
6. **Skill track record badge** — appears when a skill is the requester. Format: `[Merge · 92✓/1↻/0⚡ 30d]`. Pill color = autonomy level (see DESIGN.md trust palette).
7. **Auto-approve indicator** — when eligible, a small `[Auto ✓]` pill at right; clicking it expands the eligibility explanation.
8. **Evidence line** — third line, one-sentence summary with linked source-of-record (PR diff, test results, gate check).
9. **Stale tag** — for 7d+ rows, an amber "STALE Xd" pill.
10. **Reject modal** — small modal with **required reason textarea** + a "select a common reason" dropdown (style: "Needs more context", "Risk concern", "Owner ambiguity", etc.).
11. **Undo toast** — appears for 5s after every approve/reject action. Click "Undo" to revert.

## Sample data — use all 12 approvals from `sample-data.md` exactly

The 12 approvals in `sample-data.md` cover the full state matrix:
- 3 auto-approval-eligible (api-contract-checker Merge, doc-updater Lead)
- 1 requires manual review despite skill request (schema-migration-reviewer Propose, recently demoted)
- 1 intentionally stale (9 days)
- Mix of plan, phase_gate, work_item, release entity types
- Span of all 4 projects

## Interactions

- **Click ✓** → optimistic UI: row gets a "pending approval" style for 5 seconds → toast appears with "Undo" → after 5s the row disappears
- **Click ✗** → opens reject modal → must provide reason → row disappears with toast
- **Click "Approve eligible (3)"** → confirm modal listing the 3 with their skill names + autonomy levels → on confirm, all 3 approve with one undo toast covering all 3
- **Click row body** → drawer slides in (right side, 480px) with full context: entity detail, diff/content preview, full skill history if requested by bot, comments thread
- **Hover skill track record badge** → tooltip with stats breakdown and link to `/skills/[id]`
- **Click stale "STALE 9d" pill** → highlights why this hasn't been auto-followed-up (no current escalation rule). Future: link to escalation config.
- **Click requester avatar** → popover with their info + Slack DM action
- **Checkbox toggle** → enters bulk-select mode (other action buttons hide)
- **Keyboard:** `j` / `k` to navigate rows, `e` to approve, `r` to open reject modal, `o` to open drawer

## States

- **Loading:** skeleton with 5-7 row placeholders
- **Empty:** "Nothing pending. Nice." — single line, no illustration, no CTA
- **All auto-approval-eligible:** primary action button at the top changes to "Approve all (N) eligible" for one-click clearing
- **No tab has anything (Mine and Team and All all 0):** "No approvals yet. They'll show up here when work needs your sign-off." + link to documentation on what triggers approvals
- **Stale (>7d):** amber aging style; stale pill; row sticks to top of its tab regardless of sort
- **Self-requested (Sam approving his own request):** row shows "you requested this — cannot self-approve" + a "Reassign" button
- **Linked entity deleted:** row shows "Referenced entity no longer available" gracefully, with a "Dismiss" option
- **Skill demoted between request and now:** auto-approval revoked, "Manual review required" warning displayed inline

## Trust signals (load-bearing)

1. **Skill track record badge.** This is the *whole point* of the inbox — knowing whether to trust before reading the diff. Format and palette are non-negotiable; Merge autonomy is green, Propose is blue, Observe is gray, Lead is violet. Stats are 30-day rolling, always visible.
2. **Auto-approval-eligible vs. manual-required.** Visual differentiation must be unmistakable — the `[Auto ✓]` pill is the affordance that lets Sam clear safe ones fast.
3. **Recently-demoted-skill warning.** If a skill was demoted in the last 14 days, any approval it requested gets a "Manual review required" treatment (yellow inline warning). This is a *positive* trust signal — the system is being honest about reduced confidence.
4. **Required reject reason.** No skipping. Reasons feed back into skill autonomy and rule evolution. Sample defaults + free text.
5. **Evidence line on every row.** Never "approve this" without naming what to look at. Diff size, test pass count, gate state — all linked to source.

## Anti-patterns

- ❌ "Approve all" with no eligibility check — auto-approve only applies to skills with earned autonomy
- ❌ Reject without a reason field — every reject feeds back into the trust model
- ❌ Hiding bulk select until the user discovers it — show the checkbox column persistently
- ❌ Mega-cards with logos and big "APPROVE" buttons — keep dense
- ❌ Action buttons that move position based on hover state — sticky-on-row hover, persistent on touch devices
- ❌ Toast for every action that obscures the inbox — single undo toast, top-right, 5s timeout

## Variant exploration prompt for Lovable

> Generate 3 variants of an approval inbox page for an SDLC governance platform. Email-inbox-style dense single-column list, not cards. Tabs at top: Mine (12) selected, Team (28), All (47). Bulk action bar with "Approve eligible (3)" primary button when auto-eligible rows exist. 12 rows, each: checkbox + status icon + entity-type badge (release/gate/work-item/plan) + project name + title + age, with a second line showing requester (user OR "bot · <skill-name> [<autonomy>·stats]") and a third line showing evidence (linked sources). Skill autonomy pills must use: violet=Lead, green=Merge, blue=Propose, gray=Observe. Some rows have an "[Auto ✓]" pill on right meaning auto-approval-eligible. One row has a yellow "Manual review required" warning (demoted skill). One row has a "STALE 9d" amber pill. Inline ✓/✗ action buttons appear on row hover. Information-dense, dark theme primary, theme-swappable. 13px base font, Inter, Lucide icons, shadcn primitives. Peer references: Linear inbox, GitHub notifications, Vercel deployments. No hero illustration, no large "approve" buttons.

## Visual references

- GitHub Notifications inbox (the density and tab structure)
- Linear inbox (the row affordances and bulk select pattern)
- The current `ApprovalsPage.tsx` — has the data but no actions; this brief replaces it

## What success looks like

Sam opens `/approvals` at 9:00 Monday. 12 rows. He sees "Approve eligible (3)" at the top, clicks it, confirms — 3 cleared in 8 seconds. He scans the remaining 9. The ADR Quorum row (5d old) catches his eye; he clicks into the drawer, sees the ADR is well-documented, approves. The Schema Migration PR has the demoted-skill warning; he opens the drawer, scrutinizes the diff, decides to reject with reason "Needs review by merge eng before merge". 11 cleared in 12 minutes. He's in his 9:30 meeting on time.
