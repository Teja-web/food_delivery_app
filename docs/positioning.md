# Coznt

**Coznt is autonomy with observability for AI-assisted software delivery.**

AI agents earn the right to do more. Humans always see what they did and why.

Neither half is a product on its own:

- Observability without autonomy is a dashboard. Linear and Jira already do that.
- Autonomy without observability is unsafe AI. Cursor and Devin do that; governed organizations won't deploy it into real delivery work.
- **Autonomy with observability** is the only formulation that earns its way into a governed organization.

For organizations that have to ship faster *and* show their work.

---

## How it works

Every AI-assisted action runs through one loop:

```
AI takes an action ──► recorded with full context ──► outcome assessed ──►
trust ledger updates ──► next action runs with less friction ──► recorded again ──► …
```

As work moves through planning, implementation, testing, review, and deployment, Coznt:

- enables AI agents to perform an increasing share of SDLC work **under declared policy**,
- enforces required evidence and approvals **before** an action lands,
- records every plan revision, gate decision, agent action, and human override in a **deterministic, reproducible execution ledger** — every row is a stable hash of its fields, so two exports over the same window produce byte-identical output and any post-hoc edit shows up as a hash drift,
- and **progressively grants greater autonomy** to workflows that have demonstrably earned it.

Audit defense falls out for free. If every autonomous action is observed and committed to the ledger, the evidence packet already exists.

**Autonomy isn't a permanent grant.** The same ledger that earned a skill Senior also revokes it the moment a critical incident lands — and every open pull request by that skill flips from passing to blocked, automatically. The execution gate evaluates each PR against a published policy (autonomy × change risk × active rules × phase × human override) and posts the verdict as a GitHub check-run, so the merge UI is physically gated on earned trust, not advisory text.

The result: faster delivery without losing operational control.

---

## What makes Coznt different

Most AI coding tools optimize code generation. **Coznt optimizes organizational throughput** — the rate at which a team can ship safely without each new piece of AI work re-paying the review tax of the first.

It continuously converts proven execution patterns into safe autonomous delivery capacity.

| Category | What they have | What they're missing |
|---|---|---|
| Linear / Jira / Asana | Observability of work | Autonomy — they don't act |
| Cursor / Devin / Copilot | Autonomy in code generation | Observability of governance impact |
| GitLab / Azure DevOps | Pipeline automation + signal | Earned autonomy — pipelines don't graduate |
| Sonar / Snyk | Risk signal | Action — they detect, they don't allow more |
| ai-sdlc-framework (OSS) | The loop, single-repo | Multi-project, hosted, portfolio-wide |
| Cursor-first SDLC platforms (e.g. SDLC Transformation Platform) | Hosted IDE-write surface — real MCP server, write tools for requirements / ADRs / tests / PRs, the agent's daily workplace | Cross-project portfolio observability, causal DORA attribution, audit-grade execution history, earned-autonomy ledger as a trust artifact |

Coznt is the layer above all of these — the only one that closes the loop between AI taking action and an organization being able to trust it with more.

**Coznt is MCP-compatible, not Cursor-bound.** Coznt ships a Model Context Protocol server any compliant agent client mounts — Cursor, Claude Code, Cline, Continue, Zed, custom agents via the MCP SDK. The server is distributed privately (bundled with the coznt deployment or via the customer's internal artifact registry) — coznt is for governed orgs whose supply-chain policy won't tolerate public-registry pulls. The platform never requires a specific IDE; the IDE is one of several inputs the organization observes.

**A trace, end-to-end:** Devin's agent in Cursor pulls his context — project, phase, allowed/forbidden, his skill's autonomy level. The agent opens a PR; coznt evaluates and posts a `success` check-run because the skill is Senior and the change is medium-risk. A week later the same skill ships an incident on a sibling project — the ledger demotes it to Intern within 5 minutes, and the agent's three other open PRs flip from passing to blocked automatically. The CISO queries `/audit` filtered to that skill's window and gets a reproducible CSV with the full chain: who reviewed, what was approved, when autonomy changed, which PRs were affected.

---

## Core capabilities

Every capability either tightens the loop or makes one side of it cheaper.

1. **Trust and autonomy scoring** — *tightens the loop.* Workflows and agents earn graduated autonomy from real delivery outcomes. Escalation only when uncertainty or risk is high.
2. **Continuous delivery risk evaluation** — *tightens the loop.* Every change is scored by a published policy (autonomy × change risk × rules × phase) before it can merge. The policy is a pure function — table-testable, reproducible across runs. When autonomy changes mid-stream, open changes are automatically re-evaluated; nothing has to be re-run by hand.
3. **Automated evidence collection** — *makes observability cheaper.* Every gate decision, agent action, and override is captured and directly exportable to SOC 2 / ISO 27001 evidence packets.
4. **Adaptive governance** — *makes autonomy cheaper.* Policies and phase gates are declared per project and evaluated at every transition — not hard-coded into the pipeline.
5. **Cross-project portfolio observability** — *observability side.* One view across every project, gate, and agent action.
6. **Audit-grade execution history** — *observability side.* Deterministic, reproducible, queryable — every row hashes its fields so exports are byte-stable and downstream tooling can diff them. (Cryptographic signing and per-row chaining are on the roadmap for the v2 compliance surface.)
7. **Per-phase tool discipline** — *makes autonomy cheaper.* Each phase declares allowed and forbidden actions explicitly. Agents see the boundary in their context payload (`get_my_context`); the gate enforces it server-side. *"No source-code work outside `development`"* stops being a wiki page and starts being a 409 on the wire.

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
