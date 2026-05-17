# Coznt docs

Every doc here has one job. Start with [`positioning.md`](positioning.md) — it is the definitive source for what coznt is. Everything else either explains *how* a claim is implemented, *how to operate it*, or *how it's designed*.

## Read in this order

1. **[`positioning.md`](positioning.md)** — what coznt is, what it claims, the loop it tightens.
2. **[`product/architecture.md`](product/architecture.md)** — how the daemon + choreography spine implements that loop.
3. **[`product/walkthrough.md`](product/walkthrough.md)** — what each persona's day looks like across the surface.

## By purpose

### `product/` — conceptual material

How coznt works and what it feels like to use.

| File | Purpose |
|---|---|
| [`product/architecture.md`](product/architecture.md) | System architecture, daemon + choreography, decision log. |
| [`product/walkthrough.md`](product/walkthrough.md) | End-to-end persona narrative across the surface. |

### `operate/` — runbooks (you DO these)

Imperative-named operator and developer runbooks.

| File | Purpose |
|---|---|
| [`operate/install.md`](operate/install.md) | Take coznt from seeded data to a real repo. Run once per environment. |
| [`operate/github-app.md`](operate/github-app.md) | One-time GitHub App registration for the execution gate. |
| [`operate/cli.md`](operate/cli.md) | `coznt` CLI command and flag reference. |
| [`operate/mcp-clients/verify.md`](operate/mcp-clients/verify.md) | Confirm each supported MCP client can reach the server. |
| [`operate/mcp-clients/*.json`](operate/mcp-clients/) | Drop-in config templates per client (Claude Code, Cursor, Cline, Zed). |

### `spec/` — contracts and formats (you READ these)

Noun-named reference specs other systems or auditors consume.

| File | Purpose |
|---|---|
| [`spec/audit-evidence.md`](spec/audit-evidence.md) | v1 audit packet shape and hash-chain verification. |
| [`spec/mcp-verbs.md`](spec/mcp-verbs.md) | MCP verb inventory and per-verb implementation status. |
| [`spec/skill-choreography.md`](spec/skill-choreography.md) | `SKILL.md` frontmatter and file layout pushed to `<repo>/.coznt/skills/<slug>/`. |

### `ux/` — design + build track

Self-contained. Enter at [`ux/methodology.md`](ux/methodology.md), then [`ux/build-plan.md`](ux/build-plan.md). Personas, moments, screen catalogue, design system, sample data, and per-hero briefs live alongside.

## Naming convention

- **Lowercase + hyphens.** No spaces, no capitals.
- **Folder carries the category** so file names drop the redundant suffix (no `-setup`, `-format`, `-plan`).
- **`operate/`** uses imperative verbs (`install`, `verify`).
- **`spec/`** uses nouns (`audit-evidence`, `mcp-verbs`).
- **Every file declares a `Purpose:` line under its H1** so its job is unambiguous in three seconds.
