---
name: Development Summary Generator
description: Generate a Development Summary capturing what was built, technical decisions, code quality, and handoff notes
version: 1
tags: [platform, development, summary, sdlc]
plan_kind: dev_summary
---

# Development Summary Generator

Generate a comprehensive **Development Summary Document** for the current project. This document captures what was built during the development phase, the technical decisions made, code-quality posture, and handoff notes for QA and operations.

## When to Use

- At the end of the DEVELOPMENT phase, before transitioning to TESTING.
- When the team needs a single record of what shipped and why.
- As input to the test-execution report and release notes.

## Instructions

### Step 1 — Gather Context

Call `get_my_context` to retrieve the current project details. Then gather the work that was done and the decisions that were made:

```
invoke: get_requirements { kind: "feature", status: "completed" }
invoke: get_requirements { kind: "story", status: "completed" }
invoke: get_requirements { kind: "adr", status: "approved" }
invoke: get_assigned_work   // recent work items for the session user
```

If specific PR / commit / deployment details are needed and not visible via the above, ask the caller to paste them.

### Step 2 — Generate the Document

Produce a Markdown document with the following structure. Every section is mandatory; use "N/A" if information is not available.

```markdown
# Development Summary

**Project:** {Project Name}
**Period:** {start date} – {end date}
**Date:** {YYYY-MM-DD}

## 1. Executive Summary

- **Features delivered:** {n}
- **Stories closed:** {n}
- **PRs merged:** {n} (link list below)
- **Outstanding work:** {n stories not closed; why}

## 2. Delivered Features

For each completed feature plan:

### 2.{n} {Feature Title}

- **Source:** plan/{slug}
- **What was built:** ...
- **Stories covered:** plan/{slug}, plan/{slug}, ...
- **PRs:** {list, with merge commit refs}
- **Tests added:** {unit count, integration count, e2e count}

## 3. Architecture Decisions

For each ADR captured during development (`kind: adr`, `status: approved`):

### 3.{n} {ADR Title}

- **Source:** plan/{slug}
- **Decision:** {one-line summary}
- **Tradeoff:** ...
- **Reversibility:** reversible / one-way

## 4. Code Quality Posture

- **Test coverage on changed lines:** {%}
- **Lint / type-check:** clean / outstanding violations
- **Performance regressions:** none / list
- **Security findings introduced:** none / list

## 5. Outstanding Work

- Stories not closed and why
- Known limitations the team accepted (with owner + remediation plan)
- Tech-debt items logged as new plans (with slugs)

## 6. Handoff Notes

- For QA: what to focus on, what's been smoke-tested, what hasn't
- For ops: runtime requirements, new env vars, new dependencies
- For SRE: new monitoring signals to watch, expected error rates

## 7. Risks

Risks carried into TESTING / CI/CD: what they are, owner, mitigation.
```

### Step 3 — File the Document

Call `upsert_plan` to land the summary:

```
invoke: upsert_plan {
  kind: "dev_summary",
  slug: "dev-summary-{project-slug}-{YYYY-MM-DD}",
  title: "Development Summary — {Project Name} ({start}–{end})",
  summary: "{n} features delivered, {n} stories closed, {n} PRs merged.",
  body: "{generated markdown}",
  changeNote: "Period {start}–{end}"
}
```

## Quality Checklist

- [ ] Every completed feature has a section
- [ ] Every approved ADR is referenced
- [ ] Outstanding work is explicit (no "minor cleanup remaining")
- [ ] Handoff notes are concrete enough to act on without re-reading the code
