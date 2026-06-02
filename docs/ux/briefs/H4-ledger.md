# H4 Brief — `/skills` Autonomy Ledger

**References:** `docs/ux/DESIGN.md`, `docs/ux/moments.md` (Moment 4), `docs/ux/personas.md` (Priya).

## Anchor (read this first)

This is the screen the marketing one-pager points at: *"Skills earn the right to act through an autonomy ledger."* It's Priya's weekly check-in surface. She arrives Friday afternoon to absorb the trust direction across the portfolio. The moment is celebratory when a skill levels up — `doc-updater` was just promoted Merge → Lead on 2026-05-09 after a 30-day clean run across 4 projects. It's also unsentimental when a skill gets demoted — `schema-migration-reviewer` was demoted Merge → Propose on 2026-05-10 after a change-failure correlation on auth-service-migration.

The screen has *two emotional registers on the same surface*: celebration (promotions are visible and earned) and unsentimental judgement (demotions are equally visible). The visual treatment must hold both without flattening either.

This is the **buying-decision surface** for Priya. If this screen looks like a settings table, the product positioning collapses. The trust-earned thesis has to be physically apparent in 5 seconds.

## Persona & primary action

- **User:** Priya (weekly), with Sam + Jordan as secondary readers
- **Primary action:** scan portfolio-wide autonomy state, absorb the trust direction, drill into any anomaly
- **Secondary:** open a skill's detail (`/skills/[id]`); review a pending promotion; open the audit query (`/audit`)

## Layout direction (resolved)

**Three vertical sections, single column.** Top: events banner (the recent promotion/demotion story). Middle: cross-skill ledger table (one row per skill). Bottom: portfolio rollup of autonomy distribution.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Skills — Autonomy Ledger                              [Audit query →]       │
│                                                                              │
│ ───────────────────────────────────────────────────────────────────────────│
│ RECENT EVENTS (last 14 days)                                                │
│                                                                              │
│ ↑ doc-updater  ·  Merge → Lead  ·  2026-05-09  ·  3d ago             │
│   30-day clean run across 4 projects · 156✓ / 0↻ / 0⚡ · next review 7/8    │
│   [View receipts →]                                                          │
│                                                                              │
│ ↓ schema-migration-reviewer  ·  Merge → Propose  ·  2026-05-10  ·  2d ago  │
│   ⚡ CFR correlation incident on auth-service-migration                     │
│   3 auto-merges contributed to CFR 8% → 18% spike · [View incident →]      │
│                                                                              │
│ ───────────────────────────────────────────────────────────────────────────│
│ ALL SKILLS                                                                  │
│                                                                              │
│ Skill                          Level       30-day stats     Projects   Trend│
│ ────────────────────────────────────────────────────────────────────────────│
│ doc-updater                    [Lead] 156✓ /0↻ /0⚡    4         ─┐─┘ │
│   "Auto-approve docs-only changes"  set 5/9 · review 7/8                    │
│                                                                              │
│ api-contract-checker           [Merge]    92✓ /1↻ /0⚡     3         ───  │
│   "Auto-approve schema-only changes" set 2/4 · review 5/31                  │
│                                                                              │
│ frontend-test-author           [Merge]    47✓ /2↻ /0⚡     2         ─┐─  │
│   "Auto-approve <50 LOC + 80% coverage" set 4/18 · review 6/4              │
│                                                                              │
│ schema-migration-reviewer  ⚠   [Propose]    18✓ /4↻ /1⚡     2         ─┐╲  │
│   "Manual review only" set 5/10 · next review 6/10                          │
│                                                                              │
│ security-scan-runner           [Observe]    12✓ /8↻ /0⚡     2         ╱╲╱  │
│   "Manual review only" set 4/30 · review 5/19                               │
│   ⏳ Pending promotion review on 5/19 — blocked: rollback rate 40%          │
│                                                                              │
│ ───────────────────────────────────────────────────────────────────────────│
│ PORTFOLIO AUTONOMY                                                          │
│                                                                              │
│ ▓ 1 Lead · 2 Merge · 1 Propose · 1 Observe · 0 disabled (5 total)      │
│ Auto-approval coverage: 47% of approvals over 30d  ↑ 12pt MoM              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

1. **Page header** — "Skills — Autonomy Ledger" + an "Audit query →" link top-right that goes to `/audit`
2. **Recent events banner section** — emphasis container at top. Each event:
   - **Promotion**: ↑ arrow icon in green, level change with both pills visible, date, age, 30-day stats inline, "View receipts →" link
   - **Demotion**: ↓ arrow icon in red, level change, date, age, **the triggering reason** (incident, correlation), link to the incident plan
   - Pending-review events: ⏳ amber, date of upcoming review, blocking reason if any
3. **All-skills table** — dense rows (40px each because of the secondary description line). Columns: name + description line, autonomy pill (level), 30-day stats (compact ✓/↻/⚡ format), project count with a project-list popover, **30-day trend sparkline** of success-rate
4. **Autonomy pill** — see DESIGN.md trust palette: Lead violet, Merge green, Propose blue, Observe gray
5. **Stats microformat** — `156✓ /0↻ /0⚡` with tabular-nums. Each value clickable to filter the related list of outcomes.
6. **Trend sparkline** — success rate over 30 days, 60×16. Direction: up = green, down = red, flat = muted.
7. **Pending review chip** — amber `⏳ pending review 5/19` inline at the row, with a blocking reason expansion
8. **Portfolio autonomy footer** — small horizontal bar showing the distribution (1 Lead · 2 Merge · etc) + auto-approval coverage stat with MoM delta

