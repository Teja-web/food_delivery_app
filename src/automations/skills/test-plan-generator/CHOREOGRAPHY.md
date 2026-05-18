---
name: Test Plan & Script Generator
description: Draft a Test Plan with unit, integration, e2e, performance, and security cases mapped 1:1 to every approved requirement, plus sample test scripts. Use when: "draft a test plan", "test cases for X", "coverage from requirements to tests", "test strategy". Voice triggers (speech-to-text aliases): "test plan", "draft tests", "test coverage".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "test plan", "test cases", "test coverage", or "test strategy"
    - Start of TESTING phase, before execution begins
    - Need a coverage map from requirements to tests
    - Input to CI/CD pipeline config (which test stages to run)
  required_verbs:
    - get_my_context
    - get_requirements
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Test Plan & Script Generator

Compose a `test_plan` plan that maps every approved requirement to test cases across unit / integration / e2e / performance / security tiers. LLM drafting runs server-side via `invoke_skill`.

## When to use

- Start of TESTING phase, before execution begins.
- Team needs a complete requirement-to-test coverage map.
- Input artifact for the CI/CD pipeline (which stages to run).

## When NOT to use

- **No approved `story` or `feature` plans.** Test plan needs requirements to cover — refuse and tell user how many are approved vs draft.
- **An existing approved `test_plan` already covers the same requirements.** Use `upsert_plan` with `changeNote: "revision"` if revising; refuse with "already exists" if not.
- **The user wants test *execution*, not a plan.** Different shape — they want to run tests + capture results. Point them at the test runner + `test-execution-report-generator`.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `testing` (or `development` if drafting ahead of advance).

### 2. Gather approved requirements + existing test plans
Call:
- `get_requirements { kind: "story", status: "approved" }`
- `get_requirements { kind: "feature", status: "approved" }`
- `get_requirements { kind: "test_plan" }` — to avoid duplicating, OR to revise

If combined approved (story + feature) count is 0, refuse — nothing to cover.

### 3. Identify the test runner / framework
Ask the user (or read from project description / ADRs):
- Unit framework: vitest / jest / pytest / junit / etc.
- E2E framework: playwright / cypress / selenium / etc.
- Performance: k6 / jmeter / locust / etc.
- Security: zap / snyk / semgrep / etc.

Do not default silently — different frameworks produce different sample scripts.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "test-plan-generator"
input: {
  projectId,
  approvedStories,
  approvedFeatures,
  existingTestPlans,       // for revision detection
  frameworks: {            // from step 3
    unit, e2e, performance, security
  }
}
```
Server returns `{ markdown, confidence, coverageMap, gaps }`. `gaps` lists requirements with no test case (a real signal — surface).

### 5. Surface coverage gaps
If `gaps.length > 0`, flag to the user: "Requirements with no test case: [...]". Patch (re-invoke with more user input) or annotate before filing.

### 6. Route based on confidence
- `confidence >= 0.7` and gaps acknowledged → present to user.
- `confidence < 0.7` or gaps unresolved → `submit_for_approval`.

### 7. File the test plan
Call `upsert_plan`:
```
upsert_plan {
  kind: "test_plan",
  slug: "test-plan-<project-slug>-v<version>",
  title: "Test Plan — <Project Name> v<version>",
  body: <generated markdown with coverage table + sample scripts>,
  changeNote: "Drafted from N approved requirements at start of TESTING"
}
```

## Constraints

- **Every approved requirement gets ≥1 test case.** If not, surface as a gap — never silently drop.
- **Coverage table is canonical.** Each row maps `requirement-slug → test-case-ids → test-tier`. No prose substitutes for the table.
- **Sample scripts are executable scaffolds, not production tests.** Mark with `// scaffold — flesh out per actual implementation`.
- **Don't invent acceptance criteria.** Test cases trace to existing requirement acceptance criteria; if a requirement lacks them, flag the requirement, not the tests.
- **One skill = one decision tree.** Don't also generate the CI pipeline — `cicd-pipeline-authoring` is a separate invocation.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| No approved requirements | Phase too early | Refuse; tell user how many are approved vs draft |
| Existing approved `test_plan` for same requirements | Already filed | Confirm with user: revision or skip |
| `gaps.length > 0` after generation | Requirements named themes that didn't decompose to testable behavior | Surface gaps; consider whether requirements need refinement first |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the coverage map |
