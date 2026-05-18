---
name: Development Summary Generator
description: Draft a development summary at end of the development phase — features delivered, technical decisions made, code-quality posture, and handoff notes for QA and operations. Use when: "dev summary", "what did we build", "handoff to QA", "wrap-up the dev phase". Voice triggers (speech-to-text aliases): "summarize the sprint", "dev recap", "build report".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__get_assigned_work
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "dev summary", "development summary", "handoff", or "what did we build"
    - End of the DEVELOPMENT phase, before advancing to TESTING
    - Team needs a single record of what shipped + why
    - Drafting input to the test-execution report or release notes
  required_verbs:
    - get_my_context
    - get_requirements
    - get_assigned_work
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Development Summary Generator

Compose a `dev_summary` plan at end-of-development. The LLM call runs server-side via `invoke_skill`.

## When to use

- The project's `get_my_context` shows phase `development` and the user is preparing to advance to `testing`.
- `get_phase_checklist` lists a "dev summary filed" gate that needs to clear.
- A retrospective or handoff meeting is scheduled and someone needs the draft to walk into.

## When NOT to use

- **Project is still mid-development.** No completed stories yet → wait. Refuse with "no completed work to summarize."
- **Project is past testing.** Re-running this skill in cicd / monitoring is the wrong shape — use `release-notes-generator` or `go-live-report-generator` instead.
- **The user wants a per-PR summary, not a phase summary.** Different ask; don't invoke.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `development` (or `testing` if the gate is being filed retrospectively). Capture project name and dates.

### 2. Gather completed work
Call `get_requirements` three times:
- `{ kind: "feature", status: "completed" }`
- `{ kind: "story", status: "completed" }`
- `{ kind: "adr", status: "approved" }`

If the count is zero across all three, refuse — there's nothing to summarize.

### 3. Pull recent activity
Call `get_assigned_work` to fetch the session user's recent work items. If specific PR / commit / deployment details aren't visible, ask the user to paste them.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "dev-summary-generator"
input: {
  projectId,
  periodStart, periodEnd,   // ask user if unclear
  completedFeatures,
  completedStories,
  approvedAdrs,
  recentWorkItems,
  extraPrLinks              // optional, from user paste
}
```
Server returns the drafted markdown + `confidence`.

### 5. Route based on confidence
- `confidence >= 0.7` → present to user.
- `confidence < 0.7` → `submit_for_approval`.

### 6. File the summary
Once approved, call `upsert_plan`:
```
upsert_plan {
  kind: "dev_summary",
  slug: "dev-summary-<project-slug>-<YYYYMMDD>",
  title: "Development Summary — <Project Name> (<period>)",
  body: <generated markdown>,
  changeNote: "Drafted at end of development phase"
}
```

## Constraints

- **Don't invent PR / commit counts.** Cite only what's visible via `get_assigned_work` or what the user pastes. Use "N/A" for unknowable sections.
- **No marketing language.** This is a handoff document for QA and ops — facts, not pitches.
- **Outstanding work is not a flaw.** Name what isn't done and why; don't omit to make the report look cleaner.
- **One skill = one decision tree.** If the user asks you to also draft the test plan, stop and tell them to invoke `test-plan-generator` separately.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `get_requirements` returns no completed plans | Project is too early | Refuse; tell user nothing to summarize yet |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the gathered input |
| User asks to summarize PRs not visible to coznt | GitHub integration not connected | Ask them to paste, OR connect via `/integrations` first |
| Phase is `monitoring` not `development` | Skill is being invoked retrospectively | OK to proceed but note in `changeNote` that this is a retroactive draft |
