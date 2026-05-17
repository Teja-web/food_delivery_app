# Lovable H1 Portfolio Mockup — Visual Description

**Date generated:** 2026-05-12
**Source:** Lovable, prompted from `docs/ux/briefs/H1-portfolio.md` + the marketing one-pager as visual anchor
**Companion file:** `lovable-h1-portfolio.png` (drop here manually — see `README.md` in this directory)
**Status:** Validated direction. Used as the visual reference for Phase 3 of `docs/ux/build-plan.md`.

This markdown is the canonical visual description. If the PNG is missing or stale, this is the source of truth a new session works from.

---

## Overall composition

- **Dark theme.** Near-black background (deep navy-tinted, not pure black). Off-white foreground.
- **Two-column page layout:** ~220px sidebar on the left, main pane fills the rest.
- **Single screen, no scroll** for the 4-project fixture. Full-width main pane with comfortable padding.

## Sidebar (left column)

- **Brand block at top:** lowercase `coznt` wordmark, with a small monospace `v0.1` chip aligned to its right. Subtle horizontal rule under the brand.
- **Nav groups with eyebrow-style labels** (uppercase 11px, tracked, muted-foreground):
  - `PLAN` — Projects (active, filled accent bg), Plans, Gates
  - `OPERATE` — Approvals, Skills
  - `CONNECT` — Adapters
  - `MEASURE` — DORA, Audit log
  - `ADMIN` — Settings
- **Each nav item:** Lucide icon (14-16px) + label, ~32px row height, full-width clickable, hover state subtle bg.
- **User block at bottom-left:** avatar circle with initials `SR` (teal-tinted background), `Sam Reyes` on top line, `Tech Lead · Northwind` on a smaller second line.

## Main pane

### Page header (top strip)

- **Breadcrumb on the left:** `Portfolio / Northwind Platform Engineering`. The "Northwind Platform Engineering" part is white-weight; "Portfolio /" is muted.
- **Primary action on the right:** `[+ New project]` button in teal outline style.

### Rollup strip (under the header)

- **Single horizontal row, no card chrome.** Just four stat clusters spaced across the width.
- **Each cluster:** large number (white, bold, ~24-28px) + small label (muted, smaller).
- **The four:**
  1. `12` open approvals
  2. `18` deploys / wk
  3. `2` autonomy events — with `↑1` (green up arrow) and `↓1` (red down arrow) immediately after
  4. `11%` CFR (portfolio) — with `↑ 3pt WoW` in red trend color

### Table (the body)

- **Column headers in small caps:** `PROJECT · PHASE · GATES · OPEN · LEAD · DEPLOYS · CFR (30D)`.
- **No card chrome, no row borders other than subtle horizontal hairlines.** Density-first.
- **Row height ~40-44px.** Comfortable but compact.
- **One row per project (4 total):**

| Status dot | Project name + key | Phase pill | Gates | Open | Lead | Deploys | CFR (30d) | Action |
|:-:|---|---|---|---|---|---|---|:-:|
| 🔴 | `Auth Service Migration  [ASM]` + `⚠ regression` chip | `TEST` (amber bg) | `3/4 ●●●●` | `2` | `5.7d` | `18` | red sparkline trending up + `18% ↑6pt` | `›` |
| 🟡 | `Data Warehouse v2  [DW2]` | `DESIGN` (violet bg) | `1/4 ●●○○` | `5` | `—` | `—` | `— —` | `›` |
| 🟢 | `Internal Payments API  [IPA]` | `DEV` (green bg) | `4/4 ●●●●` | `3` | `3.4d` | `42` | green sparkline trending down + `8% ↓1pt` | `›` |
| 🟢 | `Kafka Pipeline Modernization  [KPM]` | `REQ` (teal bg) | `1/3 ●○○` | `2` | `—` | `—` | `— —` | `›` |

- **Status dot** is the leading visual on each row: 8px filled circle. Red = warning/regression, amber = pending action, green = healthy.
- **Project name** is white-weight; the `[XXX]` short-key is JetBrains Mono in muted-foreground.
- **The `⚠ regression` chip** on Auth Service Migration is red with a warning triangle icon and "regression" label. Small, sits next to the project name.
- **Phase pills** are filled-background pills with the phase name in 3-4 letters caps. Each phase has its own hue (TEST amber, DESIGN violet, DEV green, REQ teal). Subtle saturation — not screaming.
- **Gates cluster** is the fraction `3/4` followed by 4 small dots showing the fill state (filled=passed, hollow=pending).
- **Sparkline** is a single thin line spanning maybe 80px width × 18-20px tall. Last point ends in a dot. Red = `--trend-down` for regression (going up is bad for CFR), green = `--trend-up` for improvement.
- **CFR delta indicator** sits right after the sparkline: `18% ↑6pt` (red), `8% ↓1pt` (green). Arrow + magnitude.
- **Action chevron `›`** at the rightmost edge of each row, muted color.

### Footer strip (below the table)

- **Single line of muted text:** `4 projects · Sources: GitHub deployments, Jira approvals, coznt audit log · last sync 2m ago`.
- This is the trust signal — every claim on the screen traces back to a named source.

## What's load-bearing about this design

1. **Information density.** ~9 columns of data per row, all readable at a glance. No card padding eating space.
2. **Status dot precedes the project name.** This is the first thing Sam's eye lands on. Color carries the urgency — phase pill is secondary.
3. **`⚠ regression` chip is explicit.** The system being honest about a bad state is itself a positive trust signal.
4. **Missing data renders as `—`.** Never `0`. Data Warehouse and Kafka in pre-deploy phases gracefully show dashes.
5. **Rollup deltas show magnitude.** `↑1`, `↓1`, `↑3pt`, `↑6pt`, `↓1pt`. Not just direction.
6. **Sources line is the audit posture made visible.** This is what differentiates coznt from a generic admin panel.
7. **Sidebar grouping (PLAN / OPERATE / CONNECT / MEASURE / ADMIN).** Reads like Linear/Vercel/Datadog, not like a legacy admin tree.

## Known refinements for the implementation

Captured in the post-mockup review in this conversation:

- **Internal Payments API "42" deploys is too high** for the 30-day fixture (should be ~25-27). Fix in the data layer, not the visual.
- **Phase pill colors are slightly over-saturated.** Sam scans for *problems*, not for *phase*. Status dot already carries urgency. Tone down phase pill saturation by ~15% in implementation.
- **The autonomy event story (`↑1 ↓1`) could be more legible with project attribution.** Consider a small inline chip on the auth-service row: `↓ schema-migration-reviewer (related)`. Closes the causal loop right on H1.

## What this does NOT show

- Hover/tooltip states (specified in `H1-portfolio.md`)
- Empty state (specified)
- 30+ projects state (specified)
- Light theme (must look right in both per `DESIGN.md`)
- Stale-project styling (specified)

The mockup validates the steady state. Edge states still come from the brief.
