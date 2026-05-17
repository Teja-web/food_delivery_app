# Skill Choreography

*Purpose: `SKILL.md` frontmatter and file layout pushed to `<repo>/.coznt/skills/<slug>/` so AI editors know which governed verb to call when.*

A **choreography** is the workflow guide coznt pushes to each developer's repo so their AI editor (Cursor, Claude Code, Cline, Continue, Zed) knows when to call which governed verb. It is *not* the LLM prompt — the prompt body stays on the coznt server and runs inside `invoke_skill`. Choreography is the playbook; the daemon is coznt.

> **Slogan:** push the choreography, keep the daemon.

## File layout

Each server-side skill carries two markdown files in `src/automations/skills/<slug>/`:

| File | Audience | Distributed? |
|---|---|---|
| `SKILL.md` | Server-side `generate()` call inside `invoke_skill` (the LLM's system prompt) | No — never leaves the platform |
| `CHOREOGRAPHY.md` | The developer's AI editor (Claude Code, Cursor, …) | Yes — pushed to `<repo>/.coznt/skills/<slug>/SKILL.md` |

The pushed file is named `SKILL.md` on disk in the dev repo because that's Claude Code's expected native-discovery filename. Server-side it's `CHOREOGRAPHY.md` to make the intent visible in our own codebase.

## Frontmatter

YAML frontmatter is required. The shape mirrors Claude Code's native skill schema (`name`, `description`, optional `allowed-tools`) with coznt-specific extensions under a `coznt:` namespace.

```yaml
---
name: Release Notes Generator
description: Generate release notes covering features, fixes, test summary, deployment checklist, and rollback plan. Use when the user asks for release notes, a changelog, what shipped, or a PR rollup.
coznt:
  version: 1.0.0
  triggers:
    - User mentions "release notes", "changelog", "what shipped"
    - End-of-sprint or pre-deploy timing
    - Project phase is `cicd` or `monitoring`
  required_verbs:
    - get_my_context
    - get_pipeline_status
    - get_requirements
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---
```

### Field reference

| Field | Required | Description |
|---|---|---|
| `name` | yes | Human-facing name. Surfaces in Claude Code's skill picker. |
| `description` | yes | Short description (≥10 chars). The AI reads this on every turn to decide when to invoke. Include trigger language ("Use when…"). |
| `allowed-tools` | no | Claude-Code-style tool allowlist. Hint for the host editor; coznt does not enforce. |
| `coznt.version` | yes | Semver `x.y.z`. Bump major on breaking workflow changes. |
| `coznt.triggers` | recommended | Free-form prose triggers describing when the AI should reach for this choreography. |
| `coznt.required_verbs` | yes | MCP verbs the choreography body references. Linter asserts each one is a registered tool in `src/mcp/server.ts`. |
| `coznt.min_autonomy` | recommended | Advisory minimum autonomy label (`"observe" \| "propose" \| "merge" \| "lead"`). Server is ground truth; this is for the AI to self-check before invoking. The integer form is deprecated as of the `rename-autonomy-levels` change. |

Full JSON Schema: [`src/automations/skills/choreography-frontmatter.schema.json`](../../src/automations/skills/choreography-frontmatter.schema.json).

## Body conventions

The body is a workflow guide written for an AI agent that has the coznt MCP server mounted. Sections we use today:

1. **When to use** — entry conditions; phases or signals that mean "reach for this."
2. **Steps** — numbered ordered list. Each step names the verb to call and the expected input/output.
3. **Constraints** — invariants the AI must respect (e.g. "never publish to external systems").
4. **Failure modes** — table of `symptom → likely cause → action`. Lets the AI recover gracefully.

Keep it terse. The choreography is read on every turn (Claude Code) or invoked on demand (Cursor slash-command). Long bodies bloat the AI's context window for marginal value.

## Linter

```bash
pnpm lint:choreographies            # warn on missing files
pnpm lint:choreographies --strict   # fail on missing files (used in CI after Phase 4)
```

The linter validates:
1. Frontmatter parses as YAML.
2. Frontmatter matches the JSON Schema.
3. Every `coznt.required_verbs` entry exists as a registered MCP tool in `src/mcp/server.ts`.

## Distribution lifecycle (preview)

The CLI (`add-coznt-sync-cli`) and bootstrap (`add-coznt-connect-cli`) ship after Phase 0. Once they exist:

1. Developer runs `coznt connect` once per repo — writes MCP wiring and pulls the initial bundle.
2. `coznt sync` — pulls the project's current choreography bundle into `<repo>/.coznt/skills/<slug>/SKILL.md`. Lock files at `<repo>/.coznt/skills/<slug>/.lock` track per-skill version + hash for drift detection.
3. The dev's AI editor discovers the files natively (frontmatter triggers proactive suggestion in Claude Code; slash-command in Cursor).
4. Every governed action — `invoke_skill`, `upsert_plan`, `mark_gate_passed` — still hits coznt over MCP. The choreography is workflow choreography; coznt remains the daemon.

## Why this split

If the LLM call ran locally (the SDLC-platform pattern), the autonomy ledger could only be reactive — recording what already happened. With the daemon as the single execution chokepoint, the gate is *preventive*: a skill operating below its required autonomy on a given project is denied before the LLM is ever invoked, and the call routes into the approval inbox instead. Trust is graded per project from evidence, not granted at install.

See [`docs/positioning.md`](../positioning.md#the-architecture-daemon--choreography) for the full architectural framing.
