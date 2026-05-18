---
name: Storyboard & UI Flow Generator
description: Translate approved requirements into a UI storyboard — personas, screen-by-screen wireframe descriptions, and Mermaid user-flow diagrams bridging requirements and development. Use when: "storyboard", "user flow", "wireframes", "screen specs", "UI flow diagram". Voice triggers (speech-to-text aliases): "draft a storyboard", "user flows", "wireframes".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_requirements
  - mcp__coznt__get_design_context
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "storyboard", "wireframe", "user flow", "screen spec", or "UI flow"
    - DESIGN phase active, requirements approved
    - Team needs a shared visual model before UI dev starts
    - Stakeholders want a screen-by-screen walkthrough
  required_verbs:
    - get_my_context
    - get_requirements
    - get_design_context
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Storyboard & UI Flow Generator

Compose a `storyboard` plan from approved requirements + design context. Output uses Mermaid for flows. LLM drafting runs server-side via `invoke_skill`.

## When to use

- DESIGN phase, after requirements approved, before UI dev.
- Stakeholders need a screen-by-screen walkthrough.
- A new persona was added and existing flows need a refresh.

## When NOT to use

- **Project not in `design` phase.** Premature in `requirements`; too late in `development` (use design-review tooling instead).
- **No approved `story` plans.** Storyboards trace user stories — refuse if there's nothing approved.
- **User wants high-fidelity mockups.** This skill produces wireframe *descriptions* + flow diagrams, not pixel-level designs. Tell them to take the storyboard into Figma.
- **No personas identifiable.** If requirements never name a user role, ask the user to add one before invoking.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `design`.

### 2. Gather approved work + design surface
Call:
- `get_requirements { kind: "story", status: "approved" }`
- `get_design_context` — ADRs, in-flight features, linked work items

### 3. Identify personas
Scan the approved stories for `As a <persona>...` patterns. If none, ask the user to name 1–3 personas before invoking.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "storyboard-generator"
input: {
  projectId,
  approvedStories,
  designContext,           // from step 2
  personas,                // from step 3
  designPrinciples         // optional — pull from ADRs if present
}
```
Server returns `{ markdown, confidence, coverageGaps }` — `coverageGaps` lists stories with no screen mapping.

### 5. Surface coverage gaps
If `coverageGaps.length > 0`, flag to the user: "These stories have no screen in the storyboard: [...]". Either patch (re-invoke with more context) or annotate before filing.

### 6. Route based on confidence
- `confidence >= 0.7` and gaps acknowledged → present to user.
- `confidence < 0.7` or gaps unresolved → `submit_for_approval`.

### 7. File the storyboard
Call `upsert_plan`:
```
upsert_plan {
  kind: "storyboard",
  slug: "storyboard-<project-slug>-v<version>",
  title: "UI Storyboard & User Flow — <Project Name>",
  body: <generated markdown with Mermaid blocks>,
  changeNote: "Drafted from N approved stories + M personas"
}
```

## Constraints

- **Use Mermaid for flows.** Plaintext step-by-step is acceptable as a fallback but Mermaid is the preferred shape.
- **Screen descriptions are wireframe-level.** Layout zones + key controls + states. No CSS, no exact pixels.
- **Every persona ties to ≥1 flow.** If a persona appears but never drives a flow, either remove or flag as orphan.
- **Cite the source story for every screen.** Coverage trace matters — auditors and designers both ask for it.
- **One skill = one decision tree.** If the user asks for HTML mockups, stop and point at `/design-html` (gstack) or Figma.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| No approved stories | Requirements phase incomplete | Refuse; tell user how many stories are approved vs draft |
| No personas extractable from stories | Stories not user-story-shaped | Ask user to supply 1–3 personas before invoking |
| `coverageGaps` non-empty | Stories cover system behavior not user-facing screens | Flag explicitly; backend-only stories shouldn't be in the storyboard |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled input |
