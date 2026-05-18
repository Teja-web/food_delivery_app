---
name: Requirements Document Generator
description: Consolidate every approved requirement (`story` and/or `feature` plans) into a single Requirements Specification Document for stakeholder review and audit trail. Use when: "consolidate the requirements", "requirements doc", "spec for stakeholders", "baseline before design". Voice triggers (speech-to-text aliases): "requirements document", "spec document", "consolidated requirements".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "requirements document", "requirements spec", or "consolidate requirements"
    - End of REQUIREMENTS phase, all requirements approved, advancing to DESIGN
    - Stakeholder review needs a single artifact spanning all approved requirements
    - Audit trail prep for a regulated cycle
  required_verbs:
    - get_my_context
    - get_requirements
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Requirements Document Generator

Roll up every approved `story` (and optionally `feature`) into one Requirements Specification Document. LLM drafting runs server-side via `invoke_skill`.

## When to use

- End of REQUIREMENTS phase, after all candidate requirements have been approved.
- Stakeholders need a single document spanning all approved requirements.
- Audit cycle needs a baseline artifact.

## When NOT to use

- **Project is mid-requirements with active drafts.** Refuse — premature; the doc would be a snapshot of unfinished work.
- **Fewer than 3 approved requirements.** Probably too early; suggest the user finalize at least a handful before consolidating.
- **The user wants a per-requirement deep-dive.** Different shape; tell them to open the individual plan via `get_plans { id }`.
- **Project past the design phase.** Use `dev-summary-generator` or `release-notes-generator` instead; the requirements doc is a phase-end artifact.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `requirements` or `design`.

### 2. Gather approved requirements
Call:
- `get_requirements { kind: "story", status: "approved" }`
- `get_requirements { kind: "feature", status: "approved" }` — combine if the project uses both

If the combined count is 0 or 1, refuse — there's nothing to consolidate.

### 3. Ask the user for stakeholder context
Coznt cannot infer these:
- Document version (default `1.0`)
- Target stakeholders (eng leads, regulatory, business sponsor)
- Compliance regime, if any (SOC 2 / HIPAA / FedRAMP / none)

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "requirements-document"
input: {
  projectId,
  approvedStories,
  approvedFeatures,
  documentVersion,
  stakeholders,
  complianceRegime
}
```
Server returns `{ markdown, confidence, coverageGaps }` — `coverageGaps` lists requirement themes that have no approved plan.

### 5. Surface coverage gaps
If `coverageGaps.length > 0`, flag to the user before filing: "These themes have no approved requirement: [...]". Don't auto-file with known gaps unless user confirms.

### 6. Route based on confidence
- `confidence >= 0.7` and gaps acknowledged → present to user.
- `confidence < 0.7` or gaps not acknowledged → `submit_for_approval`.

### 7. File the document
Call `upsert_plan`:
```
upsert_plan {
  kind: "story",                                           // requirements-doc kind canonical to story bucket
  slug: "requirements-doc-<project-slug>-v<version>",
  title: "Requirements Specification — <Project Name> v<version>",
  body: <generated markdown>,
  changeNote: "Consolidates N approved requirements at end of REQUIREMENTS phase"
}
```

## Constraints

- **Status `approved` on every cited requirement.** Drafts must NOT appear in the consolidated doc.
- **Coverage gaps must be visible.** Never silently omit a theme; surface as "Open" in the doc and `coverageGaps` to the user.
- **No invented stakeholders.** Use names from the project entity or what the user pastes; don't fabricate.
- **One skill = one decision tree.** If the user asks you to also generate the test plan, stop — `test-plan-generator` is a separate invocation.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Combined approved count < 2 | Too early in the phase | Refuse; tell user how many approved requirements exist |
| `coverageGaps` non-empty | Themes mentioned but never planned | Surface to user; require explicit ack before filing |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled input |
| User wants to include `draft` plans | Premature consolidation | Refuse; tell them to advance plans to `approved` first |
