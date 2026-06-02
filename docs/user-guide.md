# Coznt — User Guide

Coznt is the AI-assisted SDLC governance daemon. Your AI editor or CLI agent talks to it on every turn so the agent knows the project's phase, what's allowed, which choreography to run, and what autonomy your skills have earned. The audit ledger, approval inbox, and GitHub check-runs exist because of what happens in that loop — not the other way around.

This guide has three parts:

- **Part A — For developers.** You've landed on a project where coznt is already running. Wire up your editor or CLI, sync the project's choreographies, run your first governed AI turn, and walk the loop end-to-end.
- **Part B — For operators.** You're standing coznt up for a team. Install the daemon, bind GitHub, create projects, verify the loop end-to-end.
- **Part C — Reference.** Screens, troubleshooting, where to go next.

---

## The loop, in one picture

Coznt is one feedback loop. The developer ships → webhooks become ledger rows → autonomy recomputes per project → the next IDE turn reads the fresh autonomy. Everything below is how to run each node.

```
                          DEVELOPER ENGAGEMENT FLOW — COZNT
                          ─────────────────────────────────

  ┌──────────────┐    install     ┌────────────────────────────────────┐
  │  Developer   │───────────────▶│  IDE (Cursor) + Coznt MCP server   │
  │  (IDE/CLI)   │◀───skills──────│  .coznt/skills/  ·  invoke_skill() │
  └──────┬───────┘                └────────────────┬───────────────────┘
         │                                         │
         │  1. pick / create Project               │
         ▼                                         │
  ┌────────────────────────────────────────────┐   │
  │  PROJECT  (phase: requirements → design →  │   │
  │           development → testing → cicd →   │   │
  │           monitoring)                      │   │
  └──────┬─────────────────────────────────────┘   │
         │                                         │
         │  2. author work                         │
         ▼                                         │
  ┌────────────────────────────────────────────┐   │
  │  PLAN  (epic | feature | story | adr |     │   │
  │   test_plan | release_plan)                │   │
  │   draft → in_review → approved → …         │   │
  └──────┬─────────────────────────────────────┘   │
         │                                         │
         │  3. request sign-off                    │
         ▼                                         │
  ┌────────────────────────────────────────────┐   │
  │  APPROVAL  (polymorphic: plan / gate /     │   │
  │             release / work_item)           │   │
  └──────┬─────────────────────────────────────┘   │
         │ approved                                │
         ▼                                         ▼
  ┌────────────────────────────────────────────────────────────────┐
  │  4. CODE  →  open PR  →  CI  →  deploy                         │
  └──────┬─────────────────────────────────────────────────────────┘
         │ GitHub / deploy webhooks
         ▼
  ┌────────────────────────────────────────────┐
  │  process-webhook-event  (pgmq task)        │
  │     ↓ deterministic assessors              │
  │  pr_merge · pr_revert · pr_abandon ·       │
  │  deploy_clean · deploy_incident            │
  └──────┬─────────────────────────────────────┘
         │ append-only
         ▼
  ┌────────────────────────────────────────────┐         ┌──────────────────────┐
  │  SKILL_OUTCOMES ledger                     │────────▶│  PHASE GATE eval     │
  │  verdict: success | rolled_back | incident │         │  approval · coverage │
  └──────┬─────────────────────────────────────┘         │  lint · security     │
         │ trigger → pgmq                                └──────┬───────────────┘
         ▼                                                      │ PASS/SKIP
  ┌────────────────────────────────────────────┐                ▼
  │  recomputeSkillAutonomyTask                │         project advances phase
  │  30-day window → level per (skill,project) │
  │  0 observe · 1 propose · 2 merge · 3 lead   │
  └──────┬─────────────────────────────────────┘
         │
         ▼
  ┌────────────────────────────────────────────┐    visible to dev
  │  PORTFOLIO / AUDIT / METRICS               │◀────────────────── back to IDE
  │  Trust pillar — every claim links to       │      autonomy upgrades unlock
  │  a source-of-record. Verification debt =   │      more skill autonomy in IDE
  │  the analytical primitive over this layer  │
  └────────────────────────────────────────────┘
```

Steps A1 → A4 cover the IDE side (top half of the diagram). **A7 — Walking the full loop** drives the bottom half: plan, approval, code, webhook, ledger, autonomy, phase advance.

---

## Where coznt sits in your stack

Coznt overlays your existing SDLC tools — it doesn't replace them. Two questions decide how each node of the loop behaves: *where does the system of record live*, and *is it bound to this project yet?*

- **Code** lives in Git (GitHub / GitLab / Bitbucket / ADO Repos). Coznt grades it via webhook; it never pushes back.
- **Work items** live in Jira / ADO Boards / Linear / GitHub Issues. When the tracker is bound (operator step B5), coznt mirrors items into the project cockpit's **WorkItems** tab and routes status writes back via the adapter. When no tracker is bound (greenfield), coznt acts as the temporary tracker — plans authored via `upsert_plan` live natively in the **Plans** tab and are the system of record until you bind one.
- **Docs** live in Confluence / Notion. ADRs created via `log_decision` can publish-down after approval (server-side, never from the agent directly).
- **CI/CD** lives in GitHub Actions / ADO Pipelines. Coznt reads pipeline status and can scaffold definitions; the runs themselves stay upstream.
- **Deploy outcomes** arrive as webhooks and drain into the audit ledger.

The walkthrough in **A7 — Walking the full loop** uses the greenfield path so every node happens inside coznt and you can see the whole loop in one place. For brownfield (Jira/ADO bound), Step 3 swaps `upsert_plan` for `get_assigned_work`; Steps 4–9 are identical because gates, approvals, the skill ledger, and the audit chain live in coznt regardless of where the work originated.

---

# Part A — For developers

> You're joining a project where coznt is already running. Your platform team gave you a coznt URL and (or pointed you at) the internal `coznt` CLI distribution. This part takes you from a fresh clone to your first governed AI turn.

## A1. What you need

- An AI editor or CLI agent — one of:
  - **Claude Code** (also covers the `claude -p` CLI)
  - **Cursor** (also covers `cursor-agent`)
  - **Codex** (also covers `codex exec`)
  - **Continue**
