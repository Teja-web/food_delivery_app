---
name: Go-Live / Production Readiness Report Generator
description: Generate a Go-Live Readiness Report covering operational readiness, monitoring, rollback, and approvals for production cutover
version: 1
tags: [platform, go-live, production, readiness, monitoring, sdlc]
plan_kind: go_live_report
---

# Go-Live / Production Readiness Report Generator

Generate a comprehensive **Go-Live Readiness Report** for the current project release. This document captures the operational posture immediately before production cutover — monitoring, runbooks, on-call coverage, rollback readiness, and the formal go/no-go decision.

## When to Use

- Immediately before a production release, as the document the go/no-go meeting works from.
- When the team needs a formal record that operational readiness was assessed.
- As an audit artifact for compliance reviews (CISO drill, change advisory board).

## Instructions

### Step 1 — Gather Context

Call `get_my_context` to retrieve the current project details. Then gather everything upstream of go-live:

```
invoke: get_requirements { kind: "release_plan", status: "in_progress" }
invoke: get_requirements { kind: "test_plan", status: "approved" }
invoke: get_pipeline_status
invoke: get_phase_checklist
```

`get_phase_checklist` is the load-bearing call — it returns the gate state for the current phase, which is exactly what go/no-go decisions depend on.

### Step 2 — Generate the Document

Produce a Markdown document with the following structure. Every section is mandatory; use "N/A" if information is not available.

```markdown
# Go-Live Readiness Report

**Project:** {Project Name}
**Release:** v{version}
**Target cutover:** {YYYY-MM-DD HH:MM} {timezone}
**Source release plan:** plan/{slug}

## 1. Go / No-Go Recommendation

**Verdict:** GO / NO-GO / GO WITH CONDITIONS

**Justification:** {one paragraph tying back to evidence below}

## 2. Phase-Gate Posture

For each gate returned by `get_phase_checklist`:

| Gate | Type | Status | Owner | Blocking? |
|---|---|---|---|---|
| ... | approval/coverage/lint/security/custom | PASSED/PENDING/FAILED | ... | yes/no |

Any non-passed blocking gates → automatic NO-GO unless waived.

## 3. Test Posture

Pull from the test-execution report:
- Pass rate
- Open defects by severity (S1/S2/S3/S4)
- Performance posture vs target
- Security findings

S1 / S2 open defects → automatic NO-GO unless waived with sign-off.

## 4. Operational Readiness

### 4.1 Monitoring
- Dashboards green pre-cutover? (link)
- New signals added for this release? (list)
- Alert thresholds calibrated? (yes/no)

### 4.2 On-call
- Primary on-call: ...
- Secondary on-call: ...
- Escalation path: ...
- Pager test in last 24h: yes/no

### 4.3 Runbooks
- Cutover runbook: link
- Rollback runbook: link
- Common-failure runbooks reviewed: yes/no

### 4.4 Capacity
- Expected load delta: ...
- Provisioning verified: yes/no

## 5. Rollback Readiness

- **Trigger criteria:** ...
- **Estimated time to rollback:** ...
- **Last drill date:** ...
- **Data-loss risk on rollback:** none / list

## 6. Compliance & Approvals

- Change advisory board: approved/pending/n-a
- Security review: passed/pending/waived
- Legal/privacy review: passed/pending/n-a
- Production access: who has it for cutover

## 7. Communications Plan

- Customer notification: scheduled / not required
- Internal announcement: ...
- Status page: prepared / not prepared

## 8. Waivers

For each open issue waived for go-live: who approved, why, when it must be resolved.

## 9. Post-Cutover Checks (T+1h, T+24h)

- Specific metrics to inspect at T+1h
- Specific metrics to inspect at T+24h
- Trigger criteria for emergency rollback during this window
```

### Step 3 — File the Document

Call `upsert_plan` to land the go-live report:

```
invoke: upsert_plan {
  kind: "go_live_report",
  slug: "go-live-{project-slug}-v{version}",
  title: "Go-Live Report — {Project Name} v{version}",
  summary: "Verdict: {GO|NO-GO|GO WITH CONDITIONS}. Target cutover {YYYY-MM-DD}.",
  body: "{generated markdown}",
  changeNote: "Go/no-go assessed {YYYY-MM-DD}"
}
```

## Quality Checklist

- [ ] Go/no-go verdict is explicit and tied to evidence in sections 2–6
- [ ] Every blocking gate from `get_phase_checklist` is in the table
- [ ] Rollback section has named owner, named procedure, last-drill date
- [ ] On-call section names humans, not roles
- [ ] Every waiver has approver + rationale + resolution deadline
