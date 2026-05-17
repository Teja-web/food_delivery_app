# Coznt Design System

Source of truth for visual language. Every screen, every variant, every component references this. If a design decision isn't captured here, it should be — file a delta before shipping.

## Aesthetic anchor

**Information density over decoration.** The peer set is Linear, Vercel, Datadog, Grafana, Cursor itself — not Stripe, Notion, or Asana. Every pixel earns its place. White space is for readability, not for breathing room.

**Trust observable.** Every claim on screen links to its source-of-record. No coznt-only numbers. No unsourced status pills. The "audit posture" is visible *in the UI* before it's queryable from the database.

**Precision over delight.** Skill autonomy levels, gate states, and DORA attribution are the marketing thesis. They get visual weight. Decorative animation, illustrations, gradients-for-mood, and hero imagery are out of scope — they undermine the audit-grade positioning.

## Theming

All color is expressed via **CSS variables (HSL triplets)** so themes are runtime-swappable. Two default themes ship — dark and light — and every component must render correctly in both. No hard-coded hex values in components.

Brand-aligned default is **dark** (continuity with the marketing one-pager), but the choice is configurable per org. Treat both themes as first-class.

```css
:root[data-theme="dark"] {
  --background: 224 71% 4%;
  --foreground: 210 40% 98%;
  --muted: 215 28% 14%;
  --muted-foreground: 217 11% 65%;
  --border: 215 28% 17%;
  --input: 215 28% 17%;
  --primary: 172 66% 50%;       /* teal — brand accent */
  --primary-foreground: 224 71% 4%;
  --ring: 172 66% 50%;
  --card: 224 50% 7%;
  --card-foreground: 210 40% 98%;
  --popover: 224 50% 7%;
}

:root[data-theme="light"] {
  --background: 0 0% 100%;
  --foreground: 224 71% 4%;
  --muted: 220 14% 96%;
  --muted-foreground: 220 9% 46%;
  --border: 220 13% 91%;
  --input: 220 13% 91%;
  --primary: 174 72% 36%;       /* darker teal for light bg */
  --primary-foreground: 0 0% 100%;
  --ring: 174 72% 36%;
  --card: 0 0% 100%;
  --card-foreground: 224 71% 4%;
  --popover: 0 0% 100%;
}
```

## Trust-signal palette (semantic, do not reskin without a reason)

These colors carry product meaning. Match the existing code (`SkillsPage.tsx`, project gate badges).

| Signal | Slug | Hue | Token |
|---|---|---|---|
| Autonomy: Intern | `intern` | gray/muted | `--autonomy-intern` |
| Autonomy: Junior | `junior` | blue 500 | `--autonomy-junior` |
| Autonomy: Senior | `senior` | green 500 | `--autonomy-senior` |
| Autonomy: Principal | `principal` | violet 500 | `--autonomy-principal` |
| Gate: pending | `pending` | amber 500 | `--state-pending` |
| Gate: passed | `passed` | green 500 | `--state-passed` |
| Gate: failed | `failed` | red 500 | `--state-failed` |
| Gate: skipped | `skipped` | muted | `--state-skipped` |
| Severity: critical | — | red 600 | `--severity-critical` |
| Severity: high | — | orange 500 | `--severity-high` |
| Severity: medium | — | yellow 500 | `--severity-medium` |
| Severity: low | — | blue 400 | `--severity-low` |
| Skill verdict: success | — | green 500 | `--verdict-success` |
| Skill verdict: rolled_back | — | orange 500 | `--verdict-rollback` |
| Skill verdict: incident | — | red 600 | `--verdict-incident` |
| Trend: up | — | green 500 | `--trend-up` |
| Trend: down (regression) | — | red 500 | `--trend-down` |
| Trend: flat | — | muted | `--trend-flat` |

**Rule:** an autonomy pill is *only* used to show autonomy. A gate badge is *only* used to show gate state. Don't borrow these colors for unrelated UI accents.

## Typography

