# H5 Brief — `/metrics` Cross-Project DORA

**References:** `docs/ux/DESIGN.md`, `docs/ux/sample-data.md`, `docs/ux/moments.md` (Moment 5), `docs/ux/personas.md` (Priya + Jordan).

## Anchor (read this first)

DORA dashboards are everywhere. Per-project DORA is table stakes — every modern dev tool has it. **Coznt's differentiating move is cross-project causal attribution:** when portfolio change-failure rate spikes 4% week-over-week, this screen doesn't just show the aggregate going up — it tells you *which project's regression is driving the portfolio number*, and *which skill auto-approved the deploys that caused it*.

The live storyline in the fixture: portfolio CFR went 8% → 11% over the last month. That regression is **entirely** driven by `auth-service-migration`, where CFR went 8% → 18%, driven by 3 auto-merges by `schema-migration-reviewer` over 14 days. The system caught it and demoted the skill. This screen is where Priya and Jordan see the attribution chain in a glance — and where Jordan can open an `incident` plan with the evidence pre-populated.

## Persona & primary action

- **User:** Priya (portfolio-level) + Jordan (cross-team SRE)
- **Primary action:** diagnose where a portfolio metric came from; attribute regressions causally
- **Secondary:** drill into a project's DORA; jump to the triggering deploys; open an incident plan

## Layout direction (resolved)

**Portfolio header → small multiples grid → attribution panel.** Top: 4 portfolio aggregate cards (the four DORA metrics) with WoW deltas. Middle: small-multiples grid — one row per metric × N columns per project. Bottom: an attribution panel that, when a regression is detected, surfaces the causal chain (project → deploys → skills involved).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Metrics — DORA · Portfolio                          Window: [30d ▾] [7d 90d]│
│                                                                              │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐              │
│ │ LEAD TIME    │ DEPLOY FREQ  │ CHANGE FAIL  │ MTTR         │              │
│ │ 4.8 days     │ 4.2 /wk      │ 11% ↑3pt    │ 2.3 hours    │              │
│ │ ↑ 0.6d MoM   │ ─ flat MoM   │ ⚠ regression │ ─ flat MoM   │              │
│ └──────────────┴──────────────┴──────────────┴──────────────┘              │
│                                                                              │
│ ───────────────────────────────────────────────────────────────────────────│
│ BY PROJECT                                                                  │
│                                                                              │
│              payments-api  data-warehouse  auth-service  kafka-pipeline    │
│ Lead time   3.4d  ───┘    —              5.7d  ─┐╱      —                  │
│ Deploy freq 6.2/w ─┐──    0              4.8/w ─┐─      0                  │
│ CFR         8%  ───┐──    —              ⚠ 18% ─┐╱     —                  │
│ MTTR        1.8h ─┐──     —              4.2h ─┐╱      —                  │
│                                                                              │
│ ───────────────────────────────────────────────────────────────────────────│
│ ATTRIBUTION                                                                 │
│                                                                              │
│ ⚠ Regression detected on CFR (portfolio)                                    │
│                                                                              │
│ Driver:  auth-service-migration  ·  CFR 8% → 18% over 14d                  │
│ Cause:   3 auto-merges by schema-migration-reviewer (now demoted Merge→Propose)│
│          • PR #432 schema-init  2026-05-02  → rollback 2026-05-03          │
│          • PR #438 user-table   2026-05-06  → rollback 2026-05-07          │
│          • PR #441 session-cookie 2026-05-08 → rollback 2026-05-10 (incident)│
│                                                                              │
│ Skill state:  Demoted Merge → Propose on 2026-05-10                        │
│                                                                              │
│ [Open incident plan]  [View skill detail]  [View affected project]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Components

1. **Portfolio header** — page title, window selector (7d / 30d / 90d, default 30d), refreshed timestamp top-right
2. **Aggregate cards (4)** — single row, four equal cards. Each: metric label (small caps), big number with unit, WoW or MoM delta with direction arrow, semantic color (regression = warning amber/red, improvement = green)
3. **Small-multiples grid** — sparkline matrix. Rows = metrics (lead time, deploy freq, CFR, MTTR). Columns = projects. Each cell: current value (top-right) + sparkline (full cell). Cells with no data show `—` not 0.
4. **Cell hover** → tooltip with full data point breakdown + delta
5. **Cell click** → navigate to the project's cockpit (H2), scrolled to its metrics section
6. **Attribution panel** — only renders when the system has detected a regression with high-confidence causal attribution. Components:
   - **Driver line** — which project drove the portfolio metric change
   - **Cause line** — which skill (and how many actions) contributed
   - **Bulleted timeline** of the specific deploys/rollbacks with dates
   - **Skill state** — current autonomy + any recent level changes tied to this attribution
   - **Action buttons** — open incident plan (pre-populated), view skill detail, view affected project
7. **Window selector** — segmented control (7d / 30d / 90d). Changes the time scope of all sparklines and aggregates.

## Sample data — use the metrics from `sample-data.md` exactly

- Portfolio: Lead time 4.8d (↑0.6d MoM), Deploy freq 4.2/wk (flat), **CFR 11% (↑3pt MoM — the regression)**, MTTR 2.3h (flat)
- Per project:
  - payments-api: 3.4d / 6.2/wk / 8% / 1.8h — healthy
  - data-warehouse-v2: no deploy data (still in Design phase) → all dashes
  - auth-service-migration: 5.7d / 4.8/wk / **18% ↑** / 4.2h — **the regression source**
  - kafka-pipeline-modernization: no data (Requirements phase)
