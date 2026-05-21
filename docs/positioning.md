# Coznt — Positioning

*Purpose: definitive product positioning. What coznt is, what it claims, the loop it tightens. Source of truth — every other doc derives from this.*

**Coznt is autonomy with observability for AI-assisted software delivery.**

Cursor, Devin, Copilot, Claude Code, and the new wave of CLI agents (`claude -p`, `cursor-agent`, `codex exec`) make individual developers dramatically faster. Coznt is the **daemon that makes those editors and CLIs project-aware, phase-aware, and policy-aware** — so individual velocity becomes organizational throughput, safely. Every AI-assisted action earns the next one less friction; every action lands with the evidence a governed organization needs.

Coznt runs *inside* the editor loop, not above it:

- **Individual AI productivity tools** (Cursor, Devin, Copilot, Claude Code) make each developer faster — they're great at that. They don't know the project's phase, the org's policy, or whether a workflow has earned the right to ship this kind of change without human review. Coznt does.
- **Work trackers** (Linear, Jira, Asana) record what's planned and shipped. They don't act on it, and they don't grade the quality of AI-assisted action. Coznt does.
- **Autonomy with observability** is what lets AI velocity compound at organizational scale instead of paying for itself in reviews.

For organizations that have to ship faster *and* show their work — without each new piece of AI work re-paying the review tax of the first.

---

## What the developer sees

Coznt is not a screen the developer visits — it is a layer their **AI editor and CLI agents read on every turn**, so the agent's reasoning and the project's rules can never drift apart. The job is to steer Cursor, Claude Code, Cline, Continue, Zed, `claude -p`, `cursor-agent`, `codex exec`, and any other MCP-compliant agent toward what this project, in its current phase, under its current policy, is actually allowed to do.

- **Project context, every turn.** The agent calls `get_my_context` to get the project, current phase, allowed and forbidden tools, active rules, the developer's identity, and the autonomy level of every skill bound to this project. The editor's reasoning is grounded in the same truth the server-side gate enforces.
- **Choreographies as native skills.** `coznt sync` drops workflow guides into `.coznt/skills/` as SKILL.md files. Cursor surfaces them as slash-commands, Claude Code reads the frontmatter natively, Cline / Continue / Zed pick them up via MCP. The playbook for *"story approved → run test-author → mark gate"* rides in the developer's repo, versioned with it.
- **Phase boundaries as inline errors.** Ask the agent to edit source code while the project is in `design`? The verb returns a 409 with a structured message — *"source-code work is forbidden in `design`; advance to `development` first"*. The editor explains the error in the developer's own language. The boundary stops being a wiki page and starts being a runtime answer.
- **Autonomy visible in the daily loop.** Each skill's level (Intern / Junior / Senior / Principal) is part of the context payload. The agent knows up-front whether `invoke_skill` will run unattended or route into the human-approval inbox — no surprise blocks at submission time.
- **One click out to approval and audit.** When something blocks, the structured error includes the URL into the coznt UI where the developer can request approval, see the rule that fired, or override with a recorded reason.

This is the 70% of coznt's surface area the developer touches every day. The audit dashboard, ledger exports, and check-run gating exist because of what happens in this loop — not the other way around.

---

## How it works

Each agent turn in the editor or CLI runs through one cycle:

```
agent reads context (project, phase, allowed tools, autonomy)
   ──► agent acts within those rules
      ──► outcome assessed and written to the ledger
         ──► autonomy recomputed for the next turn
            ──► next context payload reflects the change
```

That cycle fires hundreds of times a day in every developer's editor. The ledger that builds up across those cycles is what makes the next cycle safer:

- the agent's context payload grants — or denies — an increasing share of SDLC work **under declared policy**,
- evidence and approvals fire **before** an action lands, not after,
- every plan revision, gate decision, agent action, and human override is recorded in a **deterministic, reproducible execution ledger** — every row is a stable hash of its fields, so two exports over the same window produce byte-identical output and any post-hoc edit shows up as a hash drift,
- and workflows that have demonstrably earned it are **progressively granted greater autonomy**.

Audit defense falls out for free. If every autonomous action is observed and committed to the ledger, the evidence packet already exists.