- **UI:** `Inter`, system fallback `system-ui, -apple-system, sans-serif`
- **Mono:** `JetBrains Mono`, fallback `ui-monospace, "SF Mono", monospace` — used for IDs, hashes, change references, JSON, code
- **Base:** 13px (dense default; not 16px)
- **Scale:** 11, 13, 14, 16, 20, 24, 32 (no in-between sizes)
- **Weights:** 400 body, 500 emphasis, 600 headings, 700 only for hero numbers
- **Line-height:** 1.45 body, 1.2 headings, 1 for status pills
- **Tracking:** `-0.01em` on 20+, `0.04em` uppercase, otherwise default

```css
.text-h1 { font-size: 24px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.text-h2 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.text-h3 { font-size: 16px; font-weight: 600; line-height: 1.3; }
.text-body { font-size: 13px; line-height: 1.45; }
.text-meta { font-size: 11px; line-height: 1.4; color: var(--muted-foreground); }
.text-mono { font-family: var(--font-mono); font-size: 12px; }
```

## Spacing

- **Base unit:** 4px
- **Scale:** 0, 1 (4), 2 (8), 3 (12), 4 (16), 5 (20), 6 (24), 8 (32), 10 (40), 12 (48), 16 (64)
- **Density default: compact.** Table row 32px. Card padding 12px. Section gap 16px. Page gutter 24px.
- **Avoid:** the shadcn default `p-6` / `gap-4` on dense surfaces. Reserve those for marketing.

## Radius

- Scale: `0`, `sm` (4), `default` (6), `md` (8), `lg` (12), `full`
- Buttons + inputs: `sm` (4)
- Cards + panels: `default` (6)
- Pills + badges: `full`
- Avatars + dots: `full`

## Shadow / elevation

Information-dense UIs prefer 1px borders over shadows. Default: no shadow on flat surfaces. Reserve `--shadow-popover` for popovers, dropdowns, and dialogs only.

```css
--shadow-popover: 0 4px 16px rgba(0,0,0,0.18);
```

## Motion

- **Durations:** `--motion-instant` (0ms), `--motion-micro` (75ms), `--motion-short` (150ms), `--motion-medium` (300ms)
- **Easings:** entrance `ease-out`, exit `ease-in`, transform `cubic-bezier(0.16, 1, 0.3, 1)`
- **Animate:** modal/drawer open/close, accordion expand, status pill change, promotion banner enter
- **Do not animate:** table row updates, route transitions, sparkline draw-in, numeric changes
- **Reduced-motion:** respect `prefers-reduced-motion: reduce` — collapse to opacity-only transitions

## Iconography

- **Library:** Lucide (already installed)
- **Sizes:** 14px (table rows, inline labels), 16px (default), 20px (section headers)
- **Stroke:** 1.5 (Lucide default — keep)
- **Icon-only buttons:** must have `aria-label`

Standard icon assignments:
- Gate: `Gate` → `Milestone`
- Skill: `Skill` → `Sparkles`
- Plan: `Plan` → `ScrollText`
- Rule: `Rule` → `Shield`
- Approval: `Approval` → `CheckCircle2`
- Incident: `Incident` → `AlertTriangle`
- Deploy: `Deploy` → `Zap`
- Lead time: `Clock`
- DORA: `Activity`

## Data visualization

**Use shadcn's `chart` primitive (Recharts-based) for all data viz, including small sparklines.** Install with `pnpm dlx shadcn@latest add chart`. This supersedes the original "no chart library" stance — standardizing on shadcn-charts gives us themed defaults, accessible tooltips, and one mental model across small and large viz.

- **Sparklines:** 60-80px wide, 16-24px tall. shadcn ChartContainer + Recharts `<LineChart>` with axis/grid/tooltip disabled. Stroke ~1.5px, last point as a 3px dot via `<ReferenceDot>` or a custom dot prop.
  - Up trend: `--trend-up`; down: `--trend-down`; flat: `--trend-flat`
- **Small multiples** are preferred over a single hero chart (matches the cross-project moment). Compose as a grid of `<Sparkline>` instances with value labels.
- **Bars:** shadcn `<BarChart>`. Flat fills, no gradients, no rounded tops, 1px gap between bars.
- **"No data" state:** em-dash `—` in `--muted-foreground`. Never render `0` to mean missing.
- **Number formatting:** `Intl.NumberFormat`. Always include units inline (`4.2 days`, `11%`, `2.3 h`). Tabular figures for columnar data: `font-variant-numeric: tabular-nums`.