- Attribution panel populated for the CFR regression:
  - Driver: auth-service-migration (8% → 18% over 14d)
  - Cause: 3 auto-merges by schema-migration-reviewer
  - The 3 specific PRs: #432 (5/2), #438 (5/6), #441 (5/8), each linked to its rollback
  - Skill state: demoted 5/10

## Interactions

- **Click cell** → project cockpit (H2)
- **Hover cell** → tooltip with full breakdown
- **Click "Open incident plan"** in attribution → navigates to `/plans/new?kind=incident&projectId=proj_auth&prefill=...` with the evidence pre-populated in the plan form
- **Click "View skill detail"** → `/skills/[id]` for schema-migration-reviewer
- **Click "View affected project"** → `/projects/proj_auth`
- **Change window selector** → all data re-fetches; sparklines and aggregates update; attribution recomputes (a 7d window may not show the same regression as 30d)
- **Click aggregate card** → expands the small-multiples grid below to focus on that metric only (other rows collapse)

## States

- **Loading:** skeleton grid matching the 4 metric rows × project columns
- **No DORA data anywhere:** "No DORA data yet." with a 1-line explanation ("DORA is computed from your deployment webhooks. [Set up webhooks →]") — links to `/integrations`
- **One project with no data:** that column shows `—` in every cell, no styling penalty, no warning. (Projects in early phases legitimately have no deploys.)
- **No regression detected:** attribution panel hidden, replaced by a small "No regressions detected in the last 30 days." muted line
- **Improvement detected:** attribution panel can also render the *positive* case — "Lead time improved on payments-api driven by 5 auto-approved doc-updater merges" — though this is lower-priority
- **Multiple regressions:** attribution panel shows them stacked, ranked by impact
- **Window selector mismatch:** if user picks 7d and that doesn't contain enough data for a metric, show "Insufficient data — try 30d or 90d" inline in the affected cell

## Trust signals (load-bearing)

1. **Causal attribution, not correlation.** The panel must distinguish "auto-merged by schema-migration-reviewer" (causal claim) from "happened during a period when schema-migration-reviewer was active" (correlation). Visual treatment: the bullet-list of specific PRs + their rollbacks is the evidence. No skill is blamed without named PRs.
2. **Skill state at time of action.** "Merge at time of merge → demoted on 2026-05-10." The temporal precision is the trust signal — autonomy isn't just current; it's historical.
3. **WoW / MoM deltas with magnitudes.** `↑3pt` not just `↑`. `↑0.6d` not just `↑`. Magnitudes prevent eyeballing-from-vibes.
4. **Project columns with no data show `—`, not 0.** Pretending no-data is zero would corrupt the aggregate's meaning.
5. **Aggregates re-compute when window changes.** No stale numbers. The window selector is authoritative.
6. **Cross-team comparison is glanceable.** The small multiples grid lets Jordan spot which project is the outlier in 2 seconds.

## Anti-patterns

- ❌ Single hero chart for "portfolio CFR" with no per-project breakdown — the cross-project causal-attribution moment requires the grid
- ❌ Donut chart or pie chart anywhere
- ❌ Stacked area chart implying additive — DORA metrics aren't additive across projects
- ❌ "Healthy / Unhealthy" traffic-light without numeric values — Priya needs the numbers
- ❌ Attribution shown as a single sentence summary — show the bullet list of specific deploys/rollbacks
- ❌ Hiding the attribution panel by default — when a regression exists, the panel is *the point of the page*
- ❌ Auto-refresh with animation — DORA changes slowly; instant refresh on window change is enough
- ❌ Comparison-to-DORA-benchmarks ("Elite / High / Medium / Low") on every metric — these are noisy and culturally varied; if shown, make them optional

## Variant exploration prompt for Lovable

> Generate 3 variants of a DORA metrics dashboard for an SDLC governance platform with causal attribution. Three sections vertically. Section 1: 4 portfolio aggregate cards in a row — Lead Time 4.8 days (↑0.6d MoM), Deploy Freq 4.2/wk (flat), Change Failure Rate 11% (↑3pt MoM, flagged as regression), MTTR 2.3 hours (flat). Window selector top-right (7d/30d/90d, 30d selected). Section 2: a small-multiples grid — 4 rows of metrics × 4 columns of projects (payments-api, data-warehouse-v2, auth-service-migration, kafka-pipeline-modernization). Each cell: current value + sparkline. Two of the four projects have no data (—). auth-service-migration cells show the regression visually. Section 3: an attribution panel triggered by the CFR regression. Header "⚠ Regression detected on CFR (portfolio)". Driver: auth-service-migration CFR 8% → 18%. Cause: 3 auto-merges by schema-migration-reviewer. List the 3 specific PRs with dates and rollback timestamps. Skill state: demoted Merge → Propose on 5/10. Action buttons: "Open incident plan", "View skill detail", "View affected project". Information-dense, dark theme primary, theme-swappable. 13px base, Inter, Lucide. No donut/pie charts. Peer references: DataDog, Grafana, Linear cycles.

## Visual references

- DataDog dashboards (small multiples done right)
- Linear cycles page (information density + comparison rows)
- Grafana (the panel-density aesthetic)
- The current `MetricsPage.tsx` — has the 4 + 4 metric types but per-project only, and uses div-bars instead of real sparklines

## What success looks like

Wednesday morning. CFR-alert email fires. Priya opens `/metrics`. In 10 seconds: she sees portfolio CFR at 11% ↑3pt, the auth-service-migration column shows 18% with a downward sparkline, and the attribution panel below names the 3 specific PRs and the demoted skill. She forwards the page URL to her CISO with one sentence: "System caught it, demoted the skill, here's the trail." Jordan opens the same screen, clicks "Open incident plan" to start the formal postmortem. The metric regression became a *story with a culprit and a response* in under five minutes — instead of a three-day Slack thread.
