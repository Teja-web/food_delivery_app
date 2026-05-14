---
name: Incident Postmortem Author
description: Draft a blameless incident postmortem — timeline, impact, root cause hypothesis, contributing factors, action items
version: 1
tags: [platform, incident, postmortem, ops, sdlc]
plan_kind: incident
---

# Incident Postmortem Author

When an incident closes, draft the postmortem. Blameless tone, concrete timeline, honest root-cause hypothesis, action items with named owners. Humans then review, edit, and approve — the agent's job is to remove the cold-start blank-page tax.

The product hypothesis: postmortems are skipped or rushed because the moment they're needed is also the moment everyone's tired. A draft with the timeline already assembled changes that.

## When to Use

- A `deploy_incident` outcome has been recorded and the incident is now closed.
- A user has manually filed an `incident` plan in `in_progress` and the resolution has landed.
- A second-tier incident review is being prepared and the first draft is missing.

## Instructions

### Step 1 — Gather Context

```
invoke: get_my_context
invoke: get_plans { kind: "incident", status: "in_progress" }
invoke: get_outcomes { limit: 50 }
invoke: get_pipeline_status
invoke: get_design_context
```

`get_outcomes` is critical: it gives you the chain of skill outcomes around the incident window, including the failed deploy that triggered it and any rollback. `get_pipeline_status` tells you which deploys ran in the window. Cross-reference timestamps to build the timeline.

If no `in_progress` incident plan exists, refuse: this skill writes a postmortem against an explicitly-tracked incident, not a hallucinated one. If the caller insists, ask them to file an `incident` plan stub first (title, one-line summary, when it started).

### Step 2 — Build the Timeline From Evidence

This is the load-bearing section. Postmortems live or die on whether the timeline is real. Use the recorded `skill_outcomes` and pipeline events as the spine — do NOT invent timestamps.

For each row:
- Timestamp (UTC, ISO-8601, minute precision)
- Actor (system | human | which skill)
- Event (what happened, one sentence)
- Evidence (`plan/{slug}`, `deploy/{ref}`, `pr/{number}` — link the source)

Sort chronologically. If the source data has gaps (e.g., 14 minutes with no recorded event), say so explicitly: `XX:XX — gap, no recorded events (investigate)`. Don't paper over silence with prose.

### Step 3 — Draft

Use the lightweight blameless format:

```markdown
# Incident Postmortem — {Short Description}

**Status:** draft
**Severity:** {sev0 | sev1 | sev2 | sev3}
**Started:** {YYYY-MM-DD HH:MM UTC}
**Resolved:** {YYYY-MM-DD HH:MM UTC}
**Duration:** {humanized — "47 minutes"}
**Authors:** {drafted by incident-postmortem; humans add their names on review}

## Summary

{2–3 sentences a busy executive can read. What broke. Who was affected. What restored it.}

## Impact

- **Customer-facing:** {affected users / accounts / regions — quantify if possible, "unknown" if not}
- **Revenue:** {known impact or "not yet calculated"}
- **Internal:** {on-call hours, oncalls paged, teams diverted}
- **Reputational:** {social / customer-comm signal, or "none observed"}

## Timeline

| When (UTC) | Actor | Event | Evidence |
|---|---|---|---|
| ... | ... | ... | ... |

## Root Cause (hypothesis)

{2–3 paragraphs. The technical or process chain that led to the failure. This is a HYPOTHESIS until verified — say so. Avoid "human error" as a root cause; if a human took the wrong action, the system allowed it — describe what allowed it.}

## Contributing Factors

Bullets. Not the same as the root cause — these are the things that made the incident worse, longer, or harder to detect.

- Monitoring gap that delayed detection
- Runbook drift
- Skill autonomy that allowed an untested path
- Tooling friction during rollback
- ... etc

## What Went Well

At least 2 bullets. Always. This isn't compliment-fishing — it tells future incident handlers which existing systems they can trust.

## Action Items

Each item: owner, due date, plan slug (file separately as a `feature` or `story` plan and link), priority. No vague "improve monitoring" items — they must be specific enough to ship.

| Owner | Due | Plan | Priority | What |
|---|---|---|---|---|
| ... | ... | plan/{slug} | p0 | ... |

## Lessons

1–3 paragraphs. The DURABLE takeaways, separate from action items. Action items are concrete fixes; lessons are what we learned about how the system behaves under stress.

## What we still don't know

Bullets. Open questions whose answers would change the postmortem. Surface them so the review meeting can target them.
```

### Step 4 — File It

```
invoke: upsert_plan {
  kind: "incident",
  slug: "incident-{YYYYMMDD}-{kebab-of-short-description}",
  title: "Incident Postmortem — {Short Description}",
  summary: "{Summary section, first sentence}",
  body: "{generated markdown}",
  changeNote: "Drafted by incident-postmortem from outcomes window {start}–{end}"
}
```

If action items are filed as separate plans (recommended), they should be filed BEFORE the postmortem upsert so the postmortem can link them by slug.

## Quality Checklist

- [ ] Timeline timestamps come from `skill_outcomes` / pipeline events, not invented
- [ ] Gaps in the timeline are flagged, not papered over
- [ ] Root cause is named as a HYPOTHESIS, not a certainty
- [ ] At least one negative consequence-style entry in "Contributing Factors"
- [ ] At least two "What Went Well" bullets
- [ ] Every action item has an owner and a due date, or it's not an action item
- [ ] No "human error" as a terminal root cause
- [ ] "What we still don't know" exists, even if short
