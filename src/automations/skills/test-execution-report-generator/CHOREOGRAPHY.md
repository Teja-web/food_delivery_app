---
name: Test Execution Report Generator
description: Draft a Test Execution Report — pass/fail summary, defect inventory by severity, sign-off recommendation, and the audit record QA stakeholders sign against. Use when: "test execution report", "QA sign-off doc", "test results summary", "how did testing go". Voice triggers (speech-to-text aliases): "test report", "QA report", "test execution".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__get_pipeline_status
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "test execution report", "QA sign-off", "test results", or "TER"
    - End of TESTING phase, before advancing to CI/CD
    - QA needs an audit-grade record of what was tested + outcome
    - Input artifact for release-notes-generator or go-live-report-generator
  required_verbs:
    - get_my_context
    - get_requirements
    - get_pipeline_status
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Test Execution Report Generator

Compose a `test_plan`-bucketed Test Execution Report rolling up pass/fail + defects + QA sign-off recommendation. LLM drafting runs server-side via `invoke_skill`.

## When to use

- End of TESTING phase, before QA sign-off and phase advance.
- Audit needs the record of what was tested and the outcome.
- Upstream of release-notes / go-live skills.

## When NOT to use

- **Project not in `testing` phase.** Premature in earlier phases; retroactive in later ones — use `dev-summary-generator` or `release-notes-generator` instead.
- **No approved `test_plan`.** Without an approved plan, there's nothing to report against. Refuse and tell user to invoke `test-plan-generator` first.
- **Pipeline status has no recent test runs.** Either testing hasn't happened or it ran somewhere coznt can't see; ask user to paste raw results.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `testing`.

### 2. Load test plan + pipeline status
Call:
- `get_requirements { kind: "test_plan", status: "approved" }`
- `get_pipeline_status` — aggregates pass/fail counts from recent test runs

If approved test_plan count is 0, refuse — invoke `test-plan-generator` first.

### 3. Reconcile with user
If pipeline status is missing recent runs (assessor lag, or CI ran somewhere coznt can't observe), ask user to paste raw test results. Don't invent numbers.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "test-execution-report-generator"
input: {
  projectId,
  testPlan,                // approved plan body
  pipelineStatus,
  extraTestResults,        // user-pasted, optional
  defectInventory          // ask user; coznt doesn't auto-classify defects today
}
```
Server returns `{ markdown, confidence, signoffRecommendation }` — `signoffRecommendation` ∈ { "READY", "NOT_READY", "READY_WITH_WAIVERS" }.

### 5. Route based on recommendation
- `NOT_READY` → present immediately; this is the load-bearing signal.
- `READY` and `confidence >= 0.8` → present to user for sign-off.
- Anything else → `submit_for_approval` with the test-plan + results attached.

### 6. File the report
Call `upsert_plan`:
```
upsert_plan {
  kind: "test_plan",
  slug: "test-execution-report-<project-slug>-v<version>",
  title: "Test Execution Report — <Project Name> v<version>",
  body: <generated markdown>,
  changeNote: "<recommendation> — N defects (S1: x, S2: y, …)"
}
```

## Constraints

- **NOT_READY is a valid output.** Don't soften an honest fail just to look better — downstream skills (release notes, go-live) consume this verdict.
- **Defect severity is from the user, not invented.** Coznt does not auto-classify; ask if S1/S2/S3/S4 counts are unknown.
- **Pass rate is computed, not estimated.** Use only pipeline-status totals or user-pasted run data.
- **Cite each defect.** Defect rows reference work_item slugs or external tracker IDs. No anonymous bugs.
- **One skill = one decision tree.** Don't also draft release notes — that's `release-notes-generator`.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| No approved `test_plan` | Phase too early | Refuse; tell user to invoke `test-plan-generator` first |
| `get_pipeline_status` shows no recent test runs | Assessor lag OR tests ran in a system coznt doesn't observe | Ask user to paste raw run data |
| Pass rate < 80% | Tests failing, project not ready | Recommendation will be NOT_READY; that's correct — file the report |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled input |
