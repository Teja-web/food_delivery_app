---
name: Epic Decomposer
description: Decompose a strategic theme, quarter goal, or PRD intro into 2–5 candidate epics with business outcomes, rough sizing, and dependency edges. Use when: "decompose this theme", "what are the epics for X", "break down this PRD", "Q3 planning". Voice triggers (speech-to-text aliases): "break this into epics", "decompose the theme", "what are the big rocks".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_plans
  - mcp__coznt__get_requirements
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "theme", "PRD", "quarterly goal", "decompose", or "what are the epics"
    - New strategic theme declared, no epics filed yet
    - Existing epic backlog has aged out and a re-decomposition is overdue
  required_verbs:
    - get_my_context
    - get_plans
    - get_requirements
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Epic Decomposer

Turn a fuzzy upstream signal into 2–5 candidate epics that a product lead can react to. Each epic is filed as a draft for human approval. The LLM decomposition runs server-side via `invoke_skill`.

## When to use

- A new strategic theme has been declared and nobody has broken it into ship-shaped units.
- A PRD intro exists but hasn't been carved into epics yet.
- The current epic backlog is stale and needs a re-cut for a new planning cycle.

## When NOT to use

- **No upstream signal supplied.** This skill operates on a *concrete* theme / PRD / one-liner. Do not invent one — ask the user.
- **The signal is already an epic-sized chunk.** If the user has a single ship-shaped feature, invoke `feature-spec-generator` instead.
- **The signal is a single user story.** Way too narrow; tell the user to author directly via `create_requirement`.
- **You're being asked to decompose into *features*.** Wrong skill — use `feature-spec-generator` against an approved epic.

## Steps

### 1. Load context
Call `get_my_context`. Capture project name + phase.

### 2. Sample the team's epic cadence
Call:
- `get_plans { kind: "epic", status: "in_progress" }`
- `get_plans { kind: "epic", status: "completed", limit: 10 }`
- `get_requirements { kind: "story", status: "approved" }`

The completed-epic sample tells you how big "an epic" really is on this team. Approved stories hint at unmet customer pain.

### 3. Confirm the upstream signal
The user MUST supply the theme / PRD / one-liner. If they haven't, ask. Don't proceed.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "epic-decomposer"
input: {
  projectId,
  upstreamSignal: <theme / PRD text>,
  recentEpicSizes,         // from step 2 — calibrates the unit
  unmetStoryThemes,        // approved stories not yet covered
  requestedCount           // optional — default 2–5
}
```
Server returns `{ candidates: [...], confidence, decompositionRationale }`.

### 5. Route based on confidence
- `confidence >= 0.7` → show all 2–5 candidates to user for ranking / edits.
- `confidence < 0.7` → `submit_for_approval` with the full set.

### 6. File each candidate as a draft epic
For each candidate, call `upsert_plan`:
```
upsert_plan {
  kind: "epic",
  slug: "epic-<theme-slug>-<candidate-slug>",
  title: <candidate working title>,
  body: <markdown per candidate>,
  status: "draft",
  changeNote: "Drafted by epic-decomposer from <theme>"
}
```

## Constraints

- **2–5 candidates is the band.** Fewer = under-decomposed. More = enumerating instead of grouping. The server enforces; respect the count.
- **One business outcome per epic, one sentence.** No "we will build X" — what changes for the customer.
- **Never auto-approve.** Every epic ships as `draft`. The product lead picks the winners.
- **Don't invent dependencies.** If the source signal doesn't mention prerequisites, leave `depends_on` empty.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Server returns 1 candidate | Theme was already epic-sized | Refuse to over-split; advise the user to invoke `feature-spec-generator` instead |
| Server returns 6+ candidates | Theme was actually multiple themes | Present all but flag the rationale section; suggest a second invocation to split |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled input |
| `recentEpicSizes` is empty | No completed epics yet on this project | Note this in the candidate sizing; flag low confidence |
