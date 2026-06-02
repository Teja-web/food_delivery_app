# Govern. Verify. Trust. — Coznt's Operating Model

Companion to [positioning.md](../positioning.md). Positioning answers *what coznt is*. This document answers *why the operating model is shaped this way and why now*.

## The operating model

```
Govern what AI can do.
Verify what AI produces.
Trust what can be proven.
```

| Pillar | Question it answers | Coznt mechanism |
|---|---|---|
| **Govern** | Who is allowed to act, and how far? | `skill_autonomy` ladder (observe → propose → merge → lead), per-project; `rules` engine; phase gates; approval routing |
| **Verify** | How do we know the output is correct? | `skill_outcomes` ledger; Milestone-A deterministic assessors (`pr_merge`, `pr_revert`, `pr_abandon`, `deploy_clean`, `deploy_incident`); gate types `coverage`, `lint`, `security`, `custom` |
| **Trust** | Can we explain, audit, and stand behind it? | Audit log as source of truth; every UI claim links to source of record; provenance on plans and work items; portfolio-level evidence rollups |

The pillars are causally ordered. AI generates → verification occurs → trust is established through evidence. Governance is not the goal; **trust through proven evidence** is the goal. Govern and Verify are the mechanisms.

## Why this matters now: the verification bottleneck

In traditional development the scarce resource was **writing code**. With LLM-assisted coding, generating plausible code is cheap. The scarce resource is now **establishing trust in candidate code** — verifying it is correct, secure, maintainable, and aligned with intent.

> The bottleneck moves from code production to code verification.

This is why the operating model is shaped this way. Five years ago, Govern–Verify–Trust would have been overkill for the bottleneck. Today, organizations that don't operationalize it accrue **verification debt** — unverified AI output that compounds risk until something fails in production.

### Evidence

| Theme | Finding | Source |
|---|---|---|
| Review burden shifted to seniors | AI raises productivity for juniors but increases review/rework load on seniors | arXiv 2510.10165 |
| Validation is cognitively distinct | Eye-tracking on LLM code review shows more context switching, deletion-rewrite, higher cognitive load than reviewing human code | arXiv 2405.16081 |
| Illusion of correctness | LLM code looks professional, compiles, appears complete — reviewers cannot use superficial cues to triage risk | IT Pro |
| Iterative refinement degrades security | Repeated "improve this" prompts *increase* vulnerabilities across generations | arXiv 2506.11022 |
| Verification debt is accumulating | ~half of developers don't consistently review AI-generated code; ~38% cite review takes longer than for human code | IT Pro survey |
| Spec-driven workflows are the response | Industry + academic consensus shifting toward spec → AI generates → verify against spec | OpenReview, GitHub Workspace, AI-DLC |

## Verification debt as a measurable quantity

If verification is the bottleneck, the analytical question is: **how much unverified AI output has accumulated in this project, and is it growing or shrinking?**

A single derived number per project, surfaced on the portfolio audit (Milestone B):

```
verification_debt =
    (autonomy_distance_from_principal × invocations_in_window)
  + (open_approvals × age_in_hours × severity_weight)
  + (gate_trip_rate × gates_in_window × severity_weight)
  + (unreviewed_ai_authored_changes × time_since_authored)
```

Where:
- `autonomy_distance_from_principal` = `3 - current_autonomy_level` per skill, summed
- `gate_trip_rate` = fraction of gates that failed in the trailing 30-day window
- `severity_weight` per gate type: `security`=3, `coverage`=2, `lint`=1, `custom`=configurable

The contract: the number is **derived only from the existing audit ledger**, never from self-report. This is what makes it Trust-grade.

### Where it surfaces

| Surface | Treatment |
|---|---|
| Portfolio overview | Per-project debt score with 30-day sparkline; sort/filter |
| Project detail | Four-component breakdown (autonomy, approvals, gates, unreviewed) |
| Skill detail | This skill's contribution to debt per project where it operates |
| Plan detail | Debt delta this plan would add or retire on merge |
| PR check | Gate-status comment with current project debt + this PR's projected delta |
| MCP / IDE | `coznt verification-debt` verb so editor agents can query before generating |

## Coznt primitives, mapped to the three pillars

The schema was already shaped around this operating model. This table makes the mapping explicit so future work knows which pillar it serves.

### Govern