## Component conventions

- **Tables over cards** wherever rows are comparable (portfolio, approvals, skills)
- **Pills/badges:** subtle bg + foreground (use the trust-signal palette). One pill per row max, except status combinations explicitly designed
- **Status dot:** 8px circle, semantic color, before the label
- **Drawers > modals** for entity detail views (right-side, 480-640px wide)
- **Modals** only for destructive confirms and small focused tasks (reject reason, bulk-approve confirm)
- **Toasts:** 5s default duration, top-right, undo action for reversible operations
- **Empty states:** one short sentence + a primary action button. No illustrations. No "Get started" wizards.

## Density rules

Two density modes — `compact` (default) and `comfortable` (org-level setting). Components must support both.

| Surface | Compact | Comfortable |
|---|---|---|
| Table row | 32px | 40px |
| Card padding | 12px | 16px |
| Form input height | 32px | 36px |
| Button height | 28px (sm) / 32px (md) | 32px / 36px |
| Section gap | 16px | 24px |

## Page chrome

- **Sidebar:** 220-240px wide, persistent on desktop, **grouped** (Plan / Operate / Connect / Measure / Admin — see `screens.md`)
- **Top bar:** none on most pages. If needed, 44px high with breadcrumb + actions on the right
- **Content max-width:** none on dashboards/portfolios (use full width); `max-w-7xl` on detail forms
- **Gutter:** 24px on desktop, 16px on tablet, 12px on mobile (mobile is not v1 priority but should not break)

## Trust-signal visual language (load-bearing)

This is the differentiating UI vocabulary. Use consistently.

- **Autonomy pill** — small pill, level color from trust palette, label is the level name + optional next-review badge
  - Example: `[Senior] · review in 12d`
- **Gate state row** — status dot + name + (if failed/pending) named unmet criterion with assignee + age
  - Example: `● ADR-0014 review — pending @rohan since Tue (3d)`
- **Skill track record badge** — inline next to skill name where space allows
  - Format: `Senior · 47✓/2↻/0⚡ 30d` (✓ success, ↻ rollback, ⚡ incident)
- **Attribution chip** — small monospace ID near every action claim. Click → opens the source
  - Format: `[gh-pr-1234]` or `[plan-X8q]`
- **Reviewer chip** — avatar (or initials) + name + role-at-time
  - Format: `RD` `Ram D. · Tech Lead`
- **Aging** — relative timestamp (`3d`, `9d`); over 7d shifts to amber-foreground; over 30d shifts to muted
- **Signed action mark** — small `🔒` (or shield icon) on rows backed by a signed audit-log entry. Tooltip shows hash.

## Accessibility

- Min contrast: WCAG **AA** (4.5:1 body, 3:1 large text + UI components). Run both themes through a checker before shipping.
- Focus rings: 2px solid `--ring`, 2px offset
- All interactive elements keyboard-reachable in source order
- Screen-reader labels on every icon-only button (`aria-label`)
- Color is never the only signal — pair with text, icon, or position (autonomy pills have the level name in them; gate dots are paired with the state word)
- `prefers-reduced-motion: reduce` collapses transforms to opacity transitions

## What we don't do

- ❌ Hero illustrations, marketing-style gradients, glassmorphism, neumorphism
- ❌ Card grids with 2-3 large cards per row (low density)
- ❌ Toast messages that say "success" with no further action context
- ❌ "Sign-up wizards" or multi-step onboarding flows where a form would do
- ❌ Status messages without source-of-record links
- ❌ Skeletons that animate elaborately — use a single shimmer if at all
- ❌ Dark/light "auto" detection without a manual override

## File / component locations

- Tokens: `src/app/globals.css` (CSS variables)
- Shared trust-signal components: `src/components/trust/` (to be created — pills, badges, attribution chips)
- Shared data viz: `src/components/viz/` (sparklines, small multiples)
- Existing shadcn primitives: `src/components/ui/` — keep, but parameterize for density
