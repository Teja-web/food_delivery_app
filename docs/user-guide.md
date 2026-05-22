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
  │  0 intern · 1 junior · 2 senior · 3 princ. │
  └──────┬─────────────────────────────────────┘
         │
         ▼
  ┌────────────────────────────────────────────┐    visible to dev
  │  PORTFOLIO / AUDIT / METRICS               │◀────────────────── back to IDE
  │  "trust observable" — every claim links    │      autonomy upgrades unlock
  │  to a source-of-record                     │      more skill autonomy in IDE
  └────────────────────────────────────────────┘
```

Steps A1 → A4 cover the IDE side (top half of the diagram). **A7 — Walking the full loop** drives the bottom half: plan, approval, code, webhook, ledger, autonomy, phase advance.

---

# Part A — For developers

> You're joining a project where coznt is already running. Your platform team gave you a coznt URL and (or pointed you at) the internal `coznt` CLI distribution. This part takes you from a fresh clone to your first governed AI turn.

## A1. What you need

- An AI editor or CLI agent — one of:
  - **Claude Code** (also covers the `claude -p` CLI)
  - **Cursor** (also covers `cursor-agent`)
  - **Codex** (also covers `codex exec`)
  - **Continue**
- An **API key** from the coznt UI: visit `<your-coznt-url>/api-keys`, click **Create key**, and bind it to the project you'll work on. The plaintext is shown once — copy it.
- The **coznt MCP server**, served as a tarball by your coznt deployment itself at `<your-coznt-url>/install/coznt-mcp/latest` (always redirects to the deployment's current pinned version). Your editor pulls it via `npx -y <that-url>` on first use — no separate install step, no public npm. If your platform team has also distributed an internal **`coznt` CLI** (the `connect` / `sync` / `status` helper), grab that too — it's optional but smoother for first-time setup.

## A2. Connect your editor or CLI

Three paths — pick whichever fits your workflow. All three end with the same MCP entry in your editor's config, pointing at `npx -y <your-coznt-url>/install/coznt-mcp/latest`.

**Path 1 — In-UI host config panel (zero install).** Visit `<your-coznt-url>/api-keys`, mint a key, and open the **Host Config** panel. Pick your host (Claude Code / Cursor / Codex / Continue). The panel renders a JSON snippet pre-filled with your coznt URL, the install endpoint (`npx -y <coznt>/install/coznt-mcp-<version>.tgz`), and the API key. Copy → paste into the editor's MCP config (or click **Download** for the file). First time you start the editor, `npx` fetches the tarball, caches it, and runs it. No CLI required.

**Path 2 — `coznt connect` CLI.** If your platform team has handed you the internal `coznt` CLI, from inside your project repo:

```bash
coznt connect
```

The command:
1. Auto-detects your editor by scanning for `.claude/`, `.cursor/`, `.codex/`, or `.continue/` markers (prompts if multiple, asks if none).
2. Asks for the coznt server URL and your API key.
3. Picks the project to bind (fuzzy-matches by slug, name, or id).
4. Writes two files:
   - The editor's MCP config (e.g. `.cursor/mcp.json`, `.claude/mcp.json`, `.codex/mcp.json`) pointing at the same install URL.
   - `.coznt/config.json` recording the project binding and server URL.

Override detection with `--editor=<host>` if needed.

**Path 3 — Raw `npx`.** If you just want to verify the install endpoint works before wiring up the editor:

```bash
npx -y <your-coznt-url>/install/coznt-mcp/latest --version
```

This prints the MCP version and exits — confirms your coznt deployment is serving the tarball and `npx` can fetch it. If this fails, the host-config panel will fail too.

Restart your editor. The `coznt-mcp` server should appear in its MCP tool list. Sanity-check by asking the agent to call `get_my_context` — it should return your project, current phase, allowed tools, active rules, and your skills' autonomy levels.

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

Every agent turn starts with `get_my_context`. A typical response (shape is illustrative):

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
    { "slug": "test-author", "level": "SENIOR", "autonomyDescription": "auto-runs <50 LOC + 80% coverage" }
  ]
}
```

The agent grounds every action in this payload. A simple turn:

1. You ask the agent: *"Run the test-author choreography on the diff."*
2. The agent opens `.coznt/skills/test-author/SKILL.md` and follows it.
3. The choreography says *"call `invoke_skill('test-author')`."* The agent calls it.
4. Coznt's autonomy gate fires **before dispatch**. `test-author` is `SENIOR` on this project → runs unattended.
5. The governed LLM call runs server-side. The output (generated test file) returns to the agent.
6. A row lands in `skill_outcomes` with `verdict='success'` and `sourceKind='invocation'`.
7. Worker recomputes autonomy for `(test-author, payments-api)`.

You — the developer — review the generated tests, commit, push, open the PR using your normal tooling. Coznt watches that PR via webhook and grades it at merge time.

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

