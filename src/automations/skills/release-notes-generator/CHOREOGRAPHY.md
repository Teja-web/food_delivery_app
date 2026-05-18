---
name: Release Notes Generator
description: Draft release notes for a coznt-tracked project — features shipped, bug fixes, test summary, deployment checklist, rollback plan. Use when: "release notes", "changelog", "what shipped", "PR rollup", end-of-sprint, pre-deploy. Voice triggers (speech-to-text aliases): "release notes", "rel notes", "ship notes", "what's in the release".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_pipeline_status
  - mcp__coznt__get_requirements
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "release notes", "changelog", "what shipped", or "PR rollup"
    - End-of-sprint or pre-deploy timing on a coznt-tracked project
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

# Release Notes Generator

Draft release notes server-side via coznt's `invoke_skill`; this file tells you *when* to call which verb. The LLM call happens on coznt — never locally.

## When to use

- The user asks for release notes, a changelog, or "what shipped" / "rel notes".
- The project is in the `cicd` or `monitoring` phase (verify with `get_my_context`).
- A `release_plan` is in flight (verify with `get_pipeline_status`).

## When NOT to use

- **Project is in `requirements`, `design`, `development`, or `testing` phase** — release notes are premature; warn the user and stop. Suggest `get_phase_checklist` so they see what's still pending.
- **The user wants a per-PR summary, not a release rollup** — that's a different ask; do not invoke this skill.
- **No `release_plan` is in flight AND the user hasn't given a version** — ask the user for intent first; if they want an ad-hoc rollup, proceed with `version: "draft"`.
- **Outside a coznt-bound repo** — this choreography only works against an MCP-mounted coznt project. If `get_my_context` errors with `project_not_bound`, point the user at `coznt connect`.

## Steps

### 1. Load context
Call `get_my_context`. Capture `projectId`, `phase`, and bound project name.

### 2. Verify a release is in flight
Call `get_pipeline_status`. If no `release_plan` has `status: "in_progress"`, ask the user for a target version + audience before continuing.

### 3. Gather completed work
Call `get_requirements` four times:
- `{ kind: "feature", status: "completed" }`
- `{ kind: "story", status: "completed" }`
- `{ kind: "incident", status: "completed" }`
- `{ kind: "release_plan", status: "in_progress" }`

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "release-notes-generator"
input: {
  projectId,
  version,                 // ask user if not derivable from release_plan
  targetEnvironment,       // default: "production"
  completedFeatures,       // from step 3
  completedStories,        // from step 3
  completedIncidents,      // from step 3
  releasePlanSlug,         // from step 3
  rollbackPlaybookUrl      // ask user if needed
}
```
Server runs the prompt, returns the drafted markdown plus a `confidence` score, and records an outcome in the ledger automatically.

### 5. Route based on confidence
- `confidence >= 0.7` → present draft to the user for review.
- `confidence < 0.7` → call `submit_for_approval` with the draft attached.

### 6. File the document
Once approved (or if confidence was high), call `upsert_plan`:
```
upsert_plan {
  kind: "release_plan",
  slug: "release-notes-<project-slug>-v<version>",
  title: "Release Notes — <Project Name> v<version>",
  summary: "Release <version>: N features, N fixes.",
  body: <generated markdown>,
  changeNote: "Cut <YYYY-MM-DD>"
}
```

## Constraints

- **Do not publish to external systems.** Coznt does not write to GitHub releases, Jira, or Confluence on your behalf. The `release_plan` row is the record; integrations consume it via webhook.
- **Never invent test numbers.** If a `test_execution_report` plan doesn't exist for this release, mark the test summary section as "N/A — no test-execution report filed."
- **Concrete rollback only.** The rollback section must name an owner, a procedure, and an ETA — not "follow standard procedure."
- **One skill = one decision tree.** If the user asks you to *also* author the test execution report, stop and tell them to invoke that skill separately.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy on this project is below `propose` | Call `submit_for_approval` with the assembled input; reviewer dispatches manually |
| `get_pipeline_status` shows no in-flight `release_plan` | Release wasn't planned | Ask user to author one first, or proceed with `version: "draft"` if they confirm ad-hoc |
| Test summary requested but no `test_execution_report` plan | Test execution skipped or not filed | Use "N/A" in the test summary; flag to user before filing |
| `get_my_context` errors `project_not_bound` | Repo isn't connected | Point user at `coznt connect` and stop |
