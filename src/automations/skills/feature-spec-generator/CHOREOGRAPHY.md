---
name: Feature Spec Generator
description: Decompose one approved epic into 3–8 individually-shippable feature specs with problem, user value, scope, and rough sizing. Use when: "break this epic into features", "feature specs for epic X", "what's in this epic", "spec out the epic". Voice triggers (speech-to-text aliases): "decompose the epic", "feature breakdown", "spec the features".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_plans
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "feature spec", "decompose this epic", or "what features make up X"
    - An epic just moved to `approved`
    - Features under an existing epic have grown and need splitting
  required_verbs:
    - get_my_context
    - get_plans
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# Feature Spec Generator

Take one approved `epic` plan and produce 3–8 individually-shippable feature specs. The LLM decomposition runs server-side via `invoke_skill`.

## When to use

- An epic just moved to `approved`; design phase is opening for it.
- A previously-approved epic needs re-cutting because reality changed.
- Existing features under one epic have grown unwieldy; split them.

## When NOT to use

- **No epic id supplied.** This skill operates against a *specific approved epic*. Refuse and tell the user to point at one. For theme → epic decomposition, use `epic-decomposer`.
- **Epic is in `draft` or `in_review`.** Don't decompose unapproved epics — wait for approval. The shape may still change.
- **Epic is `completed`.** Decomposing a closed epic is a re-cut; only do it if the user explicitly says they want to revise scope mid-flight.

## Steps

### 1. Load context
Call `get_my_context`. Confirm phase is `requirements` or `design`.

### 2. Load the parent epic + calibration sample
Call:
- `get_plans { id: "<epic-id>" }` — full epic body. Required.
- `get_plans { kind: "feature", status: "in_progress" }`
- `get_plans { kind: "feature", status: "completed", limit: 8 }`

The completed-feature sample is your sizing ruler — features vary wildly across teams. If the count is zero, low confidence is expected.

### 3. Confirm epic id
If the user hasn't supplied one, ask. Don't guess.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "feature-spec-generator"
input: {
  projectId,
  epicId,
  epicBody,                // from step 2
  recentFeatureSizes,      // from step 2 — calibrates the unit
  requestedCount           // optional — default 3–8
}
```
Server returns `{ features: [...], confidence, decompositionRationale, scopeFlags }`.
`scopeFlags` may include `"epic-is-actually-two-epics"` — surface that if present.

### 5. Route based on confidence
- `confidence >= 0.7` → present features to user.
- `confidence < 0.7` → `submit_for_approval` with the set attached.

### 6. File each feature as a draft
For each returned feature, call `upsert_plan`:
```
upsert_plan {
  kind: "feature",
  slug: "feature-<epic-slug>-<feature-slug>",
  title: <feature title>,
  parentSlug: <epic slug>,  // server-side relation
  body: <markdown spec>,
  status: "draft",
  changeNote: "Drafted by feature-spec-generator from epic <epic-slug>"
}
```

## Constraints

- **3–8 features per invocation.** Fewer = didn't decompose. More = the "epic" is actually two epics; surface that in the rationale, don't over-split.
- **One user value sentence per feature, present tense.** "User can X." If you can't write that, the feature isn't ready.
- **Status always starts as `draft`.** Never auto-approve.
- **No invented dependencies.** Only name dependency edges that come from the epic body or the calibration sample's pattern.
- **One skill = one decision tree.** Don't also draft user stories — `requirements-document` or `create_requirement` is the next step after features are approved.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Epic body is < 200 chars | Epic is a stub | Refuse; tell user to flesh out the epic first |
| Server returns 9+ features | Epic is actually multiple epics | Present + flag `scopeFlags`; suggest splitting the epic via `epic-decomposer` |
| `recentFeatureSizes` empty | First features on this project | Low confidence; ask user to sanity-check sizing |
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | `submit_for_approval` with the assembled input |
