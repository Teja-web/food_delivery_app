# Coznt UI Build Plan

A self-contained execution plan for implementing the five hero screens and the MCP DX track. Written so a new Claude Code session — with zero prior conversation context — can pick this up and ship.

## How to use this doc

1. Read the **Required reading** list in order. Stop only when you've internalized the personas, moments, screens, design system, and per-screen briefs.
2. Read this build plan top to bottom once.
3. Work the phases in order. Don't skip Phase 0 (foundation). Don't reorder phases unless you have a written reason.
4. Each phase has explicit deliverables, verification steps, and a "do not do" list.
5. After each phase, update `## Progress log` at the bottom of this file.

---

## Required reading (in order)

| # | File | Purpose |
|---|---|---|
| 1 | `/Users/ram/Projects/coznt/CLAUDE.md` | Project conventions — Drizzle/Zod two-source rule, page-data pattern, CRUD factory, rules engine |
| 2 | `docs/ux/methodology.md` | The 5 design tests (a-e). Anything that doesn't serve them does NOT get built. |
| 3 | `docs/ux/personas.md` | 4 v1 personas (Sam, Devin, Jordan, Priya) + persona-to-surface map |
| 4 | `docs/ux/moments.md` | 7 moments. Every screen serves one or more named moment. |
| 5 | `docs/ux/screens.md` | 5 hero screens, 7 functional, 3 stock. 15 total variant explorations (already validated for H1). |
| 6 | `docs/ux/DESIGN.md` | Design system source of truth — color tokens, type, density, trust-signal palette |
| 7 | `docs/ux/sample-data.md` | Cross-domain fixture with the live storyline (doc-updater promotion, schema-migration-reviewer demotion, auth-service CFR regression) |
| 8 | `docs/ux/briefs/H1-portfolio.md` | The first screen to build. Validated by Lovable mockup. |
| 9-13 | `docs/ux/briefs/H2-cockpit.md` through `H5-metrics.md`, `DX-mcp-context.md` | Read each as you start that phase. |
| 14 | `docs/architecture.md` | Vision + plan-driven SDLC model + 6 plan kinds |
| 15 | `docs/borrowings-from-ai-sdlc-framework.md` | What's in v1, what's deferred. Crucial for not re-adding deferred work. |

## Reference codebases (for UI patterns only — do NOT copy verbatim)

- **`/Users/ram/Projects/tanznt`** — the prior recruit-side product (formerly at `~/Projects/recruit`). Worth mining:
  - `tanznt/src/app/recruit/` — recruiter dashboard with `today/`, `insights/`, `settings/`, `pools/`, `assessments/`. Layout pattern: route group with shared shell.
  - `tanznt/src/app/(portal)/(protected)/dashboard/dashboard-client.tsx` — dashboard composition pattern
  - `tanznt/src/components/portal/eyebrow-heading.tsx` — small-caps section labels
  - `tanznt/src/components/portal/stat-tile.tsx` — single-stat tile pattern (useful for H1 rollup strip and H5 aggregates)
  - `tanznt/src/components/portal/role-tab-nav.tsx` — tab nav pattern
  - `tanznt/src/components/tours/tour-shell.tsx` — interaction shell pattern
  - `tanznt/src/components/portal/talent-radar.tsx` — data-viz pattern (radar chart)
  - **DO NOT** copy tanznt's color/typography — coznt already has DM Sans + Bricolage Grotesque + JetBrains Mono in `globals.css`, and DESIGN.md sets the visual direction
  - **DO NOT** import tanznt code directly. Mine for patterns, write fresh.

- **Lovable validated H1 mockup** — referenced visually in the conversation that produced this plan; the key takeaways are codified into `docs/ux/briefs/H1-portfolio.md` and the anti-patterns list below.

