---
name: ADR Extractor
description: Extract an Architecture Decision Record from a design discussion, PR thread, or recent code change — Status / Context / Decision / Consequences
version: 1
tags: [platform, adr, design, decisions, sdlc]
plan_kind: adr
---

# ADR Extractor

Read the available signal — a design discussion, a recently-merged PR, a Slack-style decision thread the caller pastes in — and produce a single, well-shaped **Architecture Decision Record**. One ADR per invocation. If you find two decisions tangled, file one and flag the other in open questions.

The product hypothesis: most teams DON'T write ADRs because the moment of decision is busy and ADR templates feel like ceremony. An agent that turns the trail into a draft removes that friction.

## When to Use

- A non-trivial design decision was made in a meeting / PR / Slack and nobody volunteered to write the ADR.
- A reviewer of a feature spec asked "where's the ADR for X?"
- The end of a design phase has arrived and the gate requires named ADRs.

## Instructions

### Step 1 — Gather Context

```
invoke: get_my_context
invoke: get_design_context
invoke: get_plans { kind: "adr", limit: 10 }
```

`get_design_context` is the richer view: in-flight features, linked work items, pending plans. Use it to find what's being designed *right now* so the ADR can reference the right plans.

Existing ADRs do two things: (1) save you from re-extracting a decision that's already filed, (2) anchor your numbering convention — pull the next ADR number from there.

If the caller has not supplied the source material (discussion transcript, PR url, design notes), ask for it. ADRs cannot be hallucinated from project context alone.

### Step 2 — Detect, Don't Synthesize

Before drafting, decide what the actual decision is. Many "decisions" in a thread are actually:

- A vendor evaluation that didn't converge → not an ADR yet
- A "let's try X and see" → not yet an ADR (file once committed)
- An implementation note → not an ADR (lives in the PR description)
- A working agreement → a team convention, not an ADR

A real ADR has: a Decision (single sentence, present tense), a Context (why now, why not before), and Consequences (what you give up). If you can't articulate all three from the source, refuse and say what's missing.

### Step 3 — Draft

Use the lightweight Nygard format. Status is **always** `proposed` on first creation — humans flip to `accepted` after review:

```markdown
# ADR-{NNN}: {Short Decision Phrase}

**Status:** proposed
**Date:** {YYYY-MM-DD}
**Deciders:** {names from the source material; "TBD" if not extractable}
**Source:** {PR url / meeting date / discussion thread, verbatim}

## Context

{2–4 paragraphs. What forces are at play. What other options were considered. Why the team is choosing now rather than deferring. Reference relevant plans (`plan/{slug}`) and external links.}

## Decision

{One sentence in present tense: "We adopt X."}

{Then 1–2 paragraphs unpacking what that concretely means — the system change, the new constraint, the new convention.}

## Consequences

### Positive
- {what we get}

### Negative
- {what we give up — at least one bullet. An ADR with no negative consequences is suspect: surface the trade-off honestly.}

### Neutral / observable
- {effects that aren't clearly good or bad — operational surface area, learning curve, blast radius}

## Alternatives Considered

For each option NOT chosen, one paragraph: what it was, why it was rejected. At least one alternative is required — "we considered nothing else" is a red flag.

## Compliance

How adherence is enforced. Examples:
- Lint rule: `<rule-id>`
- Code review checklist item
- Phase gate at {phase}
- "Convention, not enforced" (must say so explicitly if true)
```

### Step 4 — File It

```
invoke: upsert_plan {
  kind: "adr",
  slug: "adr-{NNN}-{kebab-of-decision-phrase}",
  title: "ADR-{NNN}: {Short Decision Phrase}",
  summary: "{The Decision sentence, verbatim}",
  body: "{generated markdown}",
  changeNote: "Drafted by adr-extractor from {source}"
}
```

Status stays `draft` on the plan side (drift between Nygard `proposed` and the plan's `draft` is fine — the ADR header is the source of truth for ADR status, the plan status tracks the document workflow).

## Quality Checklist

- [ ] Exactly one decision per ADR — if you saw two, file one and flag the other
- [ ] Context names what forces are at play, not just "we needed to choose X or Y"
- [ ] Decision is one sentence, present tense
- [ ] At least one negative consequence — no all-upside ADRs
- [ ] At least one alternative considered, with the reason for rejection
- [ ] Source is verbatim: a URL, a meeting date, a transcript reference — not "team discussion"
- [ ] Status is `proposed` (humans flip to `accepted` after review — don't pre-decide)