**Autonomy isn't a permanent grant.** The same ledger that earned a skill Senior also revokes it the moment a critical incident lands — and every open pull request by that skill flips from passing to blocked, automatically. The execution gate evaluates each PR against a published policy (autonomy × change risk × active rules × phase × human override) and posts the verdict as a GitHub check-run, so the merge UI is physically gated on earned trust, not advisory text.

The result: faster delivery without losing operational control.

---

## The architecture: daemon + choreography

Coznt is the daemon. The client is your AI editor or CLI agent — Cursor, Claude Code, Cline, Continue, Zed, `claude -p`, `cursor-agent`, `codex exec`, or any MCP-compliant host.

- **Workflow choreography** distributes to each developer's repository via `coznt sync` as MCP-discoverable SKILL files under `.coznt/skills/`. Claude Code reads the frontmatter natively, Cursor surfaces them as slash-commands, the same files work for every host. The choreography tells the AI *when* to call *which* governed verb — it is the playbook, not the prompt.
- **Governed actions stay on the server.** Every `invoke_skill`, `upsert_plan`, `mark_gate_passed`, `submit_for_approval` call hits Coznt. The autonomy gate fires *before* dispatch. The outcome ledger writes *during* execution. Schema validation happens server-side, never in the agent.

The AI does the creative work — drafting, reasoning, suggesting. Coznt does the governed work — project state, autonomy gating, outcome writes, approvals. **Push the choreography, keep the daemon.**

There is a hard line in what the daemon writes. **Coznt writes governance metadata — verdicts, check-runs, approvals, ledger rows. It does not write the underlying work product — branches, PRs, tickets, source code.** That separation is load-bearing: the autonomy ledger is only credible if the grader isn't also the actor for the thing it grades. The agent opens the PR; coznt grades it. Jira owns the ticket; coznt records the outcome. This is why MCP verbs like `create_pr` and `push_to_external` are excluded from the surface — not because they're hard, but because shipping them would compromise the trust property that makes the ledger worth anything.

This split is what makes a per-project autonomy ledger possible. If the LLM call ran locally, the ledger could only ever be reactive — a record of what already happened. With the daemon as the single execution chokepoint, the gate is *preventive*: a skill operating below its required autonomy on a given project is denied before the LLM is ever invoked, and the call routes into the approval inbox instead. Trust is graded per project from evidence, not granted at install.

---

## What makes Coznt different

Most AI coding tools optimize code generation. **Coznt optimizes organizational throughput** — the rate at which a team can ship safely without each new piece of AI work re-paying the review tax of the first.

It continuously converts proven execution patterns into safe autonomous delivery capacity.

| Category | What they have | What they're missing |
|---|---|---|
| Linear / Jira / Asana | Observability of work | Autonomy — they don't act |
| Cursor / Devin / Copilot | Autonomy in code generation | **Project, phase, and policy awareness** — they don't know what *this* project, in *this* phase, under *this* org's policy is actually allowed to do, or whether a workflow has earned the right to run unattended. And no observability of their org-wide impact. |
| GitLab / Azure DevOps | Pipeline automation + signal | Earned autonomy — pipelines don't graduate |
| Sonar / Snyk | Risk signal | Action — they detect, they don't allow more |
| ai-sdlc-framework (OSS) | The loop, single-repo | Multi-project, hosted, portfolio-wide |
| Cursor-first SDLC platforms (e.g. SDLC Transformation Platform) | An MCP write surface for the agent — tools for requirements / ADRs / tests / plans, so the editor lands artifacts directly into a system of record | **The gating layer underneath.** Writes execute on call, not after a per-project policy gate; outcomes are not graded into an autonomy ledger; no role separation between the agent that writes and the system that grades. The audit trail records what happened, but the next cycle isn't structurally safer than the last. *Also missing:* cross-project portfolio view, causal DORA attribution, audit-grade hash-chained execution history. |
| Local-AI workflow toolkits (gstack, `.claude/skills`, `.cursor/rules`) | Frictionless skill files distributed with the repo and loaded natively by the AI editor — the pattern Coznt borrows for choreography distribution | A server-side governed runtime. They *distribute* but never *execute* centrally — no observable invocations, no autonomy ledger, no per-project trust budget |

