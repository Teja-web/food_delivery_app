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
| `allowed-tools` | **recommended** | Claude-Code-style tool allowlist (array of strings). Convention is `mcp__coznt__<verb>` for every verb the choreography references — lets Claude Code tighten the tool surface so the AI cannot reach for `Bash` / `Edit` / `Write` when it shouldn't. Coznt does not enforce it server-side; it's a host hint. |
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

## See it work

A realistic Claude Code session against a coznt-bound repo with the choreographies synced. The developer types in plain language; the AI reads the choreography descriptions on every turn and reaches for the right one.

### Drafting release notes

```
You: We're cutting v2.4 this Thursday. Can you draft the release notes?

Claude Code: I'll use the Release Notes Generator choreography for this.

[mcp__coznt__get_my_context] → project "Payments Service" (phase: cicd) ✓
[mcp__coznt__get_pipeline_status] → release_plan "v2.4-cutover" status: in_progress ✓
[mcp__coznt__get_requirements { kind: "feature", status: "completed" }] → 7 features
[mcp__coznt__get_requirements { kind: "story", status: "completed" }] → 23 stories
[mcp__coznt__get_requirements { kind: "incident", status: "completed" }] → 2 incidents
[mcp__coznt__get_requirements { kind: "release_plan", status: "in_progress" }] → 1 plan

Quick question before I invoke the generator: what's the target environment
("production" by default) and is there a rollback playbook URL I should
reference?

You: production, and the rollback runbook is at runbooks.acme/payments-rollback.

Claude Code: Thanks. Invoking now.

[mcp__coznt__invoke_skill { slug: "release-notes-generator", input: {...} }]
  → confidence: 0.82
  → outcome recorded in ledger (success)

Draft is below. Confidence is 0.82, so I'm showing it directly rather than
routing through approvals.

   # Release Notes — Payments Service v2.4
   …
```

The autonomy ledger has now recorded one more `success` outcome on `release-notes-generator` against this project — if it's the 5th and the success rate stays ≥90% with ≥14 days at level, the next recompute promotes the skill to Merge on this project.

### A blocked invocation routed through approvals

```
You: Run a postmortem on the deploy incident from yesterday.

Claude Code: Using the Incident Postmortem Author choreography.

[mcp__coznt__get_my_context] → project "Payments Service" (phase: monitoring)
[mcp__coznt__get_plans { kind: "incident", status: "in_progress" }]
  → 1 incident: "v2.3.1 cutover regression"
[mcp__coznt__get_outcomes { limit: 50 }] → 14 events around the window
[mcp__coznt__get_pipeline_status] → 1 deploy + 1 rollback in window
[mcp__coznt__get_design_context] → 3 ADRs in scope

[mcp__coznt__invoke_skill { slug: "incident-postmortem", … }]
  → denied_below_autonomy
    (skill is at Observe on this project; required: Propose)
  → routed to approvals

I can't draft the postmortem directly — the skill hasn't earned enough
autonomy on this project yet. I've submitted the request to the approvals
inbox with all 14 timeline events attached. A reviewer can dispatch it from
there. (/approvals)
```

The denial is preventive — coznt refused *before* the LLM was invoked. No outcome row is written for a denied call; the approvals inbox is the audit trail of "what would have happened if the autonomy had been there."

### A choreography refusing on its own terms

```
You: Generate test cases for the new payments routes.

Claude Code: Using the Test Plan & Script Generator choreography.

[mcp__coznt__get_my_context] → project "Payments Service" (phase: testing) ✓
[mcp__coznt__get_requirements { kind: "story", status: "approved" }] → 0
[mcp__coznt__get_requirements { kind: "feature", status: "approved" }] → 0

I'm stopping here. The test-plan-generator choreography requires at least
one approved `story` or `feature` plan to cover — there's nothing in the
"approved" bucket right now (4 stories are in draft, 2 features are in
review). Approve the requirements first, then re-invoke.
```

The refusal is in the choreography body — the AI follows the playbook rather than hallucinating tests against nothing.
