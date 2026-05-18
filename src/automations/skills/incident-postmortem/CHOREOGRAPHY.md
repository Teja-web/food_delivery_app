---
name: Incident Postmortem Author
description: Draft a blameless incident postmortem — concrete timeline assembled from skill outcomes, impact summary, root-cause hypothesis, contributing factors, named action items. Use when: "postmortem", "incident review", "RCA", "what happened", "write up the outage". Voice triggers (speech-to-text aliases): "incident report", "RCA", "what went wrong".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_plans
  - mcp__coznt__get_outcomes
  - mcp__coznt__get_pipeline_status
  - mcp__coznt__get_design_context
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "postmortem", "RCA", "incident review", or "what happened"
    - A `deploy_incident` outcome was recorded and the incident is now closed
    - A user filed an `incident` plan in `in_progress` and the resolution has landed
    - Second-tier incident review prep — first draft missing
  required_verbs:
    - get_my_context
    - get_plans
    - get_outcomes
    - get_pipeline_status
    - get_design_context
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Incident Postmortem Author

Draft the postmortem with the timeline already assembled from `skill_outcomes` evidence. Removes the cold-start blank-page tax. LLM drafting runs server-side via `invoke_skill`.

## When to use

- A `deploy_incident` outcome was recorded and the incident is now closed.
- The user filed an `incident` plan in `in_progress` and the resolution has landed.
- A second-tier incident review is being prepped and the first draft is missing.

## When NOT to use

- **No `incident` plan exists.** This skill draws against an explicitly-tracked incident, not a hallucinated one. Ask the user to file a stub `incident` plan first (title, one-line summary, start time).
- **Incident is still active.** Refuse — premature postmortems re-litigate as facts arrive. Wait until the resolution has actually landed.
- **The user wants a customer-facing status update.** Different shape — postmortem is internal/blameless, not external.
- **No coznt evidence in the window.** If `get_outcomes` returns nothing in the incident window, the timeline must be hand-built from external sources — flag the gap rather than invent.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `monitoring` or `cicd`.

### 2. Find the incident plan
Call `get_plans { kind: "incident", status: "in_progress" }`. If none, refuse — ask user to file the stub.

### 3. Assemble timeline evidence
Call:
- `get_outcomes { limit: 50 }` — **load-bearing**. Skill outcomes around the incident window are the timeline spine.
- `get_pipeline_status` — recent deploys + rollbacks.
- `get_design_context` — active features + ADRs for cross-reference.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "incident-postmortem"
input: {
  projectId,
  incidentPlanSlug,        // from step 2
  outcomes,                // from step 3 — sort chronologically server-side
  pipelineStatus,
  designContext,
  externalEvidence         // optional — user-pasted Slack / on-call notes
}
```
Server returns `{ markdown, confidence, gaps }` — `gaps` lists windows with no recorded events that need investigation.

### 5. Surface evidence gaps to the user
Before filing, if `gaps.length > 0`, tell the user explicitly: "The timeline has N minutes of silence at <window>. Investigate or annotate before filing." Do not paper over.

### 6. Route based on confidence
- `confidence >= 0.7` and gaps are annotated → present to user.
- `confidence < 0.7` or gaps remain → `submit_for_approval` with timeline + gaps attached.

### 7. File the postmortem
Update the existing `incident` plan via `upsert_plan`:
```
upsert_plan {
  kind: "incident",
  slug: <incidentPlanSlug>,      // same slug — adds revision
  body: <generated markdown>,
  changeNote: "Postmortem drafted from N outcome events + M gaps"
}
```

## Constraints

- **Blameless tone, always.** No "X failed to do Y." Use system-actor language: "the deploy at HH:MM did not detect the regression."
- **Never invent timestamps.** If `get_outcomes` doesn't have an event for a window, write "XX:XX — gap, no recorded events (investigate)."
- **Action items must have named owners.** Anonymous action items don't ship; flag and ask the user.
- **Root cause is a hypothesis on first draft.** Status starts as `proposed`. Humans confirm or revise.
- **One skill = one decision tree.** Don't also draft the customer update — different audience, different skill.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `get_plans { kind: "incident", in_progress }` is empty | No tracked incident | Refuse; ask user to file a stub plan first |
| `get_outcomes` returns no events in the window | Incident happened before coznt was wired up, or assessor lagged | Flag gaps explicitly in the timeline; ask user to paste external evidence |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled evidence |
| Multiple recent incidents overlap | Unclear which one to write | Ask user to confirm which incident slug; do one per invocation |