Coznt closes the loop none of these close — between an AI taking action in any editor or CLI and an organization being able to trust it with more.

**Coznt is MCP-compatible, not Cursor-bound.** The MCP server is distributed privately — bundled with the Coznt deployment or pulled from the customer's internal artifact registry — because Coznt is for governed orgs whose supply-chain policy won't tolerate public-registry pulls. The platform never requires a specific IDE or agent runtime — the daemon steers whichever editor or CLI the developer already chose. Bootstrap is `coznt connect` (wires the host's MCP config and `.coznt/config.json`) followed by `coznt sync` (pulls the project's choreography bundle). No JSON copy-paste, no per-developer config drift.

**A trace, end-to-end:** Devin's agent in Cursor pulls his context — project, phase, allowed/forbidden, his skill's autonomy level. The agent opens a PR; coznt evaluates and posts a `success` check-run because the skill is Senior and the change is medium-risk. A week later the same skill ships an incident on a sibling project — the ledger demotes it to Intern within 5 minutes, and the agent's three other open PRs flip from passing to blocked automatically. The CISO queries `/audit` filtered to that skill's window and gets a reproducible CSV with the full chain: who reviewed, what was approved, when autonomy changed, which PRs were affected.

---

## Core capabilities

Every capability either tightens the loop or makes one side of it cheaper.

1. **IDE-native workflow guidance** — *the daily-touch surface.* On every agent turn the editor or CLI pulls project + phase + allowed/forbidden tools + active rules + the developer's skill-autonomy levels from coznt. Choreographies sync into `.coznt/skills/` as SKILL.md files the agent loads natively (slash-commands in Cursor, frontmatter in Claude Code, MCP-discoverable in Cline / Continue / Zed, same files served to `claude -p` / `cursor-agent` / `codex exec`). The agent's reasoning runs grounded in the same truth the server-side gate enforces — no drift between what the agent thinks is allowed and what is.
2. **Trust and autonomy scoring** — *tightens the loop.* Workflows and agents earn graduated autonomy from real delivery outcomes. Escalation only when uncertainty or risk is high.
3. **Continuous delivery risk evaluation** — *tightens the loop.* Every change is scored by a published policy (autonomy × change risk × rules × phase) before it can merge. The policy is a pure function — table-testable, reproducible across runs. When autonomy changes mid-stream, open changes are automatically re-evaluated; nothing has to be re-run by hand.
4. **Automated evidence collection** — *makes observability cheaper.* Every gate decision, agent action, and override is captured and directly exportable to SOC 2 / ISO 27001 evidence packets.
5. **Adaptive governance** — *makes autonomy cheaper.* Policies and phase gates are declared per project and evaluated at every transition — not hard-coded into the pipeline.
6. **Cross-project portfolio observability** — *observability side.* One view across every project, gate, and agent action.
7. **Audit-grade execution history** — *observability side.* Deterministic, reproducible, queryable — every row's `row_hash` = sha256(`prev_hash` ‖ canonical fields), per-org, so tampering with any row breaks the chain at the next row. Exports are byte-stable; verification is a single `POST /api/v1/audit/verify` call that walks the chain and surfaces the first divergence. (Cryptographic *signing* with a customer-controlled keypair is on the v2 roadmap; the hash chain itself is shipped.)
8. **Per-phase tool discipline** — *makes autonomy cheaper.* Each phase declares allowed and forbidden actions explicitly. Agents see the boundary in their context payload (`get_my_context`); the gate enforces it server-side. *"No source-code work outside `development`"* stops being a wiki page and starts being a 409 on the wire.

A feature that only adds another chart is table-stakes. A feature that only adds another agent is a tool. A feature that tightens the loop between observation and earned autonomy is Coznt.

---

## The long-term vision

The loop compounds. Each cycle of observation → assessment → ledger update makes the next cycle cheaper.

Organizations using Coznt develop increasingly autonomous delivery systems:

- low-risk workflows become nearly self-operating,
- trusted agents handle repetitive implementation paths,
- humans focus on architecture, judgment, and exceptions,
- and leadership gains real-time operational visibility across the portfolio.

Coznt is the infrastructure that lets AI-native software organizations scale execution without losing trust, accountability, or control.