Each skill's level — **Intern (0) → Junior (1) → Senior (2) → Principal (3)** — is **per project**. See it at `<your-coznt-url>/skills/<slug>`. The project cockpit's **Trust** tab shows skill outcomes scoped to that project.

The math: a **30-day trailing window** of `skill_outcomes` rows (`verdict ∈ {success, rolled_back, incident}`) feeds the recompute. Promotion takes sustained signal; demotion can happen on a single critical incident. When a skill demotes:

- Every open PR by that skill is re-evaluated against the new level.
- The gate flips its **GitHub check-run** on each PR's merge UI automatically.
- The agent's next `get_my_context` reflects the lower level.

If coznt is running locally and you want to watch the whole loop:

```bash
pnpm tsx scripts/demo-execution-gate.ts
```

This prints a 7-step trace: snapshot starting state → open synthetic PR → gate evaluates → record incident → recompute autonomy → demote → confirm PRs flipped to blocked. It's the single best way to see the autonomy ledger become physical.

## A7. Walking the full loop

This section maps each node of the diagram above to a concrete action so you can drive the full loop yourself. Allow ~30 minutes start to finish. Pre-reqs: A1–A3 done (editor connected, choreographies synced), the project's repo has webhooks landing on coznt (see operator section B7 if not).

### Step 1 — Confirm your starting state

```bash
# If you have the coznt CLI:
coznt status               # prints project, phase, your skill autonomy levels

# Otherwise, hit the install endpoint directly to verify the MCP can be fetched:
npx -y <your-coznt-url>/install/coznt-mcp/latest --version
```

Open `<your-coznt-url>/projects/<id>` in a browser and keep it open in a second tab — you'll watch rows land here as you work.

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

