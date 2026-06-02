---
name: project-lifecycle
description: Project Lifecycle Coach — resolves the recommended kickoff skill from observable project state. Drives the recommendedKickoff field on get_my_context.
version: 1
tags: [platform, lifecycle, coach, orchestration]
coznt:
  version: 1.0.0
  min_autonomy: propose
  required_verbs:
    - get_my_context
    - invoke_skill
  routing:
    - phase: requirements
      state: empty
      kickoff: "invoke_skill: feature-spec-generator"
      rationale: "Empty project — start with a feature and its stories. If the work is multi-theme, ask the user before falling back to epic-decomposer."
    - phase: requirements
      state: has_epic_no_feature
      kickoff: "invoke_skill: feature-spec-generator"
      rationale: "Epic exists with no feature breakdown — decompose under it."
    - phase: requirements
      state: has_leaves_no_parent
      kickoff: "invoke_skill: feature-spec-generator"
      rationale: "Stories or specs exist with no feature/epic parent — group them under a feature so the hierarchy supports traceability and review."
    - phase: requirements
      state: ready_for_advance
      kickoff: "invoke_skill: requirements-document"
      rationale: "Approved requirements ready for end-of-phase consolidation."
    - phase: design
      state: empty
      kickoff: "invoke_skill: adr-extractor"
      rationale: "Design phase open — extract decisions from the conversation as ADRs."
    - phase: development
      state: empty
      kickoff: "upsert_plan: story"
      rationale: "Development phase open — author the next story directly."
---

# Project Lifecycle Coach

This choreography is the server-side resolver behind the `recommendedKickoff` field on `get_my_context`. The agent does not execute it — the platform does, against authoritative project state, and returns the resolved kickoff in the MCP response.

## State enumeration

The resolver computes a `state` name from observable project data and matches the first routing rule whose `phase` + `state` apply. State names are closed:

| State | Resolves when |
|---|---|
| `empty` | Project has zero plans for the current phase's relevant kinds |
| `has_epic_no_feature` | At least one `epic` plan, zero `feature` plans, requirements phase |
| `has_leaves_no_parent` | Plans exist but no `epic` or `feature` anchors them — the "flat stories" pattern. Routes to `feature-spec-generator` so the work gets nested. |
| `ready_for_advance` | At least one approved plan; phase checklist green or near-green |
| `none` | No rule matches — `recommendedKickoff` returns `null` |

## Override path

To customize routing for an org or project, install a custom CHOREOGRAPHY.md with slug `project-lifecycle` via the `/api/v1/mcp/choreographies/custom` endpoint. The resolver prefers custom over default. Rule format is identical.

## Why this lives in the choreography, not the platform

The platform owns the *contract* (the `recommendedKickoff` field exists, the resolver runs on every `get_my_context` call). The choreography owns the *opinion* (which kickoff matches which state). Orgs override by replacing this file; no platform redeploy needed.
