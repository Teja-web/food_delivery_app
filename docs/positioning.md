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

Every agent turn involves **two distinct LLM call sites**, and the architecture splits them deliberately:

- **Agent-loop LLM** — the host LLM inside Cursor / Claude Code / Codex. Reads the user's prompt, follows the choreography, picks the right verb to call. Runs client-side; coznt doesn't try to replace it. The developer's IDE subscription pays for these tokens.
- **Governed-skill LLM** — the call that fires when the agent invokes `invoke_skill('test-author')` or any other generator skill. Runs **server-side**, inside coznt's `generate()`, under autonomy gate. The skill's prompt template, system prompt, model selection, retry policy, and Zod-validated output schema all live in the daemon. The agent never sees the prompt; it sees the structured result.

The two pieces that distribute:

- **Workflow choreography** distributes to each developer's repository via `coznt sync` as MCP-discoverable SKILL files under `.coznt/skills/`. Claude Code reads the frontmatter natively, Cursor surfaces them as slash-commands, the same files work for every host. The choreography tells the AI *when* to call *which* governed verb — it is the playbook, not the prompt.
- **Governed actions stay on the server.** Every `invoke_skill`, `upsert_plan`, `mark_gate_passed`, `submit_for_approval` call hits Coznt. The autonomy gate fires *before* dispatch. The outcome ledger writes *during* execution. Both input and output are validated server-side against the same Zod schemas that write to the database.

**Push the choreography, keep the daemon.** The AI does the creative work — drafting, reasoning, picking the right verb at the right step. Coznt does the governed work — running the skill prompt under policy, recording the outcome, recomputing autonomy, surfacing approvals.

### Why the daemon stays load-bearing

Four properties of server-side skill execution are hard to reproduce with host-LLM execution plus post-hoc observation:

1. **Typed dispatch via Zod-validated output.** `generate()` parses the response against the same Zod schema that writes to the database and retries on parse failure. Host-LLM execution can ask for JSON but cannot enforce schema match at the call layer — parse failures bounce around the conversation as the agent re-prompts itself.
2. **Deterministic outcome attribution.** Every `invoke_skill` call appends a `skill_outcomes` row by construction. The autonomy ledger is causally tied to the LLM call rather than to whatever the agent self-reports afterward.
3. **Server-assembled context.** The skill prompt can inject full project history, related ADRs, hybrid-search hits from `coznt.documents`, recent outcomes — stitched together server-side from data the host has no read path to.
4. **Audit completeness.** Every governed prompt, system prompt, model, temperature, and structured output is logged by construction. With host-LLM, you only have what the agent volunteered.

Secondary but real: prompt versioning (bump once server-side, every project gets it on the next call); model routing by skill level (Intern-tier skills on cheap models, Principal-tier on expensive ones); prompt IP (specialized org-tuned prompts stay in the daemon, not shipped to every dev repo).

### What the daemon doesn't gate (and where prompt capture fits)

The daemon governs the **skill-invocation** path. It does not govern the **agent-loop** path — the host LLM's reasoning that runs between governed `invoke_skill` calls, on the developer's tokens, under the developer's process. That's the same blind spot every IDE-MCP architecture has by design.

Coznt closes it with two converging layers, both shipped:

1. **MCP verbs** — `log_prompt`, `rate_prompt`, `get_prompt_author`, `flush_local_prompts` make every agent turn observable from any host (Cursor, Cline, Continue, Zed). Sub-GOOD prompts emit a `prompt_quality_signal` row that feeds the autonomy ledger as a *leading indicator* — sustained low-quality input slows promotion on that project but never triggers demotion, which stays outcome-driven.
2. **Claude Code `UserPromptSubmit` hook** — installed by `coznt connect --install-prompt-hook` (default-on for Claude Code, opt-in elsewhere). Scores every prompt locally against the canonical 6-dim rubric and can block below `COZNT_PROMPT_MIN_SCORE` *before* the prompt reaches the model. Pre-flight gating where the host supports it.

**Prompt capture is observability + pre-flight gating for the agent loop. The daemon is typed, audited execution for skill calls.** They solve different problems and both feed one ledger.

### Hard line: what the daemon writes

Coznt writes governance metadata — verdicts, check-runs, approvals, ledger rows. **It does not write the underlying work product — branches, PRs, tickets, source code.** That separation is load-bearing: the autonomy ledger is only credible if the grader isn't also the actor for the thing it grades. The agent opens the PR; coznt grades it. Jira owns the ticket; coznt records the outcome. This is why MCP verbs like `create_pr` and `push_to_external` are excluded from the surface — not because they're hard, but because shipping them would compromise the trust property that makes the ledger worth anything.

This split is what makes a per-project autonomy ledger possible. If the **governed-skill LLM call** ran locally, the ledger could only ever be reactive — a record of what already happened. With the daemon as the chokepoint for skill invocations, the gate is *preventive*: a skill operating below its required autonomy on a given project is denied before any governed tokens are spent, and the call routes into the approval inbox instead. Trust is graded per project from evidence, not granted at install.

### Convergence on chassis, divergence on engine

The substrate of this category — six-phase SDLC model, MCP-as-governance-surface, phase-tool gating, session correlation, generated-skills catalog — is converging across products. The differentiation lives in where the skill LLM call runs. Host-LLM platforms push the skill prompt to the IDE and observe the side effects. Coznt pushes only the choreography and runs the skill prompt server-side under autonomy gate. That's the architectural fork the comparison table below traces — not an MCP surface detail, a load-bearing decision about where the governance line sits.

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
