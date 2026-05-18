---
name: Go-Live / Production Readiness Report Generator
description: Draft a Go-Live Readiness Report — phase-gate posture, monitoring readiness, rollback plan, on-call coverage, and the formal go/no-go recommendation for production cutover. Use when: "go-live report", "production readiness", "go/no-go", "ready to ship", "CAB review". Voice triggers (speech-to-text aliases): "go no go", "production readiness", "ship readiness".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__get_pipeline_status
  - mcp__coznt__get_phase_checklist
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "go-live", "go/no-go", "production readiness", "CAB", or "change advisory"
    - Immediately before a production release, prepping the go/no-go meeting
    - Compliance review needs evidence of operational readiness
  required_verbs:
    - get_my_context
    - get_requirements
    - get_pipeline_status
    - get_phase_checklist
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Go-Live / Production Readiness Report Generator

Compose a `go_live_report` plan immediately before production cutover. The verdict + LLM drafting runs server-side via `invoke_skill`; gate posture is read from `get_phase_checklist`.

## When to use

- Immediately before a production release, as the document the go/no-go meeting works from.
- Compliance review (CISO drill, change advisory board) needs a formal record that readiness was assessed.
- An auditor asks "show me the go-live evidence for release X."

## When NOT to use

- **Project is not in `cicd` or `monitoring` phase.** Premature; refuse and point user at `get_phase_checklist` instead.
- **No `release_plan` is in flight.** Need a target release to assess. Ask user to file one first.
- **The user wants a *post-release* writeup.** That's a different shape — they want `dev-summary-generator` or release notes, not go-live.
- **Test plan hasn't been approved.** Without test sign-off, recommendation must be NO-GO; consider whether running this skill now is premature.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `cicd` or `monitoring`.

### 2. Pull gate posture + release
Call:
- `get_phase_checklist` — **load-bearing**. The gate state IS the go/no-go evidence.
- `get_requirements { kind: "release_plan", status: "in_progress" }`
- `get_requirements { kind: "test_plan", status: "approved" }`
- `get_pipeline_status`

### 3. Refuse early if release missing
If no in-flight `release_plan`, stop. Tell the user to author one (target version, cutover window, rollback playbook).

### 4. Ask the user for unstated context
Coznt cannot know these without help — ask:
- On-call assignment for the cutover window
- Rollback playbook URL
- Customer comms plan (if regulated)
- Cutover window date/time/timezone

### 5. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "go-live-report-generator"
input: {
  projectId,
  releasePlanSlug,
  phaseChecklist,          // verbatim from step 2
  testPlanApproved,        // bool
  pipelineStatus,          // from step 2
  cutoverWindow,
  onCallAssignment,
  rollbackPlaybookUrl,
  customerCommsPlan
}
```
Server returns `{ verdict, markdown, confidence }`. `verdict` ∈ { "GO", "NO-GO", "GO WITH CONDITIONS" }.

### 6. Route based on verdict + confidence
- `verdict === "NO-GO"` → present immediately to user; this is the most important signal. Confidence threshold doesn't matter.
- `verdict === "GO" && confidence >= 0.8` → present to user for review.
- Anything else → `submit_for_approval` with the verdict + the gate evidence attached.

### 7. File the report
Call `upsert_plan`:
```
upsert_plan {
  kind: "go_live_report",
  slug: "go-live-<project-slug>-v<version>",
  title: "Go-Live Readiness — <Project Name> v<version>",
  body: <generated markdown>,
  changeNote: "<verdict> — cutover <YYYY-MM-DD HH:MM>"
}
```

## Constraints

- **NO-GO is a valid output.** Don't soft-pedal a failing gate to make the report "look better." Honest verdict = useful report.
- **No invented evidence.** Gates and test status come from coznt's own data. Never claim "PASSED" for something the checklist shows as PENDING.
- **Rollback section must be concrete.** Named owner, named procedure URL, ETA. "Follow standard procedure" is a fail.
- **Don't publish anywhere external.** Coznt files the plan; humans circulate it.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `get_phase_checklist` shows blocking gates not passed | Project is not actually ready | Verdict will be NO-GO; that's the correct output — file the report |
| No `release_plan` in flight | Skill invoked too early | Refuse; tell user to file a release plan first |
| Pipeline status shows failing recent deploys | Production at risk | Verdict trends NO-GO or GO WITH CONDITIONS; flag explicitly |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled evidence — this is exactly the scenario approvals are for |
