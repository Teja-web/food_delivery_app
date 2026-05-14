---
name: Test Execution Report Generator
description: Generate a Test Execution Report summarizing test runs, pass/fail rates, defects, and coverage for the project
version: 1
tags: [platform, testing, execution, reporting, sdlc]
plan_kind: test_plan
---

# Test Execution Report Generator

Generate a comprehensive **Test Execution Report** for the current project. This document summarizes the results of test runs, captures defects, and provides the audit-grade record that QA sign-off depends on.

## When to Use

- At the end of the TESTING phase, before requesting QA sign-off.
- When the team needs an audit-grade record of what was tested and the outcome.
- As input to the release-notes generator and go-live report.

## Instructions

### Step 1 — Gather Context

Call `get_my_context` to retrieve the current project details. Then fetch the test plans and the pipeline status (which surfaces aggregated pass/fail counts):

```
invoke: get_requirements { kind: "test_plan", status: "approved" }
invoke: get_pipeline_status
```

If the caller has fresher per-test-run data not yet reflected in `get_pipeline_status` (for example a CI run from the last hour), ask them to paste it; the assessor task that backfills `test_runs` may lag.

### Step 2 — Generate the Document

Produce a Markdown document with the following structure. Every section is mandatory; use "N/A" if information is not available.

```markdown
# Test Execution Report

**Project:** {Project Name}
**Version:** 1.0
**Date:** {YYYY-MM-DD}
**Test plan:** plan/{test-plan-slug}

## 1. Executive Summary

- **Total cases executed:** {n}
- **Pass rate:** {%}
- **Open defects:** {S1: n, S2: n, S3: n, S4: n}
- **Sign-off recommendation:** READY / NOT READY / READY WITH WAIVERS

## 2. Coverage

| Level | Planned | Executed | Pass | Fail | Blocked | Skipped |
|---|---|---|---|---|---|---|
| Unit | ... | ... | ... | ... | ... | ... |
| Integration | ... | ... | ... | ... | ... | ... |
| E2E | ... | ... | ... | ... | ... | ... |
| Performance | ... | ... | ... | ... | ... | ... |
| Security | ... | ... | ... | ... | ... | ... |

## 3. Defects

For each open or recently closed defect:

### 3.{n} {Defect Title}

- **Severity:** S1 / S2 / S3 / S4
- **Status:** open / in-progress / fixed-pending-verify / closed
- **Affected requirement:** plan/{slug}
- **Repro steps:** ...
- **Owner:** ...

## 4. Performance Results

- **Target:** {latency, throughput}
- **Observed:** ...
- **Delta:** ...
- **Verdict:** met / not met / waived (justification)

## 5. Security Results

- **OWASP Top 10 categories tested:** ...
- **Findings:** none / list
- **Remediation status:** ...

## 6. Traceability

For each row in the test plan's traceability matrix, mark executed-and-passed / executed-and-failed / not-executed.

## 7. Risks & Recommendations

- Risks that remain post-execution
- Recommended waivers (with rationale)
- Conditions for sign-off
```

### Step 3 — File the Document

Call `upsert_plan` to land the report (uses `kind: "test_plan"` since coznt doesn't distinguish plan-vs-report at the kind level — the slug prefix does):

```
invoke: upsert_plan {
  kind: "test_plan",
  slug: "test-execution-{project-slug}-{YYYY-MM-DD}",
  title: "Test Execution Report — {Project Name} ({YYYY-MM-DD})",
  summary: "Execution results for {test plan slug}. Pass rate {%}. Sign-off: {READY|NOT READY}.",
  body: "{generated markdown}",
  changeNote: "Run {YYYY-MM-DD}"
}
```

## Quality Checklist

- [ ] Coverage table accounts for every planned test
- [ ] Every open defect has severity, owner, and affected requirement
- [ ] Sign-off recommendation is justified by the data above it
- [ ] Performance and security verdicts are explicit (no "see logs")
