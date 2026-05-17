# H1 Brief — `/projects` Portfolio View

**References:** `docs/ux/DESIGN.md`, `docs/ux/sample-data.md`, `docs/ux/moments.md` (Moment 1), `docs/ux/personas.md` (Sam).

## Anchor (read this first)

Coznt is an SDLC governance platform for small enterprise engineering teams (5-25 people) running multiple internal projects. This screen is **Sam's home page** — he's a player-coach Tech Lead managing 2-4 active projects simultaneously. Every Friday his skip-level pings: *"Quick status across all your projects before the leadership review on Monday?"* Today, answering that takes 3-4 hours of Jira + GitHub + Slack reconciliation. With coznt's portfolio view, it takes 90 seconds.

The screen's job: **scan-and-attribute in under two minutes.** Every claim — phase, gate state, deploy count, regression — is one click from the source of record. No coznt-only numbers. The cross-project view is *the* structural differentiator of coznt vs. every single-project tool.

## Persona & primary action

- **User:** Sam (see `personas.md`)
- **Primary action:** Scan 4 projects in 90s, identify what's blocking, drop the link into Slack
- **Secondary:** Drill into a project → its cockpit (H2); jump to an open approval → `/approvals` (H3); jump to a recent autonomy event → `/skills`

## Layout direction (resolved)

**Information-dense table-style rows, not card grids.** One row per project. Sparkline + status pills inline. At 4-15 projects (target range), this stays single-screen. The portfolio rollup strip lives **above** the table.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Portfolio  ·  Northwind Platform Engineering                    [+ New]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ ROLLUP STRIP (4 mini-stats, one row)                                        │
│  12 open approvals   18 deploys/wk   2 autonomy events ↑1 ↓1   CFR 11% ↑3pt│
├─────────────────────────────────────────────────────────────────────────────┤
│ TABLE                                                                       │
│  Project           Phase     Gates       Open  Lead   Deploys  CFR    Actions│
│  ──────────────────────────────────────────────────────────────────────────│
│  ● Internal Pay…   DEV       4/4 ●●●●    3     3.4d   ───┐╱   8%   →     │
│  ● Data Warehou…   DESIGN    2/4 ●●○○    5     —      ───    —     →     │
│  ⚠ Auth Service…   TESTING   3/4 ●●●○    2     5.7d   ─┐─┘   18%↑  →     │
│  ● Kafka Pipeli…   REQ       1/3 ●○○     2     —      ───    —     →     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components (use these, in order of importance)

1. **Portfolio rollup strip** (top) — four inline stats: open approvals, deploys this week, autonomy events with up/down arrows, portfolio CFR with WoW delta. Each is clickable to filter or drill.
2. **Project rows** — one per project, density 36px row height (slightly above compact-default so the sparkline reads)
3. **Sparkline column** — change-failure rate over 30d, inline, 60×16px
4. **Status indicator** — 8px dot leading the row: green = healthy, amber = pending action, red = regression/blocked
5. **Gate pill cluster** — `3/4 ●●●○` showing N passed / total + small dots for visual gate state. Hover for breakdown.
6. **Phase badge** — small pill with phase name in the trust-signal palette
7. **Action chevron** — right-aligned, links to the project cockpit (H2)

Use shadcn `Table`, `Badge`, `Button` (size sm), Lucide icons. Build the sparkline as a thin React component (no chart library — single SVG path).

## Sample data

Use the 4 projects from `sample-data.md` exactly:
1. **Internal Payments API** — DEVELOPMENT, 4/4 gates ●●●●, healthy
2. **Data Warehouse v2** — DESIGN, 2/4 gates ●●○○, 5 open approvals (the ADR quorum bottleneck)
3. **Auth Service Migration** — TESTING, 3/4 gates ●●●○, **warning state** (CFR 18% — the regression)
4. **Kafka Pipeline Modernization** — REQUIREMENTS, 1/3 gates ●○○, early-stage

Rollup strip values: 12 open approvals · 18 deploys/wk · ↑1 ↓1 (doc-updater promoted, schema-migration-reviewer demoted) · CFR 11% ↑3pt WoW.

## Interactions

