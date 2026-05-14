---
name: Release Notes Generator
description: Generate Release Notes covering features, fixes, test summary, deployment checklist, and rollback plan
version: 1
tags: [platform, release, notes, cicd, deployment, sdlc]
plan_kind: release_plan
---

# Release Notes Generator

Generate **Release Notes** for the current project release. This document provides a comprehensive summary of what is being released, including new features, bug fixes, test results, deployment checklist, and rollback procedures.

## When to Use

- At the end of the CI/CD phase, before production cutover.
- When stakeholders need a clear summary of what's in this release.
- As the document distributed to customers / downstream teams.

## Instructions

### Step 1 — Gather Context

Call `get_my_context` to retrieve the current project details. Then gather what's in this release:

```
invoke: get_requirements { kind: "feature", status: "completed" }
invoke: get_requirements { kind: "story", status: "completed" }
invoke: get_requirements { kind: "incident", status: "completed" }
invoke: get_requirements { kind: "release_plan", status: "in_progress" }
invoke: get_pipeline_status
```

`get_pipeline_status` gives the most recent build/test posture and the in-flight release_plan slug. The completed `story` / `feature` / `incident` plans are what made it in.

If the caller has a version number, target environment, or rollback playbook URL not visible to the platform, ask for them.

### Step 2 — Generate the Document

Produce a Markdown document with the following structure. Every section is mandatory; use "N/A" if information is not available.

```markdown
# Release Notes — {Project Name} v{version}

**Release date:** {YYYY-MM-DD}
**Environment target:** production
**Release lead:** ...
**Source release plan:** plan/{slug}

## 1. Highlights

{2–4 bullets the audience cares about most.}

## 2. New Features

For each completed feature in this release:

### 2.{n} {Feature Title}
- **Source:** plan/{slug}
- **What changed:** ...
- **User impact:** ...

## 3. Bug Fixes

For each completed incident plan in this release:

### 3.{n} {Incident Title}
- **Source:** plan/{slug}
- **Symptom:** ...
- **Fix:** ...

## 4. Breaking Changes

List, with migration guidance. "N/A" if none.

## 5. Deprecations

List, with sunset dates. "N/A" if none.

## 6. Test Summary

Pull from the test-execution report if one was filed for this release. Fields:
- Total cases executed
- Pass rate
- Open defects (by severity)
- Sign-off status

## 7. Deployment Checklist

- [ ] Database migrations applied (commit hash)
- [ ] Feature flags configured (list)
- [ ] Secrets rotated where required
- [ ] Monitoring dashboards verified green pre-deploy
- [ ] On-call notified

## 8. Rollback Plan

- **Trigger criteria:** when to roll back
- **Procedure:** step-by-step
- **Owner:** ...
- **Estimated time to rollback:** ...

## 9. Known Issues

Issues shipping with the release, with workarounds.

## 10. References

- Test plan: plan/{slug}
- Test execution report: plan/{slug}
- Architecture decisions: plan/{slug}, ...
```

### Step 3 — File the Document

Call `upsert_plan` to land the release notes:

```
invoke: upsert_plan {
  kind: "release_plan",
  slug: "release-notes-{project-slug}-v{version}",
  title: "Release Notes — {Project Name} v{version}",
  summary: "Release {version}: {n} features, {n} fixes.",
  body: "{generated markdown}",
  changeNote: "Cut {YYYY-MM-DD}"
}
```

## Quality Checklist

- [ ] Every completed feature and incident has a section
- [ ] Test summary numbers match the test-execution report
- [ ] Rollback plan is concrete (named owner, named procedure, ETA)
- [ ] Breaking changes have migration guidance, not just notification
- [ ] No internal-only language ("we did X") — written for the release audience
