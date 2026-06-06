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
    - state: empty
      kickoff: "invoke_skill: epic-decomposer"
      rationale: "Empty project — author the first epic so feature decomposition has a parent to hang off."
    - state: has_epic_no_feature
      kickoff: "invoke_skill: feature-spec-generator"
      rationale: "Epic exists with no feature breakdown — decompose under it."
    - state: has_leaves_no_parent
      kickoff: "invoke_skill: epic-decomposer"
      rationale: "Stories or specs exist with no epic/feature anchoring them — author the missing epic so the work nests under it."
    - state: ready_for_advance
      kickoff: "invoke_skill: requirements-document"
      rationale: "Approved plans ready for end-of-cycle consolidation."
---

# Project Lifecycle Coach

This choreography is the server-side resolver behind the `recommendedKickoff` field on `get_my_context`. The agent does not execute it — the platform does, against authoritative project state, and returns the resolved kickoff in the MCP response.

## State enumeration

The resolver computes a `state` name from observable project data and matches the first routing rule whose `state` applies. State names are closed:

| State | Resolves when |
|---|---|
| `empty` | Project has zero plans |
| `has_epic_no_feature` | At least one `epic` plan, zero `feature` plans |
| `has_leaves_no_parent` | Plans exist but no `epic` or `feature` anchors them — the "flat stories" pattern. Routes to `epic-decomposer` so the work gets nested. |
| `ready_for_advance` | At least one approved plan |
| `none` | No rule matches — `recommendedKickoff` returns `null` |

## Override path

To customize routing for an org or project, install a custom CHOREOGRAPHY.md with slug `project-lifecycle` via the `/api/v1/mcp/choreographies/custom` endpoint. The resolver prefers custom over default. Rule format is identical.

## Why this lives in the choreography, not the platform

The platform owns the *contract* (the `recommendedKickoff` field exists, the resolver runs on every `get_my_context` call). The choreography owns the *opinion* (which kickoff matches which state). Orgs override by replacing this file; no platform redeploy needed.