- An **API key** from the coznt UI: visit `<your-coznt-url>/api-keys`, pick the **Project** to bind the key to, set a **Name** (e.g. `cursor-laptop`) and optional expiry, click **Mint key**, and copy the plaintext immediately — it's shown once. Every key is pinned to exactly one project; the MCP session auto-binds on first tool call. If you work across multiple projects, mint one key per project (run `coznt connect` in each repo).
- The **coznt MCP server** and the **`coznt` CLI** — both served as tarballs by your coznt deployment itself, at `<your-coznt-url>/install/coznt-mcp/latest` and `<your-coznt-url>/install/coznt-cli/latest` respectively (each redirects to the deployment's current pinned version). No public npm, no separate install step. The editor pulls the MCP server via `npx -y <mcp-url>` on first use. Install the CLI once with `npm i -g <cli-url>` (or invoke ad-hoc with `npx -y <cli-url> <command>`). Both are required: the MCP server is what the AI talks to on every turn; the CLI does the local repo wiring (`coznt connect`) and the choreography sync (`coznt sync`).

## A2. Connect your editor or CLI

Goal: bind your repo to a coznt project, and wire the editor's MCP config to talk to the daemon.

**Do this from inside your project repo:**

```bash
npm i -g <your-coznt-url>/install/coznt-cli/latest    # one-time, ~13 KB
coznt connect
```

`coznt connect`:

1. Auto-detects your editor by scanning for `.claude/`, `.cursor/`, `.codex/`, `.continue/` markers (prompts if multiple, asks if none). Override with `--editor=<host>`.
2. Asks for the coznt server URL and your API key.
3. Picks the project to bind (fuzzy-matches by slug, name, or id).
4. Writes the editor's MCP config (pointing at `npx -y <your-coznt-url>/install/coznt-mcp/latest`) and `.coznt/config.json` (project binding + server URL).

Restart the editor. Sanity-check by asking the agent to call `get_my_context` — it should return your project, current phase, allowed tools, active rules, and your skills' autonomy levels.

> **No-CLI fallback.** If you can't install the CLI (locked-down machine, etc.), visit `<your-coznt-url>/api-keys` and use the **Host Config** panel: it renders the same MCP config JSON pre-filled with your coznt URL, install endpoint, and API key. Copy → paste into the editor's config file. You'll still need to run `coznt sync` later (or skip choreographies entirely).

> **If it doesn't work.** Verify both endpoints with `npx -y <your-coznt-url>/install/coznt-mcp/latest --version` and `npx -y <your-coznt-url>/install/coznt-cli/latest --version`. If either fails, check that your coznt URL is reachable and that the deployment ran `pnpm build` (which populates `public/install/`).

## A2.5. Install the prompt-quality hook (Claude Code)

If your editor is Claude Code, `coznt connect` installs a `UserPromptSubmit` hook by default. The hook scores every prompt you type against the canonical 6-dimension rubric (clarity, context, specificity, constraints, phase-fit, safety) **locally** — no LLM cost, no network latency in the hot path — then fires a best-effort POST to the coznt deployment so the score lands in the autonomy ledger.

What you'll see in the editor:

- **GOOD tier (≥80):** silent. Prompt runs as-is.
- **NEEDS_IMPROVEMENT / POOR:** Claude Code displays the rubric breakdown + suggestions as additional context alongside your prompt. The model sees the coaching; you can ignore or revise.
- **Below `COZNT_PROMPT_MIN_SCORE`** (only if you've set that env var): the prompt is **blocked** before reaching the model. The reason is shown inline.

Disable per-repo with `coznt connect --no-install-prompt-hook`. Remove later with `coznt prompt-hook uninstall`. Check status with `coznt prompt-hook status`.

Sub-GOOD prompts emit a project-level signal row into the autonomy ledger. Sustained low-quality prompts raise the bar for skill promotion on that project — they do not, however, demote a skill. Demotion is reserved for actual `incident` / `rolled_back` outcomes.

Requires `COZNT_PROMPT_GOVERNANCE_ENABLED=1` on the deployment. See [`docs/operate/prompt-hook.md`](operate/prompt-hook.md) for the install lifecycle and troubleshooting.

## A3. Sync the project's choreographies

```bash
coznt sync
```

Pulls the bound project's choreographies into `.coznt/skills/` as `SKILL.md` files (with a `.lock` per skill — content hash for drift detection). **Commit `.coznt/skills/`** so teammates get the same workflows on `git pull`.

How they surface per host:
- **Claude Code** — read natively from frontmatter; show up as skills.
- **Cursor** — surface as slash-commands (`/<slug>`).
- **Codex / Continue** — MCP-discoverable via the choreography list.
- **CLI agents** (`claude -p`, `cursor-agent`, `codex exec`) — served by the same MCP config the editor uses.

A choreography is the **playbook**, not the prompt. It tells the AI *when* to call *which* governed verb — e.g. *"once a story is approved → call `invoke_skill('test-author')` → on success, call `mark_gate_passed('coverage')`."*

## A4. Your first AI turn

Every API key is pinned to exactly one project (see A1), so the **MCP session auto-binds on the first tool call** — the server resolves the key's project via `GET /api/v1/mcp/me` and caches it for the life of the MCP process. The agent never has to call a binding verb; `get_my_context` is genuinely the first thing it runs. A typical `get_my_context` response (shape is illustrative):

```json
{
  "project": { "name": "Payments API", "phase": "development", "url": "..." },
  "you":     { "name": "you@team.com", "userId": "..." },
  "allowedTools":   ["upsert_plan", "invoke_skill", "log_decision", "update_test_result", "..."],
  "forbiddenTools": ["create_pr", "push_to_external", "setup_workspace"],
  "rules": [
    { "id": "rule_iac", "title": "Payment-write endpoints require idempotency keys", "severity": "error" }
  ],
  "skills": [
    { "slug": "test-author", "level": "MERGE", "autonomyDescription": "auto-runs <50 LOC + 80% coverage" }
  ]
}
```

The agent grounds every action in this payload. A simple turn:

1. You ask the agent: *"Run the test-author choreography on the diff."*
2. The agent opens `.coznt/skills/test-author/SKILL.md` and follows it.
3. The agent calls `session_start` with intent `"running test-author on diff"`. Coznt opens a session row; every verb call this turn carries the session id, so the audit log can replay the full span later.
4. The choreography says *"call `invoke_skill('test-author')`."* The agent calls it.
5. Coznt's autonomy gate fires **before dispatch**. `test-author` is `MERGE` on this project → runs unattended.
6. The governed LLM call runs server-side (inside `generate()` in `src/lib/ai/`). The output is Zod-validated against the skill's output schema; on parse failure the daemon retries up to 3 times. The structured result returns to the agent — never raw text.
7. A row lands in `skill_outcomes` with `verdict='success'` and `sourceKind='invocation'`, linked to the session.
8. Worker recomputes autonomy for `(test-author, payments-api)`.
9. The agent calls `session_end` with a 1-2 sentence summary. The session's tool-call count and duration land in the audit row.

You — the developer — review the generated tests, commit, push, open the PR using your normal tooling. Coznt watches that PR via webhook and grades it at merge time.

## A4.5. The verb surface

These are the MCP verbs the agent can call. Availability depends on the project's current phase — `get_my_context` always returns the live `allowedTools` / `forbiddenTools` lists. The full tiered spec lives in [`docs/spec/mcp-verbs.md`](spec/mcp-verbs.md).

### Always allowed (every phase)

| Verb | Purpose |
|---|---|
| `get_my_context` | Project, phase, allowed/forbidden tools, active rules, skill autonomy levels |
| `get_project_status` | Phase, gates, recent activity |
| `get_phase_checklist` | What's left before the current phase can advance |
| `get_assigned_work` | Work items synced from your tracker |
| `get_requirements` | Approved requirements for the bound project |
| `check_standards` | Validate code against project + org-wide rules |
| `submit_phase_for_review` | Open an approval request to advance phase |
| `advance_phase` | Move the project to the next phase (post-approval) |
| `mark_gate_passed` | Mark a phase gate as passed/skipped |
| `session_start` / `session_end` | Open and close a turn-spanning session for audit attribution |

### Authoring + delivery

| Verb | Phase(s) | Purpose |
|---|---|---|
| `draft_requirement` / `list_draft_requirements` / `update_draft_requirement` / `delete_draft_requirement` | requirements | Per-process draft buffer (no DB writes) |
| `create_requirement` | requirements | Create a story plan from inline content |
| `push_requirements` | requirements | Push session drafts (or inline batch) to the platform |
| `upsert_plan` | dev, design, testing, cicd | Coznt's documents semantic — author/version any plan kind (epic / feature / story / adr / test_plan / release_plan / storyboard / dev_summary / go_live_report / cicd_pipeline / incident) |
| `get_plans` | all | Coznt's `get_documents` — list/fetch plans with kind/status filters |
| `get_design_context` | design, dev, testing | ADRs (with bodies) + active features/stories + linked work items |
| `log_decision` | design, dev | Record an ADR (writes `plan kind=adr`) |
| `submit_for_approval` | requirements, design, testing, cicd | Open an approval request against a plan / requirement / gate |
| `update_work_item_status` | dev, testing, cicd | Coznt-side status update (no upstream push — that's intentionally excluded) |
| `update_test_result` | testing | Append a test-run row |
| `generate_pipeline` | cicd | Templated pipeline scaffold (GitHub Actions or ADO) |
| `get_pipeline_status` | cicd, monitoring | Latest deploy + recent test runs + active release_plan |

### Skill invocation

| Verb | Phase | Purpose |
|---|---|---|
| `invoke_skill` | all (per skill's `min_autonomy`) | **The keystone verb.** Dispatch a governed skill server-side under autonomy gate. The actual prompt + LLM call live in the daemon |
| `generate_tests` | design, testing | Convenience wrapper over `invoke_skill('test-author')` |

### Search the project's memory

| Verb | Returns |
|---|---|
| `search_plans` | Semantic + keyword search over plans; filters by `kinds[]` and `statuses[]` |
| `search_outcomes` | Skill outcome rows; filters by `verdicts[]` and date `range` |
| `search_audit` | Audit-log rows; filters by `actorType` and `scope` |
| `search_learnings` | Project learnings; pinned entries float when scores are close |

All four are hybrid (vector + BM25) over coznt's embedding index — same `searchSemantic()` machinery the CRUD factory exposes.

### Choreography distribution

| Verb | Purpose |
|---|---|
| `list_choreographies` | Manifest `{slug, version, hash, description, minAutonomy}[]` for the bound project |
| `sync_choreographies` | Full content bundle. Optional `slugs[]` filter |

These are what `coznt sync` calls under the hood; the agent rarely calls them directly.

### Agent-loop governance

These five close the gap on the agent loop itself — the host LLM's reasoning that runs between governed `invoke_skill` calls. Enable per-deployment by setting `COZNT_PROMPT_GOVERNANCE_ENABLED=1`.

| Verb | Phase | Purpose |
|---|---|---|
| `log_prompt` | all | Persist a USER / ASSISTANT / SYSTEM message to `prompt_logs`. Idempotent on `(projectId, clientLocalId)`; buffers to `.coznt/prompt-buffer.jsonl` on network failure |
| `rate_prompt` | all | Score a prompt against the canonical 6-dim rubric (clarity, context, specificity, constraints, phaseFit, safety). Returns tier (GOOD / NEEDS_IMPROVEMENT / POOR), dimension breakdown, suggestions, flags |
| `get_prompt_author` | all | Resolve local git user.name / user.email / OS username for prompt attribution. Pure-local; no platform call |
| `flush_local_prompts` | all | Drain `.coznt/prompt-buffer.jsonl` to the platform. Atomic on success — partial failures preserve the unflushed entries |
| `trigger_pipeline` | cicd only | Actively kick off a CI/CD run on GitHub Actions or Azure DevOps for the bound project |

Sub-GOOD prompts emit a `prompt_quality_signal` row into the autonomy ledger. Sustained low-quality prompts **slow** skill promotion on this project but never trigger demotion — that stays outcome-driven.

#### Install the prompt-quality hook (Claude Code)

When you run `coznt connect` in a Claude Code repo, the CLI offers to install a `UserPromptSubmit` hook that scores every prompt locally and posts to coznt. Override with `--install-prompt-hook` / `--no-install-prompt-hook`.

Set `COZNT_PROMPT_MIN_SCORE=60` (or any 0-100 threshold) in your env to **block** prompts below that score — Claude Code surfaces the reason inline and won't send the prompt to the model.

Remove the hook anytime with `coznt prompt-hook uninstall`.

### Blocked by design

`create_pr` and `push_to_external` are **intentionally excluded** from the verb surface. Coznt grades work products; it doesn't write them. The agent opens its own PRs via your normal git tooling; Jira/Confluence/ADO own their own tickets. This separation is what makes the autonomy ledger credible — the grader isn't also the actor.

## A5. When something blocks

Two block paths the developer notices:

**Phase boundary (structured 403).** Ask the agent to do source-code work while the project is in `design` and the verb returns:

```json
{
  "error": "Tool 'update_test_result' not allowed in phase 'design'",
  "phase": "design",
  "phaseGuidance": "In design: focus on architecture, ADRs, and interface contracts. Advance to development to begin implementation.",
  "advanceVia": "submit_phase_for_review"
}
```

The agent surfaces `phaseGuidance` in your language. Either advance the phase (if it's ready) or pick work that fits the current one.

**Autonomy denial.** A skill operating below its required autonomy on this project is denied **before the LLM is invoked** and the request routes to `<your-coznt-url>/approvals`. Open the inbox, see the rule that fired, approve / deny / override with a recorded reason. Approvals show up in the agent's next `get_my_context` payload — no manual retry coordination.

Auth errors (no key, expired key, key not bound to a project) return an error body with a `fixUrl` pointing at the page that fixes it (`/api-keys` or `/projects`). The agent renders the URL so you can click straight through.

## A6. Watching autonomy compound

Each skill's level — **Observe (0) → Propose (1) → Merge (2) → Lead (3)** — is **per project**. See it at `<your-coznt-url>/skills/<slug>`. The project cockpit's **Trust** tab shows skill outcomes scoped to that project.

The math: a **30-day trailing window** of `skill_outcomes` rows (`verdict ∈ {success, rolled_back, incident}`) feeds the recompute. Promotion takes sustained signal; demotion can happen on a single critical incident. When a skill demotes:

- Every open PR by that skill is re-evaluated against the new level.
- The gate flips its **GitHub check-run** on each PR's merge UI automatically.
- The agent's next `get_my_context` reflects the lower level.

To see the loop yourself, point coznt at a real repo and follow A7.

## A7. Walking the full loop

This section maps each node of the diagram above to a concrete action so you can drive the full loop yourself. Allow ~30 minutes start to finish. Pre-reqs: A1–A3 done (editor connected, choreographies synced), the project's repo has webhooks landing on coznt (see operator section B7 if not).

### Step 1 — Confirm your starting state

```bash
# If you have the coznt CLI:
coznt status               # prints project, phase, your skill autonomy levels

# Otherwise, hit the install endpoint directly to verify the MCP can be fetched:
npx -y <your-coznt-url>/install/coznt-mcp/latest --version
```

In the sidebar, open **Projects** → your project. This is your cockpit for the loop. Keep it open in a second tab — you'll watch rows land here as you work.

If `coznt status` says "no key found" or your editor can't reach the MCP server, open the **avatar menu (top-right) → API keys** and mint a new key scoped to this project. The page also exposes the in-UI host config panel — copy the snippet straight into your editor's MCP config.

### Step 2 — Pick a phase-appropriate piece of work

The project's current phase decides what verbs the agent can call. Confirm with `get_my_context` (your agent will do this automatically on its next turn). If you're early in the project lifecycle:

- **requirements** — author the epic/feature plan first
- **design** — author an ADR or interface contract
- **development** — author a story, then code
- **testing** — author the test_plan
- **cicd** — wire deploy gates
- **monitoring** — log incidents, post-mortems

If the project is in the wrong phase for what you want to do, advance it: ask the agent to call `submit_phase_for_review`. That opens an approval request on `/approvals`; once approved, the phase moves and the allowed-verb set changes on the next turn.

### Step 3 — Author a Plan

From your agent:

> "Create a story plan for adding idempotency keys to `POST /payments`. Acceptance: same `Idempotency-Key` returns the original response within 24h."

The agent calls `upsert_plan` (it's in the allowed list during `development`). The plan lands in the sidebar's **Plan → Plans** view (filterable across all projects) and inside the project cockpit's **Plans** tab — both in `draft` status. Open it; you should see the title, body, and metadata the agent wrote.

> **Brownfield variant.** If Jira / ADO / Linear is bound to this project, the agent doesn't author here — it calls `get_assigned_work` to pull the existing story from the tracker. The item shows up in the cockpit's **WorkItems** tab (not **Plans**), and status changes write back via the adapter. Steps 4–9 below are identical: the gate, approval, ledger, autonomy recompute, and audit row all run the same whether the work originated in coznt or upstream. Switching between greenfield and brownfield is a binding change (operator step B5), not a flow change.

If the write is *rejected*, open **Rules** from the avatar menu (top-right). A `keyword-presence` rule (e.g. "every story must contain an Acceptance section") or an `action-policy` rule may have blocked it. Rules are evaluated synchronously inside CRUD hooks, so the failure is visible in the agent's response — and the attempt is logged in **Audit log** even when it didn't land.

Move it to review:

> "Mark the plan as in_review and request approval from the tech lead."

The agent calls `submit_for_approval`. A row appears in **Plan → Approvals**, and the assigned reviewer gets a ping in the **bell icon** at the top of the screen (the unread count badges the bell).

### Step 4 — Approve the plan

The reviewer sees the request two ways: the **bell icon** (inbox-style feed of pings, opens `/notifications`) or **Approvals** (the work queue in the sidebar). Either path opens the plan. Click **Approve** (or **Deny** with a reason — both are recorded immutably). The plan status flips to `approved`, the agent sees it on the next `get_my_context`, and the approval event is appended to the **Audit log**.

### Step 5 — Code, PR, ship

Do the work in your editor. Two flavors of governed AI action are possible here:

- **Choreographed.** Ask the agent to *"run the test-author choreography on this diff."* It opens `.coznt/skills/test-author/SKILL.md` and calls `invoke_skill('test-author')`. The flow itself is visible on the skill detail page (**Skills** → click the skill → **Choreography · pushed to dev repos** card) — that's the SKILL.md `coznt sync` materialized into your repo. If the skill is at sufficient autonomy on this project, it runs unattended; otherwise it routes to **Approvals** and pings the reviewer at the bell.
- **Manual.** Write the code yourself, commit, push, open the PR via your normal git tooling.

Either way: **open the PR**. Coznt is now watching — through the GitHub binding in **Runtime → Adapters**.

### Step 6 — Watch the webhook → ledger trip

When you push and the PR opens, GitHub fires a webhook to coznt. The route resolves your repo to the project via the `adapter_bindings` row that **Adapters** created at project-setup time — if rows aren't landing in the ledger, that's the first place to check. The `process-webhook-event` task then drains the queue, the deterministic assessors in `src/domain/outcomes.ts` grade the event, and a `skill_outcomes` row lands.

Watch it happen:

```bash
coznt ledger --project payments-api --follow      # tails new outcome rows
```

Or in the UI, refresh the project's **Trust** tab. You should see a new row appear within seconds of the webhook firing. `verdict` will be `success` on a clean merge, `rolled_back` on revert, `incident` on a failed deploy. Each row links to its source-of-record PR or deploy — click through and the trail is end-to-end.

### Step 7 — Watch autonomy recompute

The ledger insert triggers `recomputeSkillAutonomyTask`. It walks the 30-day window for the affected `(skill, project)` pair and promotes / demotes. Open **Insight → Skills**, click the skill that just ran — its autonomy level for this project, the outcomes that earned it, the trailing-window math, and the choreography pushed to dev repos are all on one page.

A single success rarely promotes. Burst-merge a few clean PRs to feel a promotion; introduce a deliberate revert (push a bad commit, revert it within 7 days) to feel a demotion.

### Step 8 — Cut the release, advance the phase

Once the story's PRs are merged, ask the agent for release notes:

> "Generate a release plan for everything merged against this project since the last cut."

The agent invokes the `release-notes-generator` skill. The resulting `release_plan` lands in **Plan → Releases** — each row holds the release plan, the PRs included, the deploy outcome that closes it, and an approval slot for the release sign-off. Approve it the same way as Step 4.

When the gates on the current phase have passed (open the project cockpit's **Phases** tab to see them green), ask the agent:

> "Submit this project for advancement to the testing phase."

Agent calls `submit_phase_for_review`. Operator (or self, if you have the role) approves it in **Approvals**. Phase moves. Allowed verbs change on the next agent turn. Loop closes.

### Step 9 — Read the audit, watch the long arc

Everything you just did is in **Insight → Audit log** — an append-only feed with a row-hash chain. Filter by your user or by the project. Each row links back to the entity it mutated. This is the **Trust** pillar of coznt's operating model (Govern → Verify → Trust): the audit log is the substrate, "trust observable" is the UX thesis on top of it, and *verification debt* (Insight → Verification Debt) is the single derived score that summarizes how much unverified AI output has accumulated on each project. Drill from the score to the rows that contributed to it.

For the long arc, open **Insight → DORA**. After a few cycles, you should see lead time, deploy frequency, change-fail rate, and MTTR move. DORA is how you answer "is the loop actually making us faster, or just busier?" — and the ledger underneath is how you answer "why."

If any step above doesn't fire the way you expect, jump to **C2 Troubleshooting**.

---

# Part B — For operators

> You're standing coznt up for a team. This part takes you from a clean checkout to a project recording real PR / deploy signals against the skill ledger.

## B1. Prerequisites

- Node 20+ and `pnpm`
- Postgres 15+ with `pgmq` and `pg_cron` extensions available
- A GitHub personal access token with `repo` + `read:org` scopes ([create one](https://github.com/settings/tokens))

Copy `.env.example` to `.env` and fill at minimum:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` (any long random string)
- `NEXT_PUBLIC_APP_URL` (defaults to `http://localhost:3029`)

## B2. First-time install

```bash
pnpm install
pnpm db:setup --reset      # schema + pgmq queues + pg_cron jobs + seeds 12 platform skills into the `default` org + creates a platform admin
pnpm dev                   # Next.js dev server + background worker
```

`pnpm dev` runs the web app **and the worker** together. The worker drains pgmq, processes inbound webhooks, and recomputes skill autonomy as outcomes accumulate.

Then create your working organization (Better Auth is configured with `allowUserToCreateOrganization: false`, so sign-up alone won't create one):

```bash
pnpm db:onboard                            # interactive: prompts for org + owner
```

`db:onboard` goes through `scripts/lib/bootstrap-org.ts`, which seeds the 12 platform skills into the new org automatically — so `coznt sync` returns them immediately, no manual seeding needed.

If you have existing orgs predating that change (or any org that's missing platform skills), backfill with:

```bash
pnpm tsx scripts/backfill-platform-skills.ts
```

Sign in at <http://localhost:3029> with the credentials the bootstrap script printed.

### What `pnpm build` does (and why developers care)

`pnpm build` runs a **`prebuild` hook (`tsx scripts/mcp-pack.ts`)** before `next build`. The hook:

1. Compiles the MCP server (`tsc -p tsconfig.mcp.json`).
2. Stages a slim package (only `@modelcontextprotocol/sdk` + `zod` as runtime deps).
3. Runs `npm pack` to produce `coznt-mcp-<version>.tgz`.
4. Drops the tarball into `public/install/` so Next serves it as a static asset.
5. Updates `src/lib/mcp/version.ts` so the in-UI **Host Config** panel emits the matching versioned URL.

End result: every coznt deployment self-hosts its own MCP client tarball at:

- `<your-coznt-url>/install/coznt-mcp-<version>.tgz` — pinned, what the host-config panel recommends. Tarballs are **byte-deterministic**: same source tree → identical tarball bytes → identical sha512. That makes `pnpm i -g <url>` idempotent — rebuilds at the same version don't invalidate cached integrity hashes.
- `<your-coznt-url>/install/coznt-mcp/latest` — redirects to the deployment's current pinned version (handy for local dev, internal demos)

Developers paste `npx -y <coznt>/install/coznt-mcp-<version>.tgz` into their editor's MCP config — no public npm, no internal artifact registry, no separate install script to ship. The pack scripts (`scripts/cli-pack.ts`, `scripts/mcp-pack.ts`, `scripts/prompt-hook-pack.ts`) skip `npm pack` and use the `tar` npm package directly with `portable: true`, fixed mtime, sorted file list, and deterministic gzip — so two consecutive builds produce byte-identical tarballs.

Retired tarballs are append-only: never delete a published version from `public/install/`. pnpm's global manifest may hold pinned URLs from prior installs; if those URLs 404, `pnpm i -g <new-url>` fails while reconciling the dead entries. Letting old tarballs linger costs ~20–40 KB each and avoids the reconciliation pitfall entirely.

Re-running `pnpm build` after bumping the version repacks the tarball, updates `version.ts`, and the next `coznt connect` (or a refresh of `/api-keys`) hands developers the new pinned URL.

For local dev where you want to iterate on MCP server code with hot reload, skip the tarball and point your own editor at `pnpm mcp` (tsx, source-based). The tarball flow is for distributing to other developers, not for your own iteration loop.

## B3. Verify the install

After `pnpm db:setup --reset` and `pnpm db:onboard`, sign in at <http://localhost:3029>, create your first project (B6), and point a real repo at it. The audit-chain integrity smoke harness is the only standalone smoke script:

```bash
pnpm smoke:audit-chain     # verifies BEFORE INSERT trigger + verifyAuditChain walker
```

## B4. Wire up MCP locally (for your own dev iteration)

If you'll be iterating on coznt itself, run the MCP server out of the repo:

```bash
pnpm mcp:build           # compiles to dist/mcp/bin.js (entry: coznt-mcp)
```

Mint an API key at `/api-keys` and bind it to a test project. Then from inside the coznt repo:

```bash
pnpm cli connect         # writes editor MCP config, picks project, binds it
pnpm cli sync            # pulls choreographies into .coznt/skills/
```

For hot-iterating on server code, point your editor at `pnpm mcp` (tsx, hot on source changes) instead of the built binary.

The full developer-facing flow is in **Part A** above.

## B5. Connect GitHub (once per org)

Navigate to **Adapters** in the sidebar (`/integrations`) and click **Configure** on the GitHub card.

- **Personal access token** — paste your PAT. Stored encrypted in `integration_credentials`.
- Same flow works for GitHub Enterprise — issue the PAT from your GHE instance.

This is org-level; every project in the org reuses it.

### Jira, Azure DevOps, Confluence

All three are optional for the GitHub-only loop but unlock work-item sync, ADR publishing, and pipeline read-paths. Configure each from the same **Adapters** page (`/integrations`); credentials live in `integration_credentials` (encrypted) and resolve per provider.

| Provider | Required fields | Where to mint the token |
|---|---|---|
| **Jira** | API token + site URL (`https://acme.atlassian.net`) + account email | <https://id.atlassian.com/manage-profile/security/api-tokens> |
| **Azure DevOps** | PAT + Org URL (`https://dev.azure.com/acme`) | ADO → User settings → Personal access tokens. Scopes: `Build (read/execute)`, `Code (read)`, `Work items (read/write)` |
| **Confluence** | API token + site URL + account email | Same Atlassian token page as Jira (one token works for both) |

After saving credentials, bind each per-project from the project cockpit (`/projects/[id]`) → **Settings** tab. The form has three sections; the **Upstream bindings** section is what you want here:

- **Jira project key** — set the **Jira** key (short, uppercase: `PAY`, `TODO`, `ENG`). Note: this is the Jira project key, not the coznt slug. `get_assigned_work` returns real Jira issues once this is set.
- **Azure DevOps project ID** — `org/project-guid` form. `get_pipeline_status` and `generate_pipeline` route to ADO when this is set.
- **Confluence space key** — ADRs created via `log_decision` can optionally publish there (server-side, after approval — never from the agent directly).

The same Settings tab also exposes editable **Identity** (name, description) and **Risk zones** (`critical paths` and `production-critical paths` — path globs used by the change-risk classifier and the go-live gate). The slug is read-only.

> If you can't reach the Settings tab (older deployment): the same fields are writable via `PATCH /api/v1/projects/{id}` or by calling the `updateProject` server action.

For GHE on the GitHub side, the same PAT flow works — issue the token from your GHE instance and add it to the GitHub card on the same page.

## B6. Create your first real project

Go to `/projects/new`:

| Field | Example | Notes |
|---|---|---|
| Name | `Payments API` | Display name. |
| Slug | `payments-api` | URL-safe identifier, unique per org. |
| Description | _(optional)_ | Free-form. |
| Repo URL | `https://github.com/acme/payments-api` | Full URL, with or without `.git`. SSH form also works. |
| Jira project key | `PAY` _(optional)_ | If you also use Jira. |

Submit. Behind the scenes:

1. The project row is created (phase = `requirements`, status = `active`).
2. The repo URL is parsed to `github.com/owner/repo` and an `adapter_bindings` row is written — this is what lets webhook traffic resolve back to your project. Without it, GitHub events arrive but can't be routed.
3. All org-wide skills and rules (seeded by `pnpm db:setup`) become visible to the project automatically.

You land on the project cockpit at `/projects/[id]` with nine tabs:

- **Overview** — phase + recent activity
- **Phases** — gate status per SDLC phase
- **Plans** — epics, features, stories, ADRs, test plans, release plans
- **WorkItems** — synced from your tracker
- **Trust** — observable claims about this project
- **CICD** — pipeline runs and deploys
- **Documents** — Confluence / linked docs
- **RulesSkills** — policies + skills attached to this project
- **Learnings** — accumulated project knowledge

## B7. Point GitHub at the webhook

You have two options. **A GitHub App is not required** — a repo (or org) webhook is enough for the deterministic loop. Use the App only when you also want PR check-runs (red/green merge gate).

### Option 1 — Repo/org webhook (no App)

1. Generate a shared secret and put it in `.env`:

   ```bash
   COZNT_GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
   ```

2. In your GitHub repo: **Settings → Webhooks → Add webhook**
   - **Payload URL**: `https://<your-host>/api/v1/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: the value of `COZNT_GITHUB_WEBHOOK_SECRET`
   - **Events**: at minimum send **Pull requests** and **Deployment statuses**. Subscribe to everything for richer signal.

3. Make sure the `adapter_bindings` row exists for the repo (B6 writes it automatically when you create the project). The route resolves the org via `repository.full_name` → `adapter_bindings.external_key` (`<host>/<owner>/<repo>`).

For local dev, use `ngrok http 3029` (or similar) and the tunnel URL as the payload URL.

### Option 2 — GitHub App (adds PR check-runs)

See [`docs/operate/github-app.md`](operate/github-app.md) for the full registration walkthrough. In short: register an App, install it on the org/repo, set `COZNT_GITHUB_APP_ID` + `COZNT_GITHUB_APP_PRIVATE_KEY` + `COZNT_GITHUB_WEBHOOK_SECRET`, and store the install's `installationId` on the `adapter_bindings.config` row. The route resolves the org via `installation.id` and `postCheckRun` becomes active.

## B8. What happens when a PR ships

The deterministic outcome assessors in `src/domain/outcomes.ts` cover five cases:

| Event | Verdict |
|---|---|
| PR merged, no revert within 7 days, checks green | `success` |
| PR closed without merge after >24h open | `rolled_back` (low) |
| PR merged then reverted within 7 days | `rolled_back` (high) |
| Deploy succeeded, no incident within 24h | `success` |
| Deploy rolled back, or incident within 24h post-deploy | `incident` |

Each verdict appends a row to `skill_outcomes`. The worker re-runs autonomy math for the affected `(skill, project)` pair: 30-day trailing window, promote/demote across the four levels (`0 observe → 1 propose → 2 merge → 3 lead`).

Coznt also **posts a GitHub check-run** on the PR with the gate's verdict (autonomy × change risk × active rules × phase × human override). When autonomy demotes mid-stream, every open PR by that skill is re-evaluated and its check-run is flipped automatically — the merge UI is physically gated on earned trust, not advisory text.

You'll see this surface in the **Trust** tab on the project, and aggregated in `/skills/[id]`.

## B9. Day-two operations

**Schema changes.** Edit a file in `src/db/schema/`, then:

```bash
pnpm db:push           # fast iteration on a feature branch
pnpm db:generate       # versioned migration before merging
pnpm db:migrate        # apply committed migrations in prod
```

Commit the generated `drizzle/00XX_*.sql` and the updated `drizzle/meta/_journal.json` alongside the schema change.

**Periodic jobs** are registered in `scripts/db-setup.ts` under `setupCronJobs()` with a `coznt:` prefix. The SQL body enqueues to pgmq; the worker handles the rest.

**Skills and rules** scoped to a single project live with `projectId` set. Org-wide skills/rules have `projectId = NULL` and apply everywhere. The query pattern is `eq(projectId, X) OR isNull(projectId)`.

---

# Part C — Reference

## C1. Useful screens

The sidebar holds the screens you open multiple times a day — grouped by **Plan** (author work), **Insight** (observe what happened), **Runtime** (govern behavior). Meta-work (account, governance config, MCP keys) lives in the **avatar menu** at the top-right. Real-time pings live behind the **bell icon**.

### Sidebar

| Group | Sidebar | Route | Purpose |
|---|---|---|---|
| Plan | Projects | `/projects` | Portfolio — every project, phase, trust signal |
| Plan | Plans | `/plans` | All authored units (epic, feature, story, ADR, test plan). Filter by kind / status |
| Plan | Releases | `/releases` | Release plans joined with deploy history — the cut view |
| Plan | Approvals | `/approvals` | Pending sign-offs. Where autonomy denials land for human review |
| Insight | Skills | `/skills` | Per-project autonomy ledger; skill detail surfaces the choreography pushed to dev repos |
| Insight | DORA | `/metrics` | Lead time, deploy frequency, change-fail, MTTR + autonomy rollups |
| Insight | Audit log | `/audit` | Append-only log with row-hash chain — the source-of-record |
| Runtime | Adapters | `/integrations` | Provider credentials + bindings (GitHub, Jira, ADO, Confluence, deploy targets) |

### Header — top-right

| Surface | Route | Purpose |
|---|---|---|
| 🔔 Bell | `/notifications` | Per-user feed of approvals waiting, gate failures, autonomy promotions, incidents |
| Avatar → Settings | `/settings` | Org-wide preferences (members, defaults, theme) |
| Avatar → API keys | `/api-keys` | Mint MCP keys; in-UI host config panel |
| Avatar → Rules | `/rules` | Declarative policy validators (`keyword-presence`, `action-policy`) that gate plan writes and skill actions |
| Avatar → Sign out | — | End the session |

### Discoverable from inside other screens

| Sidebar entry → click-through | Route | Purpose |
|---|---|---|
| Skills → click a skill | `/skills/[id]` | Choreography (SKILL.md pushed to dev repos) shown on the detail page |
| Skills → "Custom choreographies" button | `/choreographies` | Operator-authored choreographies pushed to repos via `coznt sync` |
| Projects → click a project | `/projects/[id]` | Project cockpit — phase, gates, plans, outcomes |

### Other

| Route | Purpose |
|---|---|
| `/install/coznt-mcp/latest` | Self-hosted MCP tarball (redirects to current pinned version) |

## C1.5. Built-in skills

These ship with every coznt deployment as org-wide skills (`projectId = NULL`). They're available to every project at install, gated only by per-project autonomy. Each is invoked via `invoke_skill('<slug>')` and produces a plan of the listed kind — landing in the project's **Plans** tab at `draft` status for human review.

| Slug | Plan kind | What it produces |
|---|---|---|
| `requirements-document` | `story` | A comprehensive Requirements Specification Document for the project |
| `epic-decomposer` | `epic` | Breaks a high-level epic into structured features + stories with acceptance criteria |
| `feature-spec-generator` | `feature` | A complete feature specification from an approved epic or requirement |
| `storyboard-generator` | `storyboard` | UI storyboards / wireframe descriptions / user-flow diagrams (Mermaid) |
| `adr-extractor` | `adr` | An Architecture Decision Record from a design discussion, PR thread, or code change — Status / Context / Decision / Consequences |
| `test-plan-generator` | `test_plan` | A test plan + script outlines covering approved requirements |
| `test-execution-report-generator` | `test_execution_report` | A test-execution report from a test_plan + test_runs |
| `cicd-pipeline-authoring` | `cicd_pipeline` | A pipeline definition (GitHub Actions or ADO) wired to the project's tracker and deploy targets |
| `dev-summary-generator` | `dev_summary` | A development-phase summary from merged PRs + linked stories + ADRs |
| `release-notes-generator` | `release_plan` | Release notes from a window of merged PRs and closed stories |
| `go-live-report-generator` | `go_live_report` | A production-readiness report for a release_plan |
| `incident-postmortem` | `incident` | A blameless postmortem draft — timeline, root-cause hypothesis, action items |

The full prompt template for each lives server-side in `src/automations/agents/prompts/`; the choreography (when to call it, what to do with the result) lives in `src/automations/skills/<slug>/SKILL.md` and rides into the dev repo via `coznt sync`.

## C1.6. If you're coming from SDLC Platform

If you've used the SDLC Transformation Platform, most coznt verbs map 1:1. A few are reshaped — by design, not by accident:

| SDLC verb | Coznt equivalent | Why the reshape |
|---|---|---|
| `upload_document` | `upsert_plan` | Coznt absorbs the documents semantic into plans. Upserts by `(projectId, kind, slug)`; subsequent calls write `plan_revisions` rows. The Plans tab IS the documents view |
| `get_documents` | `get_plans` | Same lift — lists/fetches by kind/status, body includes revisions + approvals |
| `set_project` / `switch_project` | (n/a) | Coznt API keys are pinned to one project at mint time. Multi-project work = one key per project, one `coznt connect` per repo |
| `setup_workspace` | `coznt connect` (CLI) | Workspace bootstrap moved to the CLI; the MCP server never writes to your repo |
| `push_to_external` | (excluded) | Coznt grades, doesn't write upstream. Use your tracker's normal UI/API for upstream sync |
| `create_pr` | (excluded) | Same — agent opens PRs via your git tooling, coznt grades them via webhook |
| `pass_all_tests` | `update_test_result` | Folded into the single test-result writer |
| `request_approval` | `submit_for_approval` | One verb, polymorphic target (plan / phase_gate / release / work_item) |

What coznt adds that SDLC doesn't have today: the autonomy ledger (`get_outcomes` + `recomputeSkillAutonomyTask`), append-only hash-chained audit (`search_audit`), and the four typed search verbs (`search_plans` / `search_outcomes` / `search_audit` / `search_learnings`).

## C2. Troubleshooting

**Webhook fires but nothing shows up in the project.** The binding row probably wasn't created (older projects, or a non-GitHub URL). The route returns `200 {"status":"no-binding"}` in this case (silent drop — no 4xx in GitHub's delivery history). Check `adapter_bindings` for a row with `provider='github'` and `external_key='github.com/<owner>/<repo>'`. Insert manually if needed:

```sql
insert into coznt.adapter_bindings (id, organization_id, project_id, provider, external_key)
values (gen_random_uuid()::text, '<org>', '<project>', 'github', 'github.com/<owner>/<repo>');
```

**Webhook returns 401 `Invalid webhook signature`.** The secret in `COZNT_GITHUB_WEBHOOK_SECRET` doesn't match what you set in the GitHub UI. Regenerate, update both sides, and click **Redeliver** on a recent delivery to test.

**Webhook returns 200 `no-binding` but `adapter_bindings` looks right.** The host probably mismatches — for GHE the row needs `external_key='ghe.acme.com/<owner>/<repo>'`, not `github.com/...`. The route reads host from `repository.html_url`.

**Worker isn't draining the queue.** `pnpm dev` runs the worker inline. If you're running the Next server alone (`pnpm next dev`), start the worker too: `pnpm tsx scripts/worker.ts`.

**PAT scopes seem wrong.** Coznt needs `repo` (read commits, PRs, statuses) and `read:org` (resolve org-owned repos). For private repos in a GitHub org, also enable SAML SSO on the PAT.

**Autonomy isn't moving.** Verdicts are computed against a 30-day trailing window. A single success doesn't promote — sustained signal does. Check the `skill_outcomes` table to confirm rows are landing.

**Agent can't see the MCP server.** Restart your editor after `coznt connect`. Verify the config landed at the expected path (`.claude/mcp.json`, `.cursor/mcp.json`, `.codex/mcp.json`, `.continue/`). Re-run with `--editor=<host>` to override detection. The in-UI host config panel at `/api-keys` is a useful fallback.

**Phase 403 confuses the agent.** The 403 body includes `phaseGuidance` text — confirm your agent surfaces structured error fields. Some hosts truncate non-`error` keys; if so, point the agent at `submit_phase_for_review` to request advancement explicitly.

**Choreographies in `.coznt/skills/` are out of date.** Re-run `coznt sync`. The `.lock` files surface content drift in `git diff`; if a lock changed but the SKILL.md didn't, someone edited the server-side choreography.

## C3. Where to next

- [`docs/tutorial/first-project.md`](tutorial/first-project.md) — **start here if you've never used coznt.** A 90-minute hand-held walkthrough of building a TaskList app from zero through all six SDLC phases. Concrete prompts, expected outputs, every node of the loop touched at least once
- `docs/positioning.md` — what coznt is, who it's for, the loop it tightens. The "daemon + choreography" section explains why governed-skill calls run server-side
- `docs/product/architecture.md` — milestones A–E, plan-driven SDLC model
- `docs/ux/build-plan.md` — UI execution plan, mapped to milestones
- `docs/spec/mcp-verbs.md` — **full MCP verb reference** (4 tiers, 31 verbs, exclusions). A4.5 above is the developer-friendly subset; this is the engineering source-of-truth
- `docs/spec/skill-choreography.md` — how SKILL.md files are versioned, hash-locked, and served by `sync_choreographies`
- `CLAUDE.md` — engineering conventions (Drizzle/Zod two-source rule, page-data pattern, CRUD factory)
