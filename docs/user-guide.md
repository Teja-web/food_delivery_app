# Coznt — User Guide

Coznt is the AI-assisted SDLC governance daemon. Your AI editor or CLI agent talks to it on every turn so the agent knows the project's phase, what's allowed, which choreography to run, and what autonomy your skills have earned. The audit ledger, approval inbox, and GitHub check-runs exist because of what happens in that loop — not the other way around.

This guide has three parts:

- **Part A — For developers.** You've landed on a project where coznt is already running. Wire up your editor or CLI, sync the project's choreographies, run your first governed AI turn.
- **Part B — For operators.** You're standing coznt up for a team. Install the daemon, bind GitHub, create projects, verify the loop end-to-end.
- **Part C — Reference.** Screens, troubleshooting, where to go next.

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
- The **`coznt` CLI**, distributed internally by your platform team (private artifact registry, vendored install, or bundled binary). It is **not** on public npm.

## A2. Connect your editor or CLI

Two paths — pick whichever fits your workflow:

**Path 1 — `coznt connect` CLI (recommended).** From inside your project repo:

```bash
coznt connect
```

The command:
1. Auto-detects your editor by scanning for `.claude/`, `.cursor/`, `.codex/`, or `.continue/` markers (prompts if multiple, asks if none).
2. Asks for the coznt server URL and your API key.
3. Picks the project to bind (fuzzy-matches by slug, name, or id).
4. Writes two files:
   - The editor's MCP config (e.g. `.cursor/mcp.json`, `.claude/mcp.json`, `.codex/mcp.json`) pointing at your coznt MCP server.
   - `.coznt/config.json` recording the project binding and server URL.

Override detection with `--editor=<host>` if needed.

**Path 2 — In-UI host config panel.** Visit `<your-coznt-url>/api-keys`, mint a key, and open the **Host Config** panel. Pick your host, copy or download the rendered JSON, paste into your editor's MCP config file. Same result; useful when the CLI isn't installed yet.

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

In your GitHub repo: **Settings → Webhooks → Add webhook**

- **Payload URL**: `https://<your-host>/api/v1/webhooks/github`
- **Content type**: `application/json`
- **Events**: at minimum send **Pull requests** and **Deployment statuses**. Subscribe to everything if you want richer signal.

For local dev, use `ngrok http 3029` (or similar) and the tunnel URL as the payload URL.

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
| `/settings` | Org-wide preferences |

## C2. Troubleshooting

**Webhook fires but nothing shows up in the project.** The binding row probably wasn't created (older projects, or a non-GitHub URL). Check `adapter_bindings` for a row with `provider='github'` and `external_key='github.com/<owner>/<repo>'`. Insert manually if needed:

```sql
insert into coznt.adapter_bindings (id, organization_id, project_id, provider, external_key)
values (gen_random_uuid()::text, '<org>', '<project>', 'github', 'github.com/<owner>/<repo>');
```

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
