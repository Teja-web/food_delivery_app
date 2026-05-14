---
name: Feature Spec Generator
description: Decompose an approved epic into 3–8 individually-shippable features with problem, user value, scope, and rough sizing
version: 1
tags: [platform, planning, feature, sdlc]
plan_kind: feature
---

# Feature Spec Generator

Take one approved `epic` and produce **3–8 feature spec plans** that compose it. Each feature is independently shippable, independently sized, and small enough that a single dev or small team owns it end-to-end. This skill lives between epic-decomposer (theme → epics) and requirements-document (features → user stories).

## When to Use

- An epic has just moved to `approved` and the design phase is opening.
- A previously-approved epic needs re-cutting because reality changed.
- Features under an epic have grown — split them.

## Instructions

### Step 1 — Gather Context

```
invoke: get_my_context
invoke: get_plans { id: "{epic-id}" }   # full epic body
invoke: get_plans { kind: "feature", status: "in_progress" }
invoke: get_plans { kind: "feature", status: "completed", limit: 8 }
```

The completed-feature sample gives you ground truth on how big a feature is on **this** team — sizing varies wildly across orgs. Use that as your unit.

If no parent epic id was supplied, refuse: this skill operates against an approved epic, not against a theme. (For theme decomposition, use `epic-decomposer`.)

### Step 2 — Decompose

Produce 3–8 features. Fewer means you didn't decompose; more means the epic is actually two epics — say so explicitly in the rationale rather than over-splitting.

For each feature, write a single-page spec:

```markdown
# Feature Spec — {Feature Title}

**Parent epic:** plan/{epic-slug}
**Status:** draft
**Generated:** {YYYY-MM-DD}

## Problem

{One paragraph. The user-facing or system-facing pain this feature addresses. Concrete situation, not "users want better X".}

## User Value

{One sentence. What changes for someone after this ships. If you can't write this, the feature isn't ready.}

## Scope

### In
- {bullet}
- {bullet}

### Out (explicit)
- {bullet — pre-empts scope creep at review}

## Approach Sketch

{2–4 bullets. Not a design doc — just enough that a reviewer can spot "this won't fly given our stack" before deeper design.}

## Dependencies

- **Other features:** {slugs, or "none"}
- **External systems:** {Jira / Confluence / Stripe / etc — what this needs from outside}
- **Decisions pending:** {ADRs that must be filed first, or "none"}

## Rough Sizing

- **T-shirt:** {S | M | L}
- **Anchor:** {plan/{slug} of a completed feature this is being compared to}
- **Confidence:** {low | medium | high}

## Acceptance — feature-level

3–5 bullets that, when all true, mean this feature is done. Not user-story-level acceptance — those come from requirements-document. Feature-level is "what does the customer experience differently."

## Open Questions

Concrete questions a reviewer must answer before this can move to approved. Aim for 2–4.
```

### Step 3 — File One Plan Per Feature

```
for each feature:
  invoke: upsert_plan {
    kind: "feature",
    slug: "feat-{kebab-of-feature-title}",
    parentPlanId: "{epic-id}",
    title: "{Feature Title}",
    summary: "{User Value, one sentence}",
    body: "{the feature's section, verbatim}",
    changeNote: "Drafted by feature-spec-generator from epic '{epic-slug}'"
  }
```

After all features are filed, post a one-line summary to the parent epic via `upsert_plan` on the epic with a `changeNote`:

```
invoke: upsert_plan {
  kind: "epic",
  slug: "{epic-slug}",
  ...                       # unchanged body
  changeNote: "Decomposed into {N} features: {slug-1}, {slug-2}, ..."
}
```

This way the epic's revision log shows when decomposition happened.

## Quality Checklist

- [ ] 3–8 features, anchored to actual completed-feature sizing on this team
- [ ] Every feature has explicit Scope Out — not just Scope In
- [ ] Every feature has a named dependency or "none" (forces the check)
- [ ] No feature is just "make X better" — every problem statement is a concrete situation
- [ ] Acceptance is feature-level, not story-level
- [ ] Parent epic gets a revision note recording the decomposition
- [ ] If you wanted to write 9+ features, you flagged "this is two epics" in a rationale plan instead