The agent calls `upsert_plan` (it's in the allowed list during `development`). The plan lands at `<coznt>/projects/<id>` → **Plans** tab in `draft` status. Open it; you should see the title, body, and metadata the agent wrote.

Move it to review:

> "Mark the plan as in_review and request approval from the tech lead."

The agent calls `request_approval`. A row appears at `<coznt>/approvals`.

### Step 4 — Approve the plan

Open `<coznt>/approvals`, find the request, click **Approve** (or **Deny** with a reason — both are recorded immutably). The plan status flips to `approved` and the agent sees it on the next `get_my_context`.

### Step 5 — Code, PR, ship

Do the work in your editor. Two flavors of governed AI action are possible here:

- **Choreographed.** Ask the agent to *"run the test-author choreography on this diff."* It opens `.coznt/skills/test-author/SKILL.md` and calls `invoke_skill('test-author')`. If the skill is at sufficient autonomy on this project, it runs unattended; otherwise it routes to `/approvals`.
- **Manual.** Write the code yourself, commit, push, open the PR via your normal git tooling.

Either way: **open the PR**. Coznt is now watching.

### Step 6 — Watch the webhook → ledger trip

When you push and the PR opens, GitHub fires a webhook to coznt. The `process-webhook-event` task drains the queue, the deterministic assessors in `src/domain/outcomes.ts` grade the event, and a `skill_outcomes` row lands.

Watch it happen:

```bash
coznt ledger --project payments-api --follow      # tails new outcome rows
```

Or in the UI, refresh the project's **Trust** tab. You should see a new row appear within seconds of the webhook firing. `verdict` will be `success` on a clean merge, `rolled_back` on revert, `incident` on a failed deploy. Each row links to its source-of-record PR or deploy — click through and the trail is end-to-end.

### Step 7 — Watch autonomy recompute

The ledger insert triggers `recomputeSkillAutonomyTask`. It walks the 30-day window for the affected `(skill, project)` pair and promotes / demotes. Refresh `<coznt>/skills/<slug>` or the project's **Trust** tab — the level may or may not move depending on the sample size, but the row should be there.

A single success rarely promotes. Burst-merge a few clean PRs to feel a promotion; introduce a deliberate revert (push a bad commit, revert it within 7 days) to feel a demotion. The `demo-execution-gate.ts` script in A6 is the fastest way to see this without touching a real repo.

### Step 8 — Advance the phase

When the gates on the current phase have passed (open the project's **Phases** tab to see them green), ask the agent:

> "Submit this project for advancement to the testing phase."

Agent calls `submit_phase_for_review`. Operator (or self, if you have the role) approves at `/approvals`. Phase moves. Allowed verbs change on the next agent turn. Loop closes.

### Step 9 — Read the audit

Everything you just did is in `/audit` — an append-only log with a row-hash chain. Filter by your user or by the project. Each row links back to the entity it mutated. This is the "trust observable" claim: nothing on screen is unbacked.

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
pnpm db:setup --reset      # schema + pgmq queues + pg_cron jobs
pnpm db:seed --reset       # platform skills + rules (org-wide, available to every project)
pnpm dev                   # Next.js dev server + background worker
```

`pnpm dev` runs the web app **and the worker** together. The worker drains pgmq, processes inbound webhooks, and recomputes skill autonomy as outcomes accumulate.

Open <http://localhost:3029> and sign up. Your account is the owner of a new organization.

### What `pnpm build` does (and why developers care)

`pnpm build` runs a **`prebuild` hook (`tsx scripts/mcp-pack.ts`)** before `next build`. The hook:

1. Compiles the MCP server (`tsc -p tsconfig.mcp.json`).
2. Stages a slim package (only `@modelcontextprotocol/sdk` + `zod` as runtime deps).
3. Runs `npm pack` to produce `coznt-mcp-<version>.tgz`.
4. Drops the tarball into `public/install/` so Next serves it as a static asset.
5. Updates `src/lib/mcp/version.ts` so the in-UI **Host Config** panel emits the matching versioned URL.

End result: every coznt deployment self-hosts its own MCP client tarball at:

- `<your-coznt-url>/install/coznt-mcp-<version>.tgz` — pinned, what the host-config panel recommends (npm caches by URL, so pinning keeps the cache hot)
- `<your-coznt-url>/install/coznt-mcp/latest` — redirects to the deployment's current pinned version (handy for local dev, internal demos)

Developers paste `npx -y <coznt>/install/coznt-mcp-<version>.tgz` into their editor's MCP config — no public npm, no internal artifact registry, no separate install script to ship. Re-running `pnpm build` after bumping the version in `package.json` re-packs the tarball and updates `version.ts` in one step; the next `coznt connect` (or a refresh of `/api-keys`) hands developers the new pinned URL.

For local dev where you want to iterate on MCP server code with hot reload, skip the tarball and point your own editor at `pnpm mcp` (tsx, source-based). The tarball flow is for distributing to other developers, not for your own iteration loop.

## B3. Bootstrap a demo and verify the loop

Fastest sanity check — seed a full demo workspace and walk the gate loop end-to-end:

```bash
pnpm tsx scripts/walkthrough-seed.ts        # bootstraps "Acme Corporation" with a sample workspace
pnpm tsx scripts/demo-execution-gate.ts     # walks PR → gate → incident → demote → blocked PR
```

`walkthrough-seed.ts` creates an `Acme Corporation` org with `demo@coznt.local` / `demo123!` you can sign in as. `demo-execution-gate.ts` prints what's happening at each step — read its output before you point coznt at a real repo.

Other smoke scripts you can run:

| Script | Verifies |
|---|---|
| `smoke-milestone-a.ts` | Deterministic outcome ledger (PR/deploy assessors) |
| `smoke-milestone-c.ts` | First AI-skill invocation path |
| `smoke-milestone-d.ts` | Execution gate dispatch on PR webhooks |
| `smoke-milestone-e.ts` | IDE input via MCP (verbs, phase enforcement) |

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

Navigate to `/integrations` and click **Configure** on the GitHub card.

- **Personal access token** — paste your PAT. Stored encrypted in `integration_credentials`.
- Same flow works for GitHub Enterprise — issue the PAT from your GHE instance.

This is org-level; every project in the org reuses it.

You can do the same later for **Jira**, **Azure DevOps**, and **Confluence**. They're optional for the GitHub-only loop.

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
3. All org-wide skills and rules (seeded by `pnpm db:seed`) become visible to the project automatically.

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

Each verdict appends a row to `skill_outcomes`. The worker re-runs autonomy math for the affected `(skill, project)` pair: 30-day trailing window, promote/demote across the four levels (`0 intern → 1 junior → 2 senior → 3 principal`).

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

| Route | Purpose |
|---|---|
| `/projects` | Portfolio view — every project, phase, and trust signal at a glance |
| `/projects/[id]` | Cockpit for a single project |
| `/skills` | Org-wide and project-scoped skills, autonomy levels |
| `/choreographies` | Authored choreographies + manifest served to `coznt sync` |
| `/approvals` | Pending sign-offs (where autonomy denials land) |
| `/audit` | Append-only audit log with row-hash chain |
| `/metrics` | Cross-project DORA and ledger rollups |
| `/rules` | Declarative policy validators (keyword-presence, action-policy) |
| `/integrations` | Provider credentials + binding overview |
| `/api-keys` | Mint MCP keys; in-UI host config panel |
| `/install/coznt-mcp/latest` | Self-hosted MCP tarball (redirects to current pinned version) |
| `/settings` | Org-wide preferences |

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

- `docs/positioning.md` — what coznt is, who it's for, the loop it tightens
- `docs/product/architecture.md` — milestones A–E, plan-driven SDLC model
- `docs/ux/build-plan.md` — UI execution plan, mapped to milestones
- `docs/spec/mcp-verbs.md` — full MCP verb reference (4 tiers, 31 verbs, exclusions)
- `CLAUDE.md` — engineering conventions (Drizzle/Zod two-source rule, page-data pattern, CRUD factory)
