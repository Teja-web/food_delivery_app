# Coznt UX Methodology

How we do UX/feature design on coznt. One page. Read before drafting anything in `docs/ux/`.

## Wedge

**Small enterprise teams (5-25 people) running multiple internal projects, inside an enterprise context (audit pressure, multi-system integration, governance).** Cross-domain — fintech, healthcare, gov, retail, manufacturing, insurance all qualify. No vertical tint in design tokens, sample data, or default flows.

Out of scope: solo founders, 1000+ engineer Big Tech, pure consumer-product startups.

Coznt's structural advantage is **multiple projects per team** — org-level skills/rules/adapters that span projects. Single-project tools don't have this shape.

## The test for any borrowed practice

Anything we adopt has to serve one of:
- **(a) Trust made visible** — the marketing thesis. Every screen should make trust observable.
- **(b) Two-planes clarity** — Platform = control tower (web UI); Cursor/Claude = workspace (MCP). The UI must not pretend to be where the developer lives.
- **(c) Plan-as-first-class artifact** — six plan kinds (`requirement`, `adr`, `feature_plan`, `test_plan`, `release_plan`, `incident`) share one schema. UI renders them fluently.
- **(d) Close the gap between the marketing one-pager and the running app** — dark/teal/precise vs. light/shadcn/neutral.
- **(e) Multi-project ergonomics** — the cross-project view (which skills work where, which projects are blocked, which gates fired) is the differentiator. Single-project surfaces are necessary but not sufficient.

If a borrowed practice doesn't serve (a)–(e), we don't adopt it.

## Adopted (process rules — in force from now on)

1. **DESIGN.md as a real artifact.** Locks the design system (color, type, spacing, motion) before screen-by-screen work. Serves (d). Treat it as a `plan` of kind `design_system` — same shape as any other plan.
2. **Specificity rigor for personas.** No persona is real until it has a name, a role, a company shape, and a job-defining consequence. "Engineering org" is not a persona; "Priya, Director of Platform Eng at a 400-person fintech, fails her SOC2 audit if approvals aren't queryable" is.
3. **Variant exploration for hero screens only.** ~4 screens get 3+ variants before commit: autonomy ledger, phase-gate runner, approval inbox, adapter binding wizard. Everywhere else: shadcn-stock + the DESIGN.md tokens.
4. **0-10 rating per dimension for each screen sketch.** Dimensions: information hierarchy, interaction states (loading/empty/error/success/partial), edge cases, subtraction (Rams), trust signals. Makes taste decisions auditable.
5. **DevEx framework on MCP + adapter surfaces.** Zero friction, learn by doing, fight uncertainty. The two surfaces where this matters most: Cursor MCP onboarding, and adapter binding (GitHub/Jira/ADO/Confluence).

## Inspiration for coznt features (not our process — note for later)

- **Autonomy-level pills with blurbs** (intern/junior/senior/principal) — the visual language of "trust earned." Coznt already half-implements this; it's the right vocabulary for the ledger UI.
- **Composite project-health score** — candidate coznt feature: `health = phase × gate × DORA × autonomy`. Defer to product backlog.

## Dropped — does not earn its place

- **Three-reviewer / autoplan pipeline.** Borrowings doc explicitly deferred the cross-harness reviewer pattern. Adopting it now contradicts that decision.
- **Daily/monthly security cadence.** Premature: one user, no production data.
- **Health/benchmark cadence.** Premature: one user, no multi-contributor signal.
- **Canary monitoring.** Coznt isn't deployed; no staging URL.
- **Adversarial spec-review subagent on docs.** Three-reviewer in miniature. Same defer.
- **Ship/land/deploy rituals.** Overhead before coznt has anything to ship to.

## Order of operations for the UX pass

1. **Personas** — 2-3 named humans with job-defining consequences. Pressure-test against the specificity rule. (`docs/ux/personas.md`)
2. **Moments** — 5-7 specific moments worth designing for. Each names the user, the trigger, the desired outcome, the trust signal. (`docs/ux/moments.md`)
3. **Screen list** — derived from moments, not invented. Each screen names its moment, primary user, primary action, data needed, key states. (`docs/ux/screens.md`)
4. **DESIGN.md** — system tokens (color, type, spacing, motion) before pixel work begins.
5. **Hero screen variants** — 3+ variants for the 4 hero screens. Compare, commit.
6. **Per-screen briefs** — only after the above lands, and only specific enough that an external generator could produce a faithful first pass.

No skipping steps. Each step produces an artifact the next step references.

## Anti-sycophancy rule

When reviewing screen ideas (ours or contributors'), take a position on every one AND state what evidence would change it. "This is the wrong primary action because X; I'd change my mind if Y." No "could work" — say whether it works and why.

## Component sourcing rule

**Install shadcn primitives, don't hand-roll equivalents.** Before writing any new component, check https://ui.shadcn.com/docs/components — if it exists there, `pnpm dlx shadcn@latest add <name>`. Only write custom code for domain-specific composites that shadcn doesn't have (autonomy pills, gate dots, skill track records), and even then as thin wrappers around shadcn primitives using cva for variants. This includes data viz — use shadcn's `chart` primitive (Recharts-based) for sparklines and small-multiples, not hand-rolled SVG.