| Primitive | Govern function |
|---|---|
| `skill_autonomy` (0–3, per project) | Caps what each skill is permitted to do unsupervised |
| `rules` engine (declarative policies) | Synchronous policy gates inside CRUD hooks — `keyword-presence`, `action-policy` |
| `phase_gates` (`approval`, `coverage`, `lint`, `security`, `custom`) | Checkpoints that must PASS (or be SKIPPED) before phase advance |
| `approvals` (polymorphic) | Routes sign-off to the right humans on plans, gates, releases, work items |

### Verify

| Primitive | Verify function |
|---|---|
| `skill_outcomes.verdict` (`success` / `rolled_back` / `incident`) | Post-hoc reality, not pre-hoc LLM self-report |
| Milestone-A deterministic assessors | `pr_merge`, `pr_revert`, `pr_abandon`, `deploy_clean`, `deploy_incident` — CI/CD reality drains to the ledger |
| Gate types `coverage`, `lint`, `security` | Automated verification at phase boundaries |
| `Plan` kinds (`test_plan`, planned `spec`, `risk_register`) | Spec-driven workflow: human authors spec → AI generates → verify against spec |
| 30-day rolling outcome window | Verification-debt amortization mechanism |

### Trust

| Primitive | Trust function |
|---|---|
| Audit log | Source of truth for every claim on screen |
| Source-of-record linking | Every UI claim links back to the system that owns it (Git, Jira, Linear, Vercel, etc.) |
| Provenance (planned: model, prompt hash, autonomy at gen-time on plans + work items) | Reviewer can triage AI output by who/what produced it and under which autonomy |
| Portfolio rollups | Evidence-graded metrics derived from the same ledger that gates merges |

## Competitive position

| Tool | Stance | Gap against Govern–Verify–Trust |
|---|---|---|
| Cursor / Copilot / Claude Code | Generate code | No Govern, no Verify, no Trust — pure generation |
| Linear / Jira | Track work | No Verify, no AI provenance |
| GetDX | Measure DX via survey + tracker velocity | No Govern, Verify-by-proxy, Trust-by-survey — wrong instrument for AI output |
| Datadog / Grafana | Observe production | Verify-after-shipping; too late to govern |
| SonarQube / Snyk / CodeQL | Static analysis on the artifact | Verifies the output, not the *process* — no autonomy calibration, no Govern layer |
| **Coznt** | Pre-merge governance + verification + evidence-graded trust | Owns the layer |

## What this is NOT

- **Not a replacement for the governance frame.** Govern is the first pillar; nothing about the existing governance vocabulary is displaced.
- **Not a separate product.** Verification debt is the headline analytical metric the existing primitives already feed — surfacing, not building.
- **Not a survey score.** It is derived from the same audit ledger that gates production merges.
- **Not a productivity metric.** GetDX measures DX productivity; verification debt measures trust-establishment cost. They can coexist on the same portfolio screen.
- **Not aspirational "trust".** Trust here means *provenance + audit + source-of-record linking* — mechanical, not vibes.

## Open questions

1. Should `verification_debt` be a materialized value (recomputed on outcome insert, like `skill_autonomy`) or computed on read? Suggest materialized, for portfolio query performance.
2. Severity weights — configurable per org, or fixed defaults with override? Suggest fixed defaults, org override via `rules`.
3. Provenance (`ai_authored`, model, prompt hash, autonomy snapshot) — belongs on `work_items`, `plans`, or both? Likely both, since plans can be agent-authored too.
4. Does "Trust" need its own UI surface (a Trust page) or is it sufficient as a property of every other surface (every claim links to source)? Suggest the latter — Trust is a quality, not a tab.

## References

- arXiv 2302.06590 — The Impact of AI on Developer Productivity
- arXiv 2405.16081 — Validating and Repairing LLM-Generated Code: Eye Tracking + IDE Actions
- arXiv 2506.11022 — Security Degradation in Iterative AI Code Generation
- arXiv 2510.10165 — AI-Assisted Programming and Senior Reviewer Burden
- OpenReview `bw5mNj75h9` — From Code to Contract in the Age of AI Coding Assistants
- ACM 10.1145/3715007 — Empirical Study on Challenges for LLM Application
- IT Pro — Illusion of correctness; verification debt survey
- TechRadar — Security flaws in AI-generated code
