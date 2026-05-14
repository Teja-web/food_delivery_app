---
name: Epic Decomposer
description: Translate a strategic theme or product brief into 2–5 candidate epics with business outcomes, rough sizing, and dependency edges
version: 1
tags: [platform, planning, epic, requirements, sdlc]
plan_kind: epic
---

# Epic Decomposer

Take a fuzzy upstream signal — a quarter goal, an approved PRD intro, an executive theme — and propose **2–5 candidate epics** that decompose it. Each epic is filed as a draft `epic` plan that humans then approve, edit, or kill before features are spec'd against it.

This is the front edge of the SDLC loop: garbage in, garbage in. The job is to produce decomposition options that a product lead can react to, not a single "correct" answer.

## When to Use

- A new strategic theme has been declared and the team needs to scope it.
- A PRD intro exists but nobody has broken it into ship-shaped units yet.
- The current epic backlog has aged out and a re-decomposition is overdue.

## Instructions

### Step 1 — Gather Context

```
invoke: get_my_context
invoke: get_plans { kind: "epic", status: "in_progress" }
invoke: get_plans { kind: "epic", status: "completed", limit: 10 }
invoke: get_requirements { kind: "story", status: "approved" }
```

Existing epics tell you the team's shipping cadence (how big an "epic" really is here). Completed-recent epics anchor sizing. Approved stories hint at customer pain that should already be reflected somewhere.

If the caller has not supplied the upstream signal (theme / PRD / one-liner), ask for it. Do not invent one.

### Step 2 — Decompose

Generate Markdown with **one section per candidate epic**, 2–5 total. Fewer than 2 means you've collapsed when you should have split; more than 5 means you've enumerated when you should have grouped.

```markdown
# Epic Decomposition — {Theme}

**Source signal:** {one-line description of what's being decomposed}
**Generated:** {YYYY-MM-DD}

## Candidate Epic 1 — {Working Title}

- **Business outcome:** {what changes for the customer / business when this lands. One sentence. No "we will build X" — what does X enable.}
- **Rough size:** {S | M | L | XL based on similar completed epics in this project}
- **Confidence in size:** {low | medium | high}
- **Depends on:** {epic slugs that must complete first, or "none"}
- **Unlocks:** {what becomes possible after this lands — features, other epics, customer commitments}
- **Why this exists as its own epic:** {one sentence. If you can't answer this without saying "because it's part of the theme", merge it.}
- **Open questions:** {2–4 bullets that block this from being approved as-is}

## Candidate Epic N — ...

...

## Decomposition Rationale

{One paragraph: why this cut and not an alternative. What was considered and rejected. Helps the reviewer evaluate the SHAPE of the decomposition, not just each epic individually.}

## Anti-Epics

{Things that look like they belong here but explicitly DO NOT. Pre-empts scope creep during review. "N/A" if none.}
```

### Step 3 — File One Plan Per Candidate

Upsert each candidate as its own draft `epic` plan so they can be approved, edited, or rejected independently:

```
for each candidate:
  invoke: upsert_plan {
    kind: "epic",
    slug: "epic-{kebab-of-working-title}",
    title: "{Working Title}",
    summary: "{Business outcome, one sentence}",
    body: "{the candidate's section, lifted verbatim}",
    changeNote: "Drafted by epic-decomposer from theme '{theme}'"
  }
```

Also file the **decomposition rationale** as a sibling plan with kind `adr` (slug `adr-epic-decomposition-{theme}`) so the reasoning survives even if individual epics are killed.

## Quality Checklist

- [ ] 2–5 candidates, not 1, not 8
- [ ] Every business outcome is customer-facing, not internal mechanics
- [ ] Every epic has a clear "why this exists as its own epic" answer
- [ ] Sizing is anchored to a real completed epic — not hand-waved
- [ ] Open questions are concrete enough that answering them changes the plan
- [ ] An anti-epics section exists (even "N/A" forces the question)