- **Click row body** → navigate to `/projects/[id]` (H2)
- **Click "X open"** → navigate to `/approvals?project=<id>` (H3, pre-filtered)
- **Click sparkline** → navigate to `/metrics?project=<id>` (H5)
- **Click rollup stat** → corresponding deep view
- **Hover gate pill cluster** → tooltip listing each gate's state + named unmet criterion (e.g., "ADR Quorum: failed — ADR-0014 pending @rohan since Tuesday")
- **Hover sparkline** → tooltip with current value + WoW delta
- **Right-click row** → context menu (Open in new tab, Copy link, Open GitHub repo, Open Jira project)
- Sorting: default by status urgency (warnings first), then phase, then last activity

## States

- **Loading:** skeleton with 4 row placeholders (matches expected project count)
- **Empty:** "No projects yet. Create your first project to get started." + `[+ New project]` button. No illustration.
- **30+ projects:** add a top filter bar (by team, by phase, by owner). Don't paginate — virtualize the table.
- **Stale project (no activity 60d+):** row dimmed to `--muted-foreground`, "stale" badge at right
- **Broken integration:** small warning chip next to the affected metric column with tooltip explaining what's not syncing. Never hide the row — Sam still needs to see it exists.
- **Single project (n=1):** still render as a table row, not a hero card. Consistency over visual flourish.

## Trust signals (load-bearing)

1. **Sparkline source link.** Every sparkline tooltip ends with "→ source: GitHub deployments" linked to the actual GitHub deploys list. Click it and you're in the source of record.
2. **Gate cluster source link.** Each gate dot in the hover tooltip names its unmet criterion AND its source (e.g., "ADR-0014 — link to plan").
3. **Rollup deltas show direction AND value.** `↑3pt` not just `↑` — make the magnitude visible.
4. **No coznt-derived numbers.** Lead time is from Git timestamps. Deploy count is from GitHub deployments API. CFR is from incident plans + deploys. Every column header tooltip names its source.

## Anti-patterns (do NOT do these)

- ❌ Card grid with 2-3 projects per row (low density, betrays Sam's "show me everything" need)
- ❌ Hero header band with project count and a marketing-style tagline
- ❌ Donut charts or pie charts for the rollup — use single-number stats with deltas
- ❌ "Average lead time" headline number with no per-project visibility
- ❌ Sparkline with axes, gridlines, or animated draw-in
- ❌ Empty state with a multi-step "Welcome to coznt!" wizard
- ❌ Rounded-corner shadows on rows (use 1px borders)
- ❌ Stale projects hidden (Sam must see them — they may be the issue)

## Variant exploration prompt for Lovable

> Generate 3 variants of a portfolio-view dashboard for an SDLC governance platform. Information-dense table layout, dark theme primary (CSS variables, theme-swappable). Rows for 4 internal engineering projects (Internal Payments API, Data Warehouse v2, Auth Service Migration, Kafka Pipeline Modernization). Each row: status dot, project name, phase pill (REQUIREMENTS/DESIGN/DEVELOPMENT/TESTING), gate progress (X/Y with small dots), open approvals count, lead time (days), 30-day change-failure sparkline (inline 60x16px), CFR percentage with WoW delta arrow, action chevron. Above the table, a single rollup strip with: 12 open approvals, 18 deploys/week, 2 autonomy events (↑1 promotion ↓1 demotion), CFR 11% ↑3pt. Auth Service Migration must be visually flagged as a warning (red dot, CFR 18%↑). Use Inter font, 13px base, shadcn Table primitive, Lucide icons. No card grids, no hero illustrations, no shadows on rows. 36px row height. Peer references: Linear, Vercel dashboard, Datadog.

## Visual references

- **`docs/ux/refs/lovable-h1-portfolio.md`** — prose description of the validated Lovable mockup. Read this first. This is the canonical reference.
- **`docs/ux/refs/lovable-h1-portfolio.png`** — the actual mockup PNG. Drop manually if missing (see `docs/ux/refs/README.md`).
- **`docs/ux/refs/marketing-one-pager.png`** — brand-direction anchor (dark/teal/precise). Drop manually if missing.
- Linear's projects list (peer aesthetic, public)
- Vercel's project dashboard (peer density, public)

## What success looks like

Sam opens the screen at 4pm Friday. By 4:01 he's drafted a 4-bullet Slack message to his skip-level, each bullet linked to a coznt URL. No tab-switching to Jira/GitHub. The Auth Service regression is visually impossible to miss. He knows which project to dig into first.
