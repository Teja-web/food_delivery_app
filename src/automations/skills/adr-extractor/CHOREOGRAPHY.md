---
name: ADR Extractor
description: Extract an Architecture Decision Record (Status / Context / Decision / Consequences) from a design discussion, PR thread, or recently-merged change. Use when: "write the ADR", "extract an ADR", "ADR for this decision", "where's the ADR for X". Voice triggers (speech-to-text aliases): "draft ADR", "decision record", "capture this decision".
allowed-tools:
  - mcp__coznt__get_my_context
  - mcp__coznt__get_design_context
  - mcp__coznt__get_plans
  - mcp__coznt__invoke_skill
  - mcp__coznt__upsert_plan
  - mcp__coznt__submit_for_approval
coznt:
  version: 1.0.0
  triggers:
    - User mentions "ADR", "decision record", or "architecture decision"
    - A non-trivial design decision just landed in a PR / meeting / Slack
    - A reviewer asked "where's the ADR for X?"
    - End of design phase and the gate requires named ADRs
  required_verbs:
    - get_my_context
    - get_design_context
    - get_plans
    - invoke_skill
    - upsert_plan
    - submit_for_approval
  min_autonomy: propose
---

# ADR Extractor

Turn a design-decision trail into a draft ADR. The LLM call runs server-side via `invoke_skill`; this file tells you when to call which verb.

## When to use

- A non-trivial design decision was made in a PR / meeting / Slack and nobody volunteered to write the ADR.
- A feature-spec reviewer asked "where's the ADR for X?"
- End of the design phase and `get_phase_checklist` shows an unmet ADR gate.

## When NOT to use

- **No source material.** ADRs cannot be hallucinated from project context alone. Ask the user to paste the PR url, meeting notes, or thread before invoking.
- **The "decision" is actually an implementation note.** Implementation belongs in the PR description, not an ADR. If you can't articulate Decision + Context + Consequences as separate things, refuse.
- **Two decisions tangled in one source.** File one ADR per invocation; flag the other in open questions for a follow-up call.
- **Vendor evaluation in progress.** Don't file an ADR until the decision has actually been made.

## Steps

### 1. Load context
Call `get_my_context`. Capture `projectId` and the current phase.

### 2. Load design surface
Call `get_design_context` (active features + linked work items + pending plans) and `get_plans { kind: "adr", limit: 10 }`. Existing ADRs anchor your numbering and prevent duplicate decisions.

### 3. Confirm the source
If the user hasn't supplied source material, ask for it — a PR url, meeting transcript, or thread is required. Stop until provided.

### 4. Invoke the server-side skill
Call `invoke_skill` with:
```
slug: "adr-extractor"
input: {
  projectId,
  source,                  // verbatim text or url provided by user
  nextAdrNumber,           // from step 2's existing ADRs
  deciders                 // names if extractable from source
}
```
Server returns the drafted ADR markdown + `confidence`.

### 5. Route based on confidence
- `confidence >= 0.7` → present draft to user for review.
- `confidence < 0.7` → call `submit_for_approval` with the draft attached.

### 6. File the ADR
Once approved, call `upsert_plan`:
```
upsert_plan {
  kind: "adr",
  slug: "adr-<NNN>-<short-decision-phrase>",
  title: "ADR-<NNN>: <Short Decision Phrase>",
  body: <generated markdown>,
  changeNote: "Drafted from <source>"
}
```
**Status on creation is always `proposed`** — humans flip to `accepted` after review.

## Constraints

- **One ADR per invocation.** Tangled decisions get one filed, the rest noted as open questions.
- **Never invent deciders.** If names aren't in the source, use "TBD" — don't guess.
- **Status starts at `proposed`.** Do not write `accepted` even if the decision feels obvious.
- **Source is verbatim.** Paste the PR url or meeting timestamp; don't paraphrase the trail.

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| `invoke_skill` returns `denied_below_autonomy` | Skill autonomy below `propose` | Call `submit_for_approval` with the assembled input; reviewer dispatches manually |
| `confidence < 0.5` on output | Source material was thin / one of {Decision, Context, Consequences} couldn't be extracted | Refuse to file; tell user what's missing |
| Source mentions two decisions | Tangled thread | File the primary; flag the other in "Open questions"; suggest a second invocation |