## Interactions

- **Click skill row** → navigate to `/skills/[id]` detail page
- **Click "View receipts →"** on a promotion event → opens drawer with the 30-day outcome list that earned the promotion (linked to actual PRs/plans)
- **Click "View incident →"** on a demotion event → navigates to the linked incident plan
- **Click 30-day stat number** → opens a drawer filtered to those outcomes (the 156 successes, the 4 rollbacks, etc.)
- **Hover sparkline** → tooltip with current value + WoW delta + last-data-point timestamp
- **Click project count** → popover listing which projects the skill runs on; each is a link to that project's cockpit
- **Click "Audit query →"** → navigate to `/audit`
- **Hover autonomy pill** → tooltip with the level's permission description ("Merge: auto-approves <50 LOC + 80% coverage on schema-only changes")
- **Right-click row** → context menu (Open in new tab, Disable skill, View invocations, Copy slug)

## States

- **Loading:** skeleton matching the three-section structure
- **No skills configured yet:** events section hidden, table empty with "No skills configured. Skills are configured in `coznt.yaml` or via API." link
- **No recent events:** events banner section collapses to a one-line "No autonomy changes in the last 14 days" muted line — never disappears entirely (presence of "no events" is itself information)
- **Single skill org:** still rendered as a table — consistency
- **Demotion-only week:** demotion events render at full prominence; no fake balance
- **Pending review at threshold:** amber `[Pending review 5/19]` pill at the row; banner gets a "[Approve to promote →]" CTA action for org-admins
- **Disabled skill:** appears at bottom of table, muted, with "Disabled" pill and an "Enable" action

## Trust signals (load-bearing)

1. **Promotions and demotions have distinct visual treatments.** Promotion = ↑ green, demotion = ↓ red. No symmetry-for-its-own-sake. A bad week should look like a bad week.
2. **Every level change names its reason.** Promotion: "30-day clean run across 4 projects, threshold met." Demotion: "CFR correlation incident on auth-service-migration." No bare "promoted" / "demoted" status.
3. **Stats are queryable, not aggregated-only.** Clicking `156✓` opens the underlying list. Trust requires inspection.
4. **The next-review date is visible.** Trust is observable and time-bounded — the system isn't claiming permanent trust; it's claiming "this far, this confidently, until {date}."
5. **Auto-approval coverage MoM delta** — the portfolio rollup at the bottom is Priya's KPI proxy. "47%, ↑12pt MoM" tells her the system is earning trust faster than human review demand grows.
6. **Disabled skill is visible** — disabling something is a trust statement worth seeing.

## Anti-patterns

- ❌ Promotions and demotions in the same color (e.g., both blue "level change") — destroys the trust narrative
- ❌ Hiding the stats behind a tooltip — they're the receipts, they must be on the surface
- ❌ A "delete skill" action without an "are you sure?" — autonomy data is irreversible
- ❌ Auto-approval coverage shown as a donut chart — use a single number with a delta
- ❌ "Promote skill" as a button that's always visible — only show it when threshold is met (system gates the UI based on policy)
- ❌ Glassmorphism / gradient cards for the recent events section — keep the audit-grade plain aesthetic
- ❌ Treating "Lead" as a top-tier prestige badge with sparkles or glow — earned is enough; don't gamify

## Variant exploration prompt for Lovable

> Generate 3 variants of a skill autonomy ledger page for an SDLC governance platform. Three vertical sections, single column. Top: "Recent events (last 14 days)" with two events visible. Event 1 (promotion): ↑ green arrow, "doc-updater · Merge → Lead · 2026-05-09 · 3d ago", supporting line "30-day clean run across 4 projects · 156✓ / 0↻ / 0⚡ · next review 7/8", "View receipts →" link. Event 2 (demotion): ↓ red arrow, "schema-migration-reviewer · Merge → Propose · 2026-05-10 · 2d ago", supporting line with the incident reason "⚡ CFR correlation incident on auth-service-migration · 3 auto-merges contributed to CFR 8% → 18% spike", "View incident →" link. Middle: dense table of 5 skills with autonomy pill (violet=Lead, green=Merge, blue=Propose, gray=Observe), 30-day stats `Nsuccess✓/Nrollback↻/Nincident⚡`, project count, success-rate sparkline (30 days). Bottom: portfolio rollup "1 Lead · 2 Merge · 1 Propose · 1 Observe · 0 disabled" + auto-approval coverage "47% ↑12pt MoM". Top-right "Audit query →" link. Information-dense, dark theme primary, theme-swappable. 13px base, Inter, Lucide. No hero illustration, no glow effects, no gamification.

## Visual references

- Marketing one-pager — the autonomy ledger is its hero promise
- DataDog SLOs page (mature trust signals + state changes)
- Linear cycles page (event timeline density)
- Existing `SkillsPage.tsx` — has the pill colors and naming right; everything else needs to be rebuilt

## What success looks like

Priya opens `/skills` Friday 4pm. In 5 seconds she sees: doc-updater earned Lead (good), schema-migration-reviewer lost Merge (concerning, but the system caught it before she had to). She drills into the demotion event, sees the incident attribution, opens the linked plan, confirms the system response was correct. Auto-approval coverage at 47% MoM ↑12pt is the line she'll quote in next week's exec review. She closes the tab confident — and ready to defend the trust posture to her CISO.