- **`/Users/ram/Projects/coznt`** — what's already shipped:
  - Tailwind v4 with `@theme inline` syntax in `src/app/globals.css`
  - Comprehensive CSS variables already defined (background/foreground, sidebar tokens, chart-1 through chart-5, success/warning/info/destructive, popover, card, etc.)
  - 9 shadcn primitives: Card, Button, Dialog, DropdownMenu, Avatar, Input, Label, Select, Textarea
  - 3 fonts loaded: DM Sans (body), Bricolage Grotesque (display), JetBrains Mono (mono)
  - Light theme is current default. **Phase 0 will flip to dark default with light available.**
  - Existing screens (under `src/app/(app)/`): projects, plans, skills, approvals, rules, metrics, api-keys, auth/* — all functional but visually default-shadcn-neutral

## What is NOT in scope for this plan

- Marketing landing page (`src/app/page.tsx`)
- Marcus's v2 audit-export UI (kept as forward design intent in `personas.md` but not built)
- Mobile responsive — desktop-first for v1
- Web-side plan editor — Devin authors plans in Cursor; web is viewer-only
- Three-reviewer cross-harness pattern (explicitly deferred per `borrowings-from-ai-sdlc-framework.md`)
- DSSE attestation envelopes (deferred)
- CLI surface (deferred)
- Any feature not present in `docs/ux/screens.md`

---

## Milestone alignment (added 2026-05-12)

`docs/architecture.md` defines five milestones A–E, each gated on the autonomy-with-observability loop being demonstrably closed at that scope. This UI build plan is one track inside that framing. The mapping below tells you which UI phase ships against which milestone, and which runtime prerequisites have to land first.

| Milestone | Loop scope | Runtime prerequisite (not in this doc) | UI phases that ship here |
|---|---|---|---|
| **A** | One project, Mode 1 (ledger from non-AI signal) | Worker drains pgmq; deterministic outcome assessors in `src/domain/outcomes.ts` write `skill_outcomes` from PR-merge / deploy-success / gate-pass; schema deltas already landed (`skill_outcomes.projectId`, `skill_autonomy` rekeyed by `(skillId, projectId)`). | **Phase 6** (H4 Skills ledger — spine demo, per-project view by default) |
| **B** | Portfolio + audit-grade visibility across projects | Same worker covering N projects; metrics rollups. | **Phase 3** (H1 portfolio), **Phase 4** (H2 cockpit), **Phase 7** (H5 cross-project DORA), `/audit` (functional screen — needs to be promoted from screens.md) |
| **C** | First real AI agent joins one project (Mode 2 begins) | One agent definition in `src/automations/agents/definitions/`; PreToolUse/PostToolUse endpoints. | None — Milestone C is mostly runtime. Skills ledger gains "AI signal" rows. |
| **D** | Agent dispatch gate + approvals integration | Autonomy threshold check on `/api/v1/skills/:id/invoke`; plugin telemetry endpoint. | **Phase 5** (H3 approvals inbox — pre-agent in B, agent-aware in D) |
| **E** | Devin's IDE input surface | MCP context endpoint live, plugin packaged. | **Phase 8** (DX track — DEFERRED until Milestones A–B are real) |

Phases 0–2 (foundation tokens, primitives, app shell) are infrastructure for all milestones. Phase 9 (polish) cuts across the lot.

**What this changes operationally:**

- **Phase 6 is now the spine demo, not Phase 3.** The H4 skills ledger is the screen that *proves* the loop is real. Build it per-project from day one (do not ship the org-wide-only view as the headline).
- **Phase 8 is deferred to Milestone E.** Cursor MCP onboarding is Devin's input surface; useful, not load-bearing. Don't burn variant-exploration budget on it before the loop runs end-to-end.
- **Audit screen is missing from this plan.** `/audit` is listed as a "functional screen" in `screens.md` but isn't a numbered phase here. It belongs in Milestone B. Add as Phase 7b (or renumber).
- **Phase 3 (H1 portfolio) depends on Milestone A having real data.** Before Milestone A's worker + outcome assessors run, the portfolio view runs on fixture data only. That's fine for visual variant exploration; not fine for a customer demo.

---

## Phase 0 — Foundation tokens

**Goal:** make the dark theme the default, add trust-signal tokens, add motion tokens. Single-file additive edit. Lowest risk.

### Deliverables

- Edit `src/app/globals.css`:
  - Move current `:root` body to `[data-theme="light"]` selector
  - Add new `:root` (and also `[data-theme="dark"]`) with dark theme tokens — match the marketing one-pager (background ≈ `oklch(0.18 0.02 250)`, foreground ≈ `oklch(0.96 0.005 250)`, primary teal ≈ `oklch(0.74 0.14 175)`)
  - Add trust-signal tokens:
    - `--autonomy-intern`, `--autonomy-junior`, `--autonomy-senior`, `--autonomy-principal` (gray, blue, green, violet — match `SkillsPage.tsx` line ~50)
    - `--state-pending`, `--state-passed`, `--state-failed`, `--state-skipped` (amber, green, red, muted)
    - `--verdict-success`, `--verdict-rollback`, `--verdict-incident` (green, orange, red)
    - `--severity-critical/high/medium/low`
    - `--trend-up`, `--trend-down`, `--trend-flat` (green, red, muted)
  - Add motion tokens: `--motion-instant: 0ms`, `--motion-micro: 75ms`, `--motion-short: 150ms`, `--motion-medium: 300ms`
  - Each token must have a dark *and* light value (semantic, not literal)
- Add a `data-theme` attribute toggle. Default to `dark` on `<html>` in `src/app/layout.tsx`.
- Keep all existing variables and fonts. DESIGN.md proposed Inter but coznt's DM Sans is better — keep DM Sans as the UI font.

### Verification

- `pnpm dev` shows the app in dark theme.
- All existing screens (projects, plans, approvals, etc.) still render without broken components (functional, not pretty — visual cleanup happens in later phases).
- Toggle `data-theme="light"` on `<html>` in DevTools — light theme renders with no regressions.
- Run `pnpm typecheck` — no TS errors. CSS variables are unscoped so types are unaffected.

### Do NOT

- ❌ Rip out the existing CSS variables and start fresh. Add to them.
- ❌ Replace DM Sans with Inter (DESIGN.md was written before knowing what was already in `globals.css`). DM Sans is better.
- ❌ Hardcode hex/rgb anywhere. Every color goes through a CSS variable.
- ❌ Touch any component files in this phase. Foundation only.
- ❌ Commit before verification passes.

### Effort estimate

15-25 min.

---

## Phase 1 — Install shadcn primitives, then domain composites

**Rule (load-bearing):** install standard shadcn components via the CLI *before* writing anything. Only build custom code for domain-specific composites that shadcn doesn't have (autonomy pills, gate dots, etc.) — and even those are thin wrappers around shadcn primitives.

### Step 1a — Install shadcn primitives we'll need

Run from project root:

```bash
pnpm dlx shadcn@latest add badge table tabs drawer sheet sidebar command chart popover tooltip skeleton sonner separator scroll-area collapsible
```

These cover the v1 surface: pills/chips (Badge), data tables (Table), inbox tabs (Tabs), entity detail drawers (Drawer/Sheet), the grouped nav (Sidebar), Cmd+K (Command), all data viz (Chart — Recharts-based), hover info (Popover, Tooltip), loading states (Skeleton), undo/toasts (Sonner), section separators, scroll containers, and collapsible regions.

Verify each landed in `src/components/ui/`. Run `pnpm typecheck` and `pnpm dev` — no regressions expected.

### Step 1b — Domain composites (thin wrappers, not from-scratch)

Create `src/components/trust/` with:

| File | Component | Wraps | Notes |
|---|---|---|---|
| `AutonomyPill.tsx` | `<AutonomyPill level="SENIOR" />` | shadcn `<Badge>` with `variant` prop | Maps autonomy level → `--autonomy-*` token via cva variants. Labels: Intern/Junior/Senior/Principal. |
| `LevelChange.tsx` | `<LevelChange from="SENIOR" to="PRINCIPAL" />` | Two `AutonomyPill`s + arrow | Used in H4. Direction implied = promotion (↑) or demotion (↓). |
| `GateDot.tsx` | `<GateDot state="passed" />` | Plain `<span>` (no shadcn equiv) | 8px filled dot in `--state-*` color. |
| `GateStateRow.tsx` | `<GateStateRow gate={gateObj} />` | Composite (GateDot + text + AttributionChip) | Used in H2. Status icon + name + named-unmet-criterion-with-assignee-and-age. |
| `StatusDot.tsx` | `<StatusDot status="healthy" />` | Plain `<span>` | 8px dot leading a row. Used in H1 portfolio. |
| `AttributionChip.tsx` | `<AttributionChip id="gh-pr-1234" href="..." />` | shadcn `<Badge variant="outline">` + `<Link>` | Mono-font ID with link icon. Used to make every claim source-traceable. |
| `SkillTrackRecord.tsx` | `<SkillTrackRecord level="SENIOR" stats={...} />` | Composite (AutonomyPill + mono stat block) | Inline badge: `[Senior · 92✓/1↻/0⚡ 30d]`. Used in H3 approvals. |
| `TrendIndicator.tsx` | `<TrendIndicator direction="up" value="3pt" tone="warning" />` | Plain inline with Lucide icon | Used in H1 rollup, H5 aggregates. |

Create `src/components/viz/` with:

| File | Component | Wraps | Notes |
|---|---|---|---|
| `Sparkline.tsx` | `<Sparkline points={number[]} direction="up\|down\|flat" />` | shadcn `<ChartContainer>` + Recharts `<LineChart>` + `<Line>` | Use the shadcn chart primitive with a minimal config — no axes, no gridlines, no tooltip on small instances. 60-80×16-24. Replace `src/app/(app)/metrics/Sparkline.tsx`. |
| `SmallMultiples.tsx` | `<SmallMultiples rows={[...]} cols={[...]} data={...} />` | Grid of `Sparkline`s + value labels | Used by H5. |

### Implementation rules

- Every domain composite is a thin wrapper. If the wrapper exceeds 60 LOC, push complexity back to the primitive props rather than re-implementing.
- Use **cva (class-variance-authority)** for variant management — same pattern shadcn uses.
- Use shadcn's `chart` (Recharts-based) for ALL data viz, including small sparklines. This overrides the earlier "no chart library" stance in `docs/ux/DESIGN.md`.
- Each composite must look right in both dark and light themes (test both).
- Lucide icons for everything iconographic.
- Use `cn()` from `@/lib/utils` for class merging.

### Verification

Create a playground page at `src/app/(app)/__playground/page.tsx` (add to `.gitignore` later, or remove before main):

- Renders every primitive in every state/variant
- Side-by-side under dark and light themes (use the data-theme attribute on a wrapper)
- Look at it in browser. Manually QA each one.

Run `pnpm typecheck` and `pnpm lint`.

### Do NOT

- ❌ Install Recharts/Chartjs/Victory directly. Use shadcn's `chart` primitive (which wraps Recharts but adds theming) instead.
- ❌ Reimplement Tabs, Dialog, Tooltip, Popover, Sheet, Drawer, Sidebar, Command, Toast, Skeleton, Table, Badge, Separator, ScrollArea — these are shadcn primitives we install via the CLI.
- ❌ Make any component a Class component.
- ❌ Build AutonomyPill from a raw `<span>` — wrap shadcn `<Badge>` with cva variants.
- ❌ Add stories or docs files — the playground page is the spec.
- ❌ Use `framer-motion`. Phase 0's CSS transition tokens are enough.

### Effort estimate

2-3 hours.

---

## Phase 2 — App shell with grouped sidebar

**Goal:** replace the current flat 7-link sidebar with the 4-group structure derived from persona journeys (revised 2026-05-12, see "IA: persona-journey grouping" below).

### Deliverables

Edit `src/app/(app)/layout.tsx` (or create `src/components/app-shell.tsx` and import it):

- Sidebar: 220-240px fixed width, persistent on desktop
- Groups (with section labels in `eyebrow-heading` style — uppercase 11px tracked):

```
PLAN
  Projects     (route: /projects, icon: FolderKanban, default landing)
  Plans        (route: /plans, icon: ScrollText)
  Approvals    (route: /approvals, icon: CheckCircle2)

INSIGHT
  Skills       (route: /skills, icon: Sparkles)
  DORA         (route: /metrics, icon: Activity)
  Audit log    (route: /audit, icon: FileCheck)

RUNTIME
  Rules        (route: /rules, icon: Shield)
  Adapters     (route: /integrations, icon: Plug)

ACCESS
  Settings     (route: /settings, icon: Settings)
  API keys     (route: /api-keys, icon: Key)
```

### IA: persona-journey grouping (2026-05-12 revision)

The earlier 5-group structure (PLAN/OPERATE/CONNECT/MEASURE/ADMIN) from the original Lovable H1 mockup was a clean categorical taxonomy, but it split two personas' daily arcs across multiple groups:

- **Priya's arc** (weekly trust check + rare audit): Skills ledger → DORA → Audit log. The old layout put Skills in OPERATE and DORA/Audit in MEASURE — she had to zigzag across groups for one mental model ("what do I observe?"). Now: all three live in **INSIGHT**, top-to-bottom matching her flow.
- **Jordan's arc** (setup + connection): Adapters and API keys are both connection plumbing (external systems in vs. agents in). The old layout split them across CONNECT and ADMIN. Now: API keys sits in **ACCESS** next to Settings (it *is* workspace access config), and Adapters joins Rules in **RUNTIME** (Rules + Adapters together = "what an agent receives when it calls in").
- **Sam's arc** (daily portfolio sweep): unchanged. PLAN group is exactly his daily flow.
- **Devin**: lives in Cursor, barely touches the sidebar; the new IA doesn't constrain him.

**Skills under INSIGHT, not OPERATE:** the H4 brief frames `/skills` as the *trust-earned ledger* — Priya's celebration moment, not "operate an agent". The agent-callable framing applies to the API surface, not the web UI.

### Anti-patterns (do NOT revert)

- ❌ Do not re-split Adapters and API keys into separate groups. They are both connection config from a user POV (one for system integrations, one for agent auth) and belong together.
- ❌ Do not move Skills back into an "OPERATE" group. The web surface for Skills is the trust ledger (H4), an observation surface.
- ❌ Do not move the audit log back under `/skills/audit`. The page now spans plans, projects, approvals, deployments, *and* skills — the route was renamed to `/audit` (2026-05-12) to reflect that. Priya's flow still starts from `/skills` (trust ledger) and links across to `/audit`.

- Brand: top-left, lowercase wordmark `coznt` + small `v0.1` chip (Bricolage Grotesque for display weight, Mono for the version chip)
- Top of main pane: breadcrumb pattern `<Org name> / <current section>` (e.g., `Northwind Platform Engineering / Portfolio`)
- Top-right: search trigger (Cmd+K placeholder), `[+ New project]` primary button on the Portfolio view (move out of the page if needed)
- Bottom-left of sidebar: user info — avatar + name + role (e.g., `SR Sam Reyes · Tech Lead · Northwind`)
- Active link: filled bg using `--sidebar-accent`, foreground using `--sidebar-accent-foreground`
- Hover: subtle `--sidebar-accent/50` background

### Sidebar shell pattern reference

- Look at how `tanznt/src/app/recruit/` does its shell. Pattern is sound; aesthetic is different.
- Useful component: `tanznt/src/components/portal/eyebrow-heading.tsx` (or write fresh — it's 10 lines).

### Verification

- All 9 nav links resolve (stubs are fine for routes that don't exist yet — but most exist already)
- Active state highlights the current section
- Sidebar matches the Lovable H1 mockup visual exactly
- User info populated from `getCurrentUser()` (already wired in current layout)
- No console errors

### Do NOT

- ❌ Build a collapsible sidebar in v1. Fixed-open.
- ❌ Add a settings flyout / theme toggle in the sidebar — that lives in Settings page later.
- ❌ Put the "+ New project" button in the sidebar — it belongs on the page header.
- ❌ Use shadcn's full Sidebar primitive if it requires more wiring than the simple flex pattern. Plain divs + Links are fine.

### Effort estimate

1-2 hours.

---

## Phase 3 — H1 Portfolio view

**Goal:** rewrite `/projects` to be the validated portfolio cockpit. This is the canary — if Phase 0-2 are right, this phase is fast.

### Required reading before starting

- `docs/ux/briefs/H1-portfolio.md`
- `docs/ux/sample-data.md` (the 4-project fixture)
- The Lovable mockup reference (visible in the conversation that produced this plan; key reference points captured in the brief)

### Deliverables

Files to write/edit:

| File | Action | Notes |
|---|---|---|
| `src/app/(app)/projects/page.tsx` | Rewrite | Server component. Fetch portfolio data, render shell + delegate to `PortfolioTable` |
| `src/app/(app)/projects/serialize.ts` | Extend | Add `serializePortfolioProject` and `serializePortfolioRollup` returning client-facing types |
| `src/app/(app)/projects/PortfolioTable.tsx` | Create | Client component. Renders rollup strip + table. Pure presentation. |
| `src/operations/projects.ts` | Extend | Add `listProjectsForPortfolio(orgId)` returning rich shape (phase, gate counts, sparkline points, open approvals, lead time, deploys) |
| `src/operations/metrics.ts` | Extend (or no change) | Add `getPortfolioRollup(orgId, windowDays)` returning rollup numbers |
| `src/operations/skill-autonomy.ts` | Extend (or no change) | Add `getAutonomyEventsThisWeek(orgId)` returning `{ promotions: N, demotions: N }` |
| `src/actions/projects.ts` | Extend | Thin "use server" wrapper around the new operation |

### Data shape for PortfolioTable

```ts
type PortfolioRollup = {
  openApprovals: number;
  deploysThisWeek: number;
  autonomyEvents: { promotions: number; demotions: number };
  portfolioCFR: { value: number; wowDeltaPoints: number };
};

type PortfolioProject = {
  id: string;
  name: string;
  slug: string;
  shortKey: string;        // e.g., "ASM" for Auth Service Migration
  phase: ProjectPhase;
  status: ProjectStatus;
  health: "healthy" | "warning" | "danger";
  hasRegression: boolean;
  gates: { passed: number; total: number; states: GateState[] };
  openApprovals: number;
  leadTimeDays: number | null;
  deploys30d: number | null;
  cfr30d: number | null;       // 0 to 1
  cfrSparkline: number[] | null;
  cfrTrendDirection: "up" | "down" | "flat" | null;
  cfrWowDeltaPoints: number | null;
};
```

### v1 data sourcing — practical compromise

The richer fields (sparkline, autonomy events, rollup numbers) require populated `metrics` and `skill_outcomes` tables. For v1, do this:

1. **Real fields:** name, slug, phase, status (already in `projects` table), gates (already computable), openApprovals (count from `approvals` table)
2. **Approximated fields:** leadTimeDays, deploys30d, cfr30d — query the `metrics` table if data exists; otherwise return `null` (renders as `—`)
3. **Stub fields (v1 only):** cfrSparkline, autonomyEvents, portfolioCFR — for v1, generate from the sample-data.md fixture values OR seed via a `pnpm seed:demo` script that populates the DB with the storyline. **Mark with `TODO:` comments naming the data source.**

The point: the screen must render with real-shape data even when the metric backfills aren't done. Don't block H1 on the metrics pipeline.

### Visual implementation details (resolved decisions from the H1 brief)

- Information-dense table-style rows, NOT card grids
- 36px row height (compact density)
- Status dot at row start: green/amber/red (from `StatusDot` primitive)
- Project name + short key in mono (`[ASM]`)
- Phase pills — **slightly toned down** vs. Lovable's variant. Phase isn't the most urgent signal; the status dot is. Use the trust-signal palette but at lower saturation.
- Sparkline column: 60×16, color from `cfrTrendDirection`
- CFR column: percentage + `TrendIndicator` showing WoW delta
- Row hover: subtle bg, full row clickable to `/projects/[id]`
- Action chevron at right
- Footer source-attribution line: `Sources: GitHub deployments, Jira approvals, coznt audit log · last sync Xm ago`

### Rollup strip (above the table)

- 4 stat items, single row, separated by vertical bars or wide gutter
- Each stat: large number + small descriptor + optional trend indicator
- Big number font weight 700, descriptor in muted
- Click on a stat → drill into the relevant deep view

### Empty / loading / edge states

- Loading: skeleton with 4 row placeholders (matches expected count)
- Empty (zero projects): single-line "No projects yet." + `[+ New project]` button. No illustration.
- 30+ projects (future): add filter bar by phase/team; don't paginate, virtualize

### Anti-patterns (re-stated for emphasis)

- ❌ Card grid with 2-3 projects per row
- ❌ Hero header band with project count as a giant number
- ❌ Donut chart in the rollup strip
- ❌ Empty state with multi-step "Welcome!" wizard
- ❌ Phase pill colors over-saturated to the point they dominate the row
- ❌ Hidden auto-approval indicator (this comes in H3, not H1)

### Verification

- `/projects` renders the 4 fixture projects with the correct phase/status mapping
- Auth Service Migration row is visually flagged (status dot red, regression chip, red sparkline)
- Internal Payments API shows healthy green dot, green downward sparkline (improvement)
- Data Warehouse v2 and Kafka Pipeline show `—` in CFR/lead/deploys columns
- Rollup strip shows `12 · 18/wk · ↑1 ↓1 · 11% ↑3pt`
- Footer line present and links to the source-of-record settings page
- Click any row → navigates to `/projects/[id]` (current cockpit; H2 will rewrite it)
- Theme toggle works — dark and light both look right

### Effort estimate

3-5 hours.

---

## Phase 4 — H2 Cockpit

**Required reading:** `docs/ux/briefs/H2-cockpit.md`

### Key new build

1. **Per-phase guidance content layer.** Decide before building: hardcoded defaults in `src/domain/phases.ts` (current location) OR a new `phase_guidance` plan kind. **Recommendation for v1: hardcoded defaults**, override via project-level setting (deferred). Add to `phases.ts`:

```ts
export const PHASE_GUIDANCE: Record<ProjectPhase, {
  description: string;
  suggestedActions: string[];
  nextCondition: string;
}> = {
  REQUIREMENTS: { ... },
  DESIGN: { ... },
  DEVELOPMENT: { ... },
  TESTING: { ... },
  CICD: { ... },
  MONITORING: { ... },
};
```

Port the content from the prior SDLC `projects/[id]/page.tsx` (visible in conversation history that produced this plan; gist: each phase has 3-5 suggested actions and a "next condition" string).

2. **Named unmet criteria.** The current `phase_gate` schema needs a way to express *what* is unmet (currently it's just a pass/fail). Either:
   - Add `unmetCriterion`, `assigneeId`, `lastChangedAt` columns to `phase_gates` (preferred, structured)
   - OR add a `details` JSONB column and put rich info there

If schema change: write migration, update operations + actions. If JSONB: simpler, less typed.

**Recommendation: add structured columns** (it's worth the migration; the data is queryable).

3. **Connect Cursor modal.** Implement as a small `<Dialog>` triggered by the "Connect Cursor" button. Pre-fills `.cursor/mcp.json` snippet with the project's API key (auto-generate if not present). See `docs/ux/briefs/DX-mcp-context.md` for the modal's spec.

### Files

- `src/app/(app)/projects/[id]/page.tsx` — extend
- `src/app/(app)/projects/[id]/CockpitClient.tsx` — new, holds the interactive bits
- `src/app/(app)/projects/[id]/ConnectCursorModal.tsx` — new
- `src/domain/phases.ts` — add `PHASE_GUIDANCE` constant
- `src/db/schema/phase-gate.ts` — migration to add structured criterion fields (if going schema route)
- `drizzle/00XX_phase_gate_criteria.sql` — migration

### Effort estimate

4-6 hours (the schema migration adds an hour).

---

## Phase 5 — H3 Approvals inbox

**Required reading:** `docs/ux/briefs/H3-approvals.md`

### Key new build

1. **Inline approve/reject actions.** The current `/approvals` is read-only. Add server actions:
   - `approveApproval(id, comment?)`
   - `rejectApproval(id, reason)` — reason is REQUIRED
   - `bulkApproveEligible(ids[])`

2. **Skill track record badge.** Use the `SkillTrackRecord` primitive from Phase 1. Data comes from `getSkillAutonomy(skillId)` + 30-day outcomes count.

3. **Auto-approval eligibility logic.** A pure function in `src/operations/approvals.ts`:

```ts
export function isAutoApprovalEligible(approval, skill): boolean {
  if (!skill) return false;
  if (skill.level === "INTERN" || skill.level === "JUNIOR") return false;
  // Add change-complexity threshold check here later
  // For v1: Senior auto-approves schema-only, Principal auto-approves docs-only
  return checkComplexityThreshold(approval, skill);
}
```

4. **Optimistic UI + undo toast.** Use the existing `src/components/shared/undo-toast.tsx`. 5-second window.

5. **Required reason on reject.** Modal with textarea + common-reason dropdown.

6. **Tabs (Mine / Team / All).** Filter the operations query by current user vs. team vs. org.

### Files

- `src/app/(app)/approvals/page.tsx` — rewrite
- `src/app/(app)/approvals/ApprovalsInbox.tsx` — new client component
- `src/app/(app)/approvals/RejectModal.tsx` — new
- `src/operations/approvals.ts` — extend with eligibility logic + filters
- `src/actions/approvals.ts` — add approve/reject/bulkApprove

### Effort estimate

4-6 hours.

---

## Phase 6 — H4 Skills Autonomy Ledger

**Milestone A spine demo.** This is the screen that proves the loop is real. Build per-project from day one — the org-wide-only view is not the headline. Depends on Milestone A's worker + outcome assessors writing real `skill_outcomes` rows.

**Required reading:** `docs/ux/briefs/H4-ledger.md`

### Key new build

1. **Recent autonomy events feed.** Query the `skill_autonomy` table for events in the last 14 days. Each event has `from`, `to`, `at`, `reason`, `skillId`.

2. **Promotion/demotion banner.** Use the `LevelChange` primitive from Phase 1. Up-arrow green for promotions, down-arrow red for demotions. Critical: visually distinct.

3. **Per-skill 30-day stats sparkline.** Use `Sparkline`. Data: count of `success` outcomes per day over 30 days.

4. **Skill detail page (functional).** `src/app/(app)/skills/[id]/page.tsx` — does not exist yet. Show: full history, criteria for next level, recent outcomes list, projects it runs on. Read-only in v1.

### Files

- `src/app/(app)/skills/page.tsx` — rewrite as the autonomy ledger
- `src/app/(app)/skills/RecentEventsBanner.tsx` — new
- `src/app/(app)/skills/SkillsLedgerTable.tsx` — new
- `src/app/(app)/skills/[id]/page.tsx` — new functional detail page
- `src/operations/skill-autonomy.ts` — add `getRecentEvents(orgId, days)`, `getSkillStats30d(skillId)`

### Effort estimate

5-7 hours (skill detail adds time).

---

## Phase 7 — H5 Cross-project DORA Metrics

**Required reading:** `docs/ux/briefs/H5-metrics.md`

### Key new build

1. **Portfolio aggregates.** Sum/avg across all projects' metrics over the window. New operation: `getPortfolioMetrics(orgId, windowDays)`.

2. **Small multiples grid.** 4 metric rows × N project columns. Use `SmallMultiples` from Phase 1.

3. **Causal attribution panel.** Heuristic for v1:
   - If a metric's WoW delta exceeds threshold (e.g., CFR ↑3pt), find the project(s) most responsible
   - For that project, find the skills that auto-approved during the regression window
   - Surface the top 1-3 PRs/deploys associated
   - This is heuristic, not statistically rigorous. Mark `// TODO: replace with proper causal model` and ship.

4. **Window selector** (7d/30d/90d). Single segmented control. Server-side re-fetch on change.

### Files

- `src/app/(app)/metrics/page.tsx` — rewrite
- `src/app/(app)/metrics/PortfolioAggregates.tsx` — new
- `src/app/(app)/metrics/SmallMultiplesGrid.tsx` — new
- `src/app/(app)/metrics/AttributionPanel.tsx` — new
- `src/operations/metrics.ts` — `getPortfolioMetrics`, `detectRegressions`, `attributeRegression`
- Delete `src/app/(app)/metrics/Sparkline.tsx` (replaced by `src/components/viz/Sparkline.tsx` in Phase 1)

### Effort estimate

6-8 hours (the attribution panel is the long pole).

---

## Phase 8 — DX track: MCP endpoint + Connect Cursor modal

> **DEFERRED to Milestone E.** This phase serves Devin's IDE input surface — Moment 6 (Cursor First-Call). Useful for adoption, not load-bearing for the loop. Do not pull forward before Milestones A and B have real data flowing end-to-end. The spec below remains valid for when Milestone E lands.

**Required reading:** `docs/ux/briefs/DX-mcp-context.md`

### Key new build

1. **MCP server route.** `src/app/api/v1/mcp/context/route.ts` — POST handler that:
   - Validates API key (from `api_keys` table)
   - Resolves project from key (or from `repoUrl` if provided)
   - Returns the response shape specified in the DX brief
   - Targets <500ms p95 (cache aggressively)

2. **Response builder.** `src/lib/mcp/build-context.ts` — fetches project, current phase, active work items, rules, skills, ADRs, and assembles the JSON response.

3. **API key flow.** Project-scoped API keys generated when the Connect Cursor modal is opened. Stored in `api_keys` table with `projectId`. Already used by `src/app/api/v1/`.

4. **Connect Cursor modal** (already built in Phase 4 as part of H2). Pre-fills `mcp.json` snippet.

5. **Error responses.** Every error includes a `fixUrl` or `retryAfterSeconds` or `candidates` payload per the DX brief.

### Files

- `src/app/api/v1/mcp/context/route.ts` — new
- `src/lib/mcp/build-context.ts` — new
- `src/lib/mcp/schemas.ts` — Zod schemas for the response
- `src/operations/api-keys.ts` — extend with `getOrCreateProjectKey(projectId)`

### Verification

- `curl -X POST http://localhost:3000/api/v1/mcp/context -H "Authorization: Bearer <key>"` returns the expected JSON
- Response time <500ms warm
- Wrong-project key returns 404 with `fixUrl`
- Cursor connect modal copy-paste snippet works in a real Cursor instance

### Effort estimate

4-6 hours.

---

## Phase 9 — Polish

Once H1-H5 + DX are functional, do:

1. **Theme toggle in Settings.** User pref persisted to `users.preferences` JSON column (or localStorage v1).
2. **Search / Cmd+K.** Stub or implement with `cmdk`. Start with a basic palette: jump to project, jump to skill, run audit query.
3. **Notifications side-panel.** From the briefs: moments happen *because of* notifications; the panel is secondary.
4. **Stale project styling on H1.** Dim rows with no activity 30d+.
5. **Storybook-less primitives gallery cleanup.** Remove `__playground/` or move under a feature flag.

### Effort estimate

3-5 hours.

---

## Cross-cutting rules (apply throughout)

### Code conventions (from `CLAUDE.md`)

- All DB access through operations, never `db.select()` in pages
- Page-data pattern: `serialize.ts` exports client types
- Two sources of truth: Drizzle (DB) and Zod (AI output) — no manual TypeScript data interfaces
- AI agents follow the 3-file pattern: definition, prompt, task
- CRUD via `createEntityCrud()` in `src/lib/crud.ts`
- Migrations via `pnpm db:generate` and committed alongside schema changes — **never `db:push` to prod**

### Component conventions (from `DESIGN.md`)

- Information density default. 13px base font. 32-40px table rows.
- Dark theme is default; light is first-class option
- Tables over cards
- Trust signals use the dedicated palette only — don't reuse autonomy/state colors for unrelated UI
- All color goes through CSS variables
- Lucide icons, 14-16px

### Component sourcing rule (load-bearing)

**Install shadcn primitives, don't hand-roll equivalents.** Before writing any new component, check whether it exists at https://ui.shadcn.com/docs/components. If yes: `pnpm dlx shadcn@latest add <name>` and use it. If no (only for domain-specific composites like AutonomyPill, GateDot): write a thin wrapper around the closest shadcn primitive using cva for variants.

This rule overrides any earlier guidance in `docs/ux/DESIGN.md` that suggested hand-built sparklines or custom badges. Use shadcn's `chart` primitive for all data viz — including small inline sparklines.

Already installed in `src/components/ui/`: button, card, dialog, dropdown-menu, input, label, select, textarea, avatar. Phase 1 adds the rest.

### Anti-sycophancy

When in doubt, take a position. State what would change your mind. From `docs/ux/methodology.md`:

> When reviewing screen ideas, take a position on every one AND state what evidence would change it. "This is the wrong primary action because X; I'd change my mind if Y." No "could work" — say whether it works and why.

### What NOT to do

Re-read the anti-pattern lists in each brief before starting that phase. Common offenses:

- ❌ Card grids with 2-3 large cards per row (low density)
- ❌ Donut/pie charts anywhere
- ❌ Hero illustrations, glassmorphism, gradients-for-mood
- ❌ Toast for every action — only for reversible operations
- ❌ Status messages without source-of-record links
- ❌ Adding features not in `docs/ux/screens.md`

---

## Open questions to surface (not block on)

These should be flagged in PR descriptions, not blockers for shipping:

1. **Phase guidance content authorship.** Hardcoded for v1; eventually should be a `phase_guidance` plan kind so orgs can override.
2. **H4 / H7 split.** `/skills` is celebration; `/skills/audit` is forensic query. Sharing data, different routes. Re-evaluate after both are live.
3. **Cross-project causal attribution model.** Heuristic in v1; replace with proper statistical attribution once we have more data.
4. **Skill detail page write surface.** Read-only in v1. Decide later whether toggle-enabled + per-project override belong on the detail page.
5. **Bulk-approve trust modeling.** Track which users bulk-approve which skills for future autonomy input. Doesn't change v1 UX.
6. **Adapter binding wizard.** Currently functional, not hero. Worth revisiting if Jordan's onboarding becomes the bottleneck.

---

## Verification at the end of every phase

Before committing:

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm dev` renders without console errors
- [ ] Manually QA the screen in both dark and light themes
- [ ] The 4 personas — would Sam/Devin/Jordan/Priya recognize this as serving their moment?
- [ ] The 5 design tests — does the change serve trust-visible, two-planes, plan-as-artifact, gap-closing, or multi-project ergonomics?
- [ ] Update `## Progress log` below

---

## Progress log

| Date | Phase | Status | PR | Notes |
|---|---|---|---|---|
| 2026-05-12 | Phase 0 | ✅ Done | — | Dark theme default + trust/motion tokens added to `globals.css`. `data-theme="dark"` set on `<html>`. Fixed pre-existing `baseUrl` deprecation in `tsconfig.json` via `ignoreDeprecations: "6.0"`. Other pre-existing TS errors (scripts/worker.ts, lib/crud.ts, page.tsx implicit-any) noted; unrelated to Phase 0 scope. |
| 2026-05-12 | Phase 1 | ✅ Done | — | Installed shadcn primitives via CLI: badge/table/tabs/drawer/sheet/sidebar/command/chart/popover/tooltip/skeleton/sonner/separator/scroll-area/collapsible (plus auto-deps: cmdk, vaul, recharts, next-themes). Built 8 trust composites (`AutonomyPill`, `LevelChange`, `GateDot`, `GateStateRow`, `StatusDot`, `AttributionChip`, `SkillTrackRecord`, `TrendIndicator`) and 2 viz (`Sparkline`, `SmallMultiples`). Playground at `/playground` — note: renamed from plan's `__playground` because Next.js excludes `_`-prefixed folders from routing. Patched `dialog.tsx` to export `DialogDescription` et al for `command.tsx`. |
| 2026-05-12 | Phase 2 | ✅ Done | — | Replaced flat 7-link sidebar with grouped 5-section nav (PLAN/OPERATE/CONNECT/MEASURE/ADMIN). New `AppShell` client component with brand wordmark + v0.1 chip, eyebrow group labels, lucide icons, active-state highlighting via `usePathname`. Top bar shows breadcrumb `<Org> / <section>` derived from path, search trigger (Cmd+K placeholder, non-functional), and `+ New project` button only on `/projects`. User panel at bottom-left shows avatar initials + name + `role · orgName`. Layout fetches org name from `auth.organization` table. |
| 2026-05-12 | Phase 3 (H1) | ✅ Done | — | Rewrote `/projects` as the portfolio cockpit. New `operations/portfolio.ts` composes real data (projects, gates, open approvals) with a v1 stub overlay keyed by slug (sample-data.md fixtures for sparkline/CFR/lead time/deploys). `serialize.ts` extended with portfolio types. `PortfolioTable.tsx` renders the 36px-row table with status dot, name+shortKey, phase pill (toned-down), gate cluster (X/Y + dots), open approvals, lead, deploys, sparkline+CFR with WoW delta, action chevron. Auth Service Migration row gets the `CFR ↑` regression chip + red sparkline + danger status dot. Rollup strip above the table links each stat to its deep view. Footer carries the source-of-record attribution line. Empty state ≤1 line + new-project button (no wizard). Real per-project approval counts are still portfolio-divided — see `TODO(approvals-projectid)` for the schema follow-up. |
| 2026-05-12 | Phase 4 (H2) | ✅ Done | `drizzle/0001_lumpy_iron_man.sql` | Rewrote `/projects/[id]` as the H2 cockpit. Schema: added `unmet_criterion`, `assignee_id/name`, `last_changed_at`, `last_green_at` to `phase_gates` with a versioned migration. Domain: new `PHASE_GUIDANCE` constant in `domain/phases.ts` covering all 6 phases (description + suggested actions + nextCondition). Operation: `getOrCreateProjectKey(projectId)` in `operations/api-keys.ts` lazily mints a project-scoped key. UI: `CockpitClient.tsx` renders a 3:2 two-column layout — left has the phase-guidance card with the prominent **Advance** CTA (disabled with reason when gates are unmet) and the gates list (each failed/pending gate names its criterion + assignee + age + "was green X" diff); right has compact bindings + plans cards. Connect Cursor modal lives next to the New plan button — pre-fills `.cursor/mcp.json` with the project key, copy-to-clipboard with confirmation, "show once" warning when first minted. |
| 2026-05-12 | Phase 5 (H3) | ✅ Done | — | Rewrote `/approvals` as the inbox. Server actions `approveApproval`, `rejectApproval` (reason required), `bulkApproveApprovals` route through existing `decideApproval` operation. New `serialize.ts` produces row DTOs with auto-eligibility heuristic + stale-7d tag. `ApprovalsInbox.tsx` (client) renders tabs (All / Team / Mine), bulk-select checkboxes, "Approve eligible (N)" primary action, per-row inline ✓/✗ buttons with optimistic pending state via `useTransition`, sonner toasts for success/error, `RejectModal.tsx` with common-reason chips + required reason textarea. **v1 limitation:** approvals don't carry a `skillId` yet, so the SkillTrackRecord badge is shown only as a generic "bot" autonomy pill; full eligibility check still needs the schema link — flagged `TODO(autonomy-link)` in serialize.ts. |
| 2026-05-12 | Phase 6 (H4) | ✅ Done | — | Rewrote `/skills` as the autonomy ledger. Extended `operations/skill-autonomy.ts` with `getSkillStats30d` (30d outcome counts + daily sparkline) and `getRecentAutonomyEvents` (last 14d state changes). New `RecentEventsBanner.tsx` renders promotion/demotion events with directional arrow + tone-distinct background (green vs red) + receipts/incident link. `SkillsLedgerTable.tsx` renders skill rows (level pill, 30d ✓/↻/⚡ stats, next review, sparkline) plus an autonomy distribution bar across intern/junior/senior/principal. New `/skills/[id]` detail page shows large 30d stat block, current-level criteria, last-decision reason, and review schedule. **v1 limitation:** `skill_autonomy` only stores current state, so recent events show one event per skill (a proper `autonomy_events` history table is the long-term home). |
| 2026-05-12 | Phase 7 (H5) | ✅ Done | — | Rewrote `/metrics` as the cross-project DORA view. Extended `operations/metrics.ts` with `getPortfolioMetrics(windowDays)` returning portfolio aggregates, per-project columns, and a heuristic attribution finding (sample-data fixture for v1, marked `TODO(causal-model)`). Deleted old `metrics/Sparkline.tsx` and `metrics/serialize.ts` (replaced by Phase 1 viz primitives). New `MetricsClient.tsx` renders: portfolio header with refreshed timestamp + window selector (7/30/90d), 4 aggregate cards (big number + sparkline + WoW delta), small-multiples table (rows = 4 DORA metrics × columns = active projects, semantic color per regression/improvement, `—` for no-data), attribution panel that surfaces only when a regression is attributable — driver line, cause line, dated timeline, current skill state, and action buttons (open incident plan / view skill / view project). Window selector pushes `?window=` to URL and the server re-fetches. |
| 2026-05-12 | Phase 8 (DX) | ✅ Done | — | Built the MCP `/api/v1/mcp/context` POST endpoint. `lib/mcp/schemas.ts` defines Zod request/response shapes; `lib/mcp/build-context.ts` resolves the project (project-scoped key OR org-wide key + repoUrl), fetches rules, skills (each with current autonomy + blurb), and project ADR plans. Returns the brief's response shape with absolute URLs to every claim source (project/rule/skill/ADR) so Cursor can verify any single fact. Error responses always include a recovery affordance per the brief — 401 has `fixUrl` to `/api-keys`, 404 likewise, 409 returns `candidates[]` for ambiguous repo matches, and the 500 fallback is wrapped in a friendly message + `fixUrl`. No bare 500s. Connect Cursor modal from Phase 4 already wires this endpoint via `getOrCreateProjectKey`. |
| 2026-05-12 | Phase 9 (Polish) | ✅ Done | — | **Theme toggle:** new `ThemeToggle.tsx` lives in the AppShell topbar; persists `coznt:theme` to localStorage and swaps `data-theme` on `<html>`. **Settings page:** new `/settings` with `ThemePicker` (dark/light buttons) + shortcut reference. **Cmd+K palette:** new `CommandPalette.tsx` wraps shadcn `<CommandDialog>`; `useCommandPaletteShortcut` binds `(Meta\|Ctrl)+K` globally; AppShell's existing Search button now opens it. Palette lists all nav routes + a "Toggle theme" action + "New project". **Stale row styling:** `getPortfolioData` now derives `isStale` / `staleDays` from `project.updatedAt`; rows ≥30d inactive dim to 55% opacity and surface an `Inactive Xd` outline pill. **Playground cleanup:** `/playground` 404s in production (`NODE_ENV === "production"` guard at the top of the page) so the visual-QA surface stays in dev only. **Deferred:** notifications side-panel — the plan flagged it as secondary; ship-ready once the notifications schema's read-state matures. |
| | Phase 2 | | | |
| | Phase 3 (H1) | | | |
| | Phase 4 (H2) | | | |
| | Phase 5 (H3) | | | |
| | Phase 6 (H4) | | | |
| | Phase 7 (H5) | | | |
| | Phase 8 (DX) | | | |
| | Phase 9 (Polish) | | | |
