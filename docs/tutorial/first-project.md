# Tutorial — Ship TaskList, then live with it

This is coznt's flagship walkthrough. By the end, you will have:

1. **Shipped TaskList v1** end to end by talking to your editor in plain English — climbing the plan-artifact ladder (epic → feature → story → spec/ADR → test_plan → release_plan), with GitHub holding your code and Jira holding your sprint board, and coznt acting as the governance layer over both.
2. **Watched an AI skill earn promotion** from `observe` to `propose` because real deterministic outcomes accumulated in its favor.
3. **Survived a production incident** that demoted a skill, opened an `incident` plan, and triggered a `risk_register` postmortem — and watched coznt re-establish trust the same way it earned it the first time.
4. **Read the portfolio view** that surfaces verification debt across projects, and used the `/me` ledger to see your personal slice of the same audit substrate.

Coznt's tagline is **AI-DLC Governed**, and the operating spine is **Govern → Verify → Trust**: *govern* what AI can do (governance records, rules, autonomy thresholds), *verify* what it produces (a deterministic outcome ledger that grades every action), *trust* what can be proven (a hash-chained audit log where every claim on screen links to a source-of-record row). "Trust observable" is the UX thesis under the Trust pillar.

The why-now: generating plausible code is cheap; **establishing trust in it is the scarce resource.** Organizations that don't operationalize Govern–Verify–Trust accumulate *verification debt* — unverified AI output that compounds risk until something fails in production. Coznt's job is to keep that debt addressable. The four acts walk you through what that looks like.

> **A note on phases.** Earlier drafts of this tutorial described a six-phase SDLC progression (requirements → design → development → testing → CI/CD → monitoring). That model is gone. Coznt now expresses SDLC progression through **plan-artifact status** — every artifact moves through `draft → in_review → approved → in_progress → completed`, and governance attaches to those transitions, not to a project-level phase column. The lifecycle coach still drives you up the same hill; it just uses the artifact ladder as its handhold.

**Time:** ~90 min for Act 1 (active work). Acts 2–4 are presented as "two weeks later", "week four", and "steady state" — together they're another ~45 min of reading and clicking through.

**Reading guide:**

| Act | What it shows | You can stop after this and still be done… |
|---|---|---|
| Act 1 | Ship v1 by climbing the plan-artifact ladder with Jira and GitHub both bound | …if you only need to know "can coznt govern a real SDLC loop without imposing vocabulary on the human." |
| Act 2 | A skill earns its first promotion. A second human joins. Rule engine fires as a gate record. | …if you only need to see autonomy compound from evidence. |
| Act 3 | Production incident → demotion → `risk_register` postmortem → recovery. | …if you need to see what happens when trust breaks. |
| Act 4 | `/me`, portfolio, verification debt, audit log as unified ledger. | …if you want the "view from above" — the platform's analytical surface. |

**Prerequisites:**
- Coznt running locally per [`operate/install.md`](../operate/install.md).
- An empty GitHub repo (`gh repo create acme/tasklist --public --clone`).
- A fresh Jira project — create it in Jira UI (**Project → Create → Scrum**, key `TASK`). Coznt binds to existing Jira projects; it doesn't provision them.
- GitHub and Jira tokens connected to coznt per [`operate/github-app.md`](../operate/github-app.md) (one-time per org).
- Your editor connected to coznt per [`operate/cli.md`](../operate/cli.md).

**What you won't do:** type a coznt verb name. Coznt ships a master choreography — **Project Lifecycle Coach** — that wraps every governed action behind plain conversation. The **Under the hood** callouts show what got called, for the curious. They are not what an end user reads.

---

# Act 1 — Foundation: Ship TaskList v1 (~60 min)

You're going to build TaskList, a single-user TODO app: title, status (`todo` / `in_progress` / `done`), due date. REST API + Next.js UI + CI + a v1 release deployed to Vercel.

You'll bind both a fresh GitHub repo (for code) and a fresh Jira project (for sprint tracking) from day one — coznt becomes the governance and audit layer over both.

---

## Step 1 — Create the project in coznt (4 min)

This is the **only** non-chat step in Act 1. The agent can't create projects for you — that's an operator action.

Open `<your-coznt-url>/projects/new`. The wizard has three steps:

**Step 1 of 3 — Basics.**

| Field | Value |
|---|---|
| Name | `TaskList` |
| Slug | `tasklist` (auto-derived from name) |
| Description | `Personal TODO manager — single-user v1` |

**Step 2 of 3 — Governance.** Pick a policy template:

- **Lightweight** — author self-approves; full audit trail still captured.
- **Standard** *(recommended)* — every plan needs 1 approver from your designated approvers.
- **Strict** — every plan needs 2 approvers.
- **Risk-scoped** — only ADRs, release plans, and risk registers gate on approval; features/stories flow free.
- **Custom** — no defaults; you wire policies up later in **Settings → Governance policies**.

Pick **Standard** and tick yourself as the default approver. (Act 2 will add Alice; for now you're soloing.) Templates simply seed rows into `governance_policies` — kind=`approval`, scope=`project`, watching the `draft → in_review` transition. Admins can edit/delete/extend them later; templates are opinionated starting points, not locked-in policy.

**Step 3 of 3 — Sources & environments.** Bind one repository and pick environments:

| Field | Value |
|---|---|
| Source | `github` |
| Identifier | `acme/tasklist` |
| URL | `https://github.com/acme/tasklist` (auto-filled) |
| Environments | `production` (enabled), `development` (enabled), `preproduction` (skip for now) |

A project can have **multiple repositories** of mixed sources — coznt today supports `github`, `jira`, `ado`, and `confluence`. You're starting with the GitHub repo; you'll add the Jira binding from the project's **Settings → Repositories** tab in a minute.

Submit. You land at the cockpit's **Overview** tab. The tab strip shows five tabs: **Overview · Plans · Work items · Governance · Settings**. There is no phase strip and no phase badge — the project header just shows status `active` and the slug.

Now hop to **Settings → Repositories** and add the Jira binding (`source: jira`, `identifier: TASK`). Any issue you create in the `TASK` Jira project will mirror into coznt's `work_items` table within a second; any PR you open against `acme/tasklist` will fire the `pr_merge` / `pr_revert` assessors.

---

## Step 2 — Wire up your repo (2 min)

From inside your `tasklist` repo:

```bash
coznt connect       # pick "tasklist" when prompted
```

That's the only setup command. `coznt connect` does four things in one pass:

1. Writes your editor's MCP config (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, `.zed/settings.json` for Zed, etc.) so the editor can talk to coznt's verb surface.
2. **Installs the prompt-quality hook** (default-on for Claude Code, opt-in elsewhere). Every prompt you submit will be scored locally against the 6-dimension rubric — *clarity, scope, acceptance, prior context, constraints, verifiability* — and prompts below `COZNT_PROMPT_MIN_SCORE` are gated *before* they reach the model. See `docs/operate/prompt-hook.md` for the rubric and threshold knobs.
3. **Initializes the coznt-claimed section in your `CLAUDE.md`** (or `AGENTS.md`) — a marker-wrapped block carrying the kind→skill map, the autonomy reframe, and the routing rules your editor's agent reads at session start. The block auto-refreshes via content-hash detection (`rulesVersion`) on every MCP response — you never run a sync command.
4. Adds editor cache paths and `.mcp.json` to your `.gitignore`.

**There is no "lifecycle coach" file.** Your editor's agent IS the coach; coznt configures it through three runtime surfaces: the CLAUDE.md/AGENTS.md claim (always loaded), MCP tool descriptions (read when the agent considers each verb), and `get_my_context` responses (loaded on demand for current-state routing). Nothing is pushed to your repo by coznt — the merge webhook reads `.agents/`, it doesn't write.

What your team authors *back* lives in `.agents/skills/`, `.agents/rules/`, and `.agents/plans/<kind>/` — markdown files imported into coznt's DB on every PR merge to the default branch, with full audit trail. Full contract in [`docs/spec/dev-authoring-surface.md`](../spec/dev-authoring-surface.md). You'll see this in Step 5.

Restart your editor.

> **What the hook feels like in practice.** When you type a prompt like *"do the thing"* the hook scores it (low clarity, missing acceptance criteria, no constraints) and refuses with a one-line summary of which dimensions failed. You rewrite as *"add a `priority` enum (low/medium/high, default medium) to the tasks table; backfill existing rows; show as a chip on the list view; the existing auth-scope test must still pass"* — clarity high, scope explicit, acceptance verifiable, constraint cited — and the hook lets it through. The hook doesn't block you from working; it blocks the model from receiving prompts that won't produce verifiable output. Score history is captured in `prompt_logs` so the Verify pillar can later correlate prompt quality with outcome quality.

---

## Step 3 — Tell your editor what you're building (10 min)

Open your editor. Type:

> **You:** I want to build a small TODO app called TaskList. Single user, v1 should support a task with a title, status (todo / in-progress / done), and a due date. REST API, simple Next.js UI.

> **Coznt:** Got it. Quick lay-of-the-land — your Jira project `TASK` is empty (no assigned issues yet), and your repo is fresh. So I'll keep the early plans as coznt-native artifacts for now; once we get to stories, I'll prompt you to create matching Jira issues so your sprint board reflects the build.
>
> Your project's empty — the lifecycle coach is routing me to draft the first **epic** so subsequent features have something to hang off. One check before I draft this: should v1 support task priorities, or hold that for v2?

> **You:** v2.

> **Coznt:** Drafting now…
>
> **Drafted: TaskList v1 — single-user TODO**  *(plan kind: `epic`)*
> • Single-user TODO app with title, status (todo / in_progress / done), due date.
> • REST API + Next.js UI.
> • Out of scope for v1: priorities, multi-user, auth.
> • Acceptance signal: production deploy clean, two work items closed (`TASK-1`, `TASK-2`).
>
> I'll send it for review — the Standard policy you picked requires 1 approver, and you're the only approver right now, so it'll route to you. You should see it in the bell.

> **You:** sounds right.

> **Coznt:** Sent. Status is now `in_review`. Open your bell and decide.

<details>
<summary><strong>Under the hood</strong> — what just got called</summary>

The coach choreography ran this sequence without naming any of it to you:

1. `get_my_context` → returned `recommendedKickoff: epic-decomposer` because the project is in the `empty` state (zero plans).
2. `get_assigned_work` → returned empty (no Jira issues assigned, no in-progress plans). The coach used this to phrase its opening line correctly.
3. `session_start` with intent `"coaching tasklist epic"`.
4. `invoke_skill('epic-decomposer')` → server-side LLM call, Zod-validated output.
5. `upsert_plan` with `kind: 'epic'`, `slug: 'tasklist-v1'`, `status: 'draft'`.
6. `submit_plan_for_review` — this transitions the plan `draft → in_review` and materializes any policies that watch that transition. The Standard template's approval policy fires, so a `governance_records` row is created (`kind: 'approval'`, `details: { requiredCount: 1, approverIds: [you] }`).
7. `session_end` with a one-line summary.

You would have had to know seven verb names and one skill slug. You typed two sentences instead.

The epic plan is **coznt-native** — it lives in `plan_artifacts` with `kind='epic'`, not in Jira. Stories (Step 6) are where Jira earns its keep, because stories are what your sprint board actually tracks.
</details>

---

## Step 4 — Decide the approval (3 min)

Open your coznt tab. The cockpit's **Overview** tab shows "Governance pending: 1" in red. Hop to **Governance → Inbox** — you see the pending `approval` record with a "for you" badge. Decide.

The `InboxDecideButton` opens a small dialog: pick `passed` (approve) or `failed` (reject), add an optional note. Pick `passed`. The record flips to `passed`, the plan transitions `in_review → approved`, and a row lands in the audit log.

Back in your editor:

> **You:** what's next?

> **Coznt:** Epic is approved. The lifecycle coach is now routing me to `feature-spec-generator` — we've got an epic with no features, which is the `has_epic_no_feature` state. What feature do you want to decompose first?

<details>
<summary><strong>Under the hood</strong></summary>

`decide_governance_record` with `decision: 'passed'`. The evaluator dispatcher sees the approval passed, aggregates over the policy's `requiredCount`, marks all required approvals satisfied, and transitions the plan to `approved`. Your next agent turn sees `recommendedKickoff: feature-spec-generator` from `get_my_context` because the state changed from `empty` to `has_epic_no_feature`.
</details>

---

## Step 5 — Features, ADRs, and a spec (15 min)

The coach now pulls the design decisions out of you, but it organizes them as plan artifacts of distinct kinds — not as a "design phase". Each kind has its own role:

- **`feature`** — a coherent slice of the epic that ships as one user-visible capability.
- **`spec`** — a structured contract (API surface, UI surface, data shape) that a feature derives from.
- **`adr`** — an architecture decision record (Postgres+Drizzle, error format, etc.) that one or more features depend on.

> **Coznt:** First feature — what's the storage shape? I'll draft it as a `feature` with an `adr` underneath if a decision needs locking down.

> **You:** Postgres + Drizzle. Single `tasks` table, indexed on status and due_date.

> **Coznt:** That's a decision — I'll file it as `adr` so it's discoverable later.
>
> **Drafted: ADR-001 — Postgres + Drizzle for TaskList**  *(plan kind: `adr`)*
> • Postgres + Drizzle, single `tasks` table, composite index on `(status, due_date)`.
> • Alternatives considered: SQLite (no concurrency), MongoDB (overkill for v1).
> • Implication: schema changes go through `pnpm db:generate`.
>
> Sent for review (your bell).

> **You:** ok next, the UI.

> **Coznt:** Drafting the UI as a `feature` with a `spec` derived from it.
>
> **Drafted: List-view UI**  *(plan kind: `feature`, parent_of `tasklist-v1`)*
> • One screen: filterable list, inline status toggle, "new task" button → modal.
> • Empty state: "No tasks yet. Add your first." with a single CTA.
>
> **Drafted: API + UI contract**  *(plan kind: `spec`, derived_from `List-view UI`)*
> • REST endpoints: POST/GET/PATCH/DELETE on `/tasks`.
> • Error format: RFC 7807 problem+json on every error path.
> • PATCH semantics: RFC 7396 merge-patch, idempotent.
> • Pagination: list capped at 100 items per page.
>
> Both sent for review.

Approve all three in **Governance → Inbox**. The plan-artifact graph now looks like:

```
TaskList v1 (epic, approved)
├── parent_of → List-view UI (feature, approved)
│   └── derived_from ← API + UI contract (spec, approved)
└── relates_to → ADR-001 (adr, approved)
```

Every "approve" you just clicked produced a `governance_records` row with `status='passed'` and a state transition on the plan. No plan moved without a record; no record moved without a decision in the audit log.

> **You:** anything else for the design layer?

> **Coznt:** One more — any non-functional constraints worth recording as ADRs? Rate limits, auth posture, etc.?

> **You:** No rate limits in v1. Single-user, no auth. PATCH is merge-patch as already noted.

> **Coznt:** Nothing new to file then. Ready to author stories under the feature?

> **You:** yes.

> **The file path, too.** If you'd rather author the ADR, feature, and spec as markdown files in your repo, drop them at `.agents/plans/adrs/postgres-drizzle.md`, `.agents/plans/specs/api-ui-contract.md`, etc. The merge webhook imports them on PR merge; the PR check-run materializes the same `governance_records` *before* merge so you see what governance will require. The conversational path above and the file path produce identical DB rows — pick whichever fits your team. See [`docs/spec/dev-authoring-examples.md`](../spec/dev-authoring-examples.md) Example 5 for a full worked spec-as-file flow.

<details>
<summary><strong>Under the hood</strong></summary>

Three `upsert_plan` calls (one ADR, one feature, one spec). Three `submit_plan_for_review`. Three `governance_records` (approval kind) materialized by the policy engine, all of which you decided `passed`. Two `plan_relationships` rows — `parent_of` from epic to feature, `derived_from` from feature to spec — created automatically because the agent passed `parentPlanId` on `upsert_plan` (the operation translates parent→relationship; there's no privileged column).

Each `invoke_skill` call appended a row to `skill_outcomes` with `verdict='success'`. These rows are now part of `epic-decomposer`'s, `feature-spec-generator`'s, `adr-extractor`'s, and `spec-generator`'s ledgers on this project — they don't promote yet (the autonomy formula needs a thicker window), but they're banked.
</details>

---

## Step 6 — Stories + implementation (30 min)

This is where Jira earns its keep.

> **Coznt:** Story under the feature — which slice first, API or UI?

> **You:** API first.

> **Coznt:** I'll draft the story. Heads-up — when you approve it, I'll prompt you to create the matching Jira issue in `TASK` so your sprint board picks it up. From there, status flows both ways automatically.
>
> **Drafted: Implement /tasks API**  *(plan kind: `story`, parent_of `List-view UI`)*
> • POST, GET, PATCH, DELETE — full CRUD on `tasks`.
> • Backed by `tasks` table per ADR-001.
> • Acceptance: each endpoint returns correct status codes per RFC 7807; PATCH is idempotent; tests cover happy + error paths.
>
> Sent for review. Once it's approved, I can draft the tests while you write the handlers.

Approve in the inbox. The coach now writes a test scaffold:

> **Coznt:** Test scaffold is in `tests/tasks.test.ts`. Skeletons for each endpoint, with fixtures. Now go create the matching Jira issue:
>
> 1. Open Jira → `TASK` project → **Create issue**, type Story.
> 2. Title: "Implement /tasks API".
> 3. Description: paste a link to the coznt plan (I'll show it: `<coznt>/plans/abc123`).
>
> The webhook will pull it into coznt as `TASK-1`, mirrored into `work_items`. From then on you can reference `TASK-1` in commits and PR titles, and the link reads cleanly in both directions.

You create `TASK-1` in Jira. Within ~1 second the `work_items` table has a new row (`source='jira'`, `externalId='TASK-1'`, `status='to_do'`). Drag the Jira card to **In Progress**. Coznt sees the inbound webhook and updates `work_items.status='in_progress'`.

The story plan itself moves `approved → in_progress` the moment you transition `TASK-1` in Jira. That's a plan-artifact status transition driven by an external evidence event — not a phase advance, not a manual click. The audit log records it as such.

Write the handlers in your editor (use the agent normally — coding help isn't governed). Commit and push:

```bash
git checkout -b feat/tasks-api
git add .
git commit -m "feat: /tasks API + drizzle schema (TASK-1)"
git push -u origin feat/tasks-api
gh pr create --title "feat(TASK-1): /tasks API" --body "Closes TASK-1. Implements the v1 API story."
```

Merge the PR (assume green CI). The GitHub-Jira workflow integration auto-transitions `TASK-1` → Done. Back in your editor:

> **You:** did it land?

> **Coznt:** Yes — clean PR merge (no revert, checks green), and `TASK-1` transitioned to Done in Jira. The story plan flipped to `completed` automatically. Two outcome rows just landed:
> • `change-risk-classifier` — `pr_merge` assessor, verdict `success`.
> • `work_item` `TASK-1` — closed, lead time 2h 14m.
>
> An `evidence_links` row was also attached to the story plan pointing at the PR (evidenceType `external_link`) and the work item (evidenceType `work_item`). That's how the plan answers "did this actually ship" with rows rather than vibes — and how verification debt for this plan now stays at zero.
>
> That's your first success row on this project.

Repeat the loop once more for the UI slice (`TASK-2`).

When both slices are merged:

> **You:** that's it for stories?

> **Coznt:** For v1, yes. Want me to draft the test plan now so we close the loop on acceptance?

> **You:** yes.

<details>
<summary><strong>Under the hood</strong></summary>

`upsert_plan` for the story (kind=`story`, parent_of the feature). `invoke_skill('test-author')` for the scaffold. `submit_plan_for_review`. Two webhook paths fed coznt:

1. **GitHub** → `process-webhook-event` → `pr_merge` assessor → `skill_outcomes` row, `verdict='success'`, `sourceKind='pr_merge'`. The webhook handler also called `attach_evidence` with `evidenceType: 'external_link'` for the PR URL.
2. **Jira** → same task, `handleJira()` branch → upserts `work_items` (source=`jira`, externalId=`TASK-1`). Status transitions on the Jira side reflect into `work_items.status`; closing `TASK-1` triggers `compute-work-item-lead-time` task and updates the story plan to `completed`.

Coach watches both streams by calling `search_outcomes` when you ask "did it land?". On the close-out, `invoke_skill('test-plan-generator')` gets dispatched next — its outcome row goes into the ledger too.
</details>

---

## Step 7 — Test plan (10 min)

> **Coznt:** Drafting `test_plan` covering API endpoints + UI flows…
>
> **Drafted: TaskList v1 — Test plan**  *(plan kind: `test_plan`, derived_from `List-view UI`)*
> • API: 4 happy-path tests, 6 error-path tests (404 / 400 / 422 + auth-scope sanity).
> • UI: 3 interaction tests (toggle status, create via modal, filter by status).
> • Coverage target: 80% on src/app/api/tasks/* + the list view.
>
> Sent for review. Once approved I'll prompt you to run the suite; I roll up the execution report when you point me at the results.

Approve. Run your tests:

```bash
pnpm test
```

> **Note.** On `main` today, `pnpm test` reports 11 pre-existing vitest failures unrelated to the tutorial flow (legacy fixture noise). If you see exactly those failures, you haven't broken anything — those are tracked separately. Your own `tests/tasks.test.ts` should be green.

> **You:** all green. Report it.

> **Coznt:** Attaching the run as a `test_run` evidence link on the test plan… done. Coverage came in at 84%, above target. The test plan is now `completed` and has a hard link to the run that proved it.

The `test_plan` plan's verification debt drops to zero the moment the `evidence_links` row of type `test_run` lands. Plans in `completed` with missing expected evidence are exactly what builds debt; plans in `completed` with the right evidence row are debt-free.

---

## Step 8 — Release plan + CI/CD (10 min)

> **You:** let's wire up CI.

> **Coznt:** I'll roll this into the release plan rather than a separate "cicd_pipeline" kind — coznt's nine plan kinds are `epic / feature / story / spec / adr / test_plan / release_plan / risk_register / incident`, and CI/CD wiring lives in the release plan's body. Want GitHub Actions or Azure DevOps?

> **You:** GitHub Actions. Deploy to Vercel on merge to main.

> **Coznt:** *(drafts `release_plan` with the YAML body in a fenced block and the deploy target spelled out)*
>
> **Drafted: TaskList v1 — Release plan**  *(plan kind: `release_plan`, parent_of `tasklist-v1`)*
> • CI: GitHub Actions, runs `pnpm test` + lint on every PR.
> • Deploy target: Vercel `production` environment (bound on the project in Step 1).
> • Rollback: revert PR + re-deploy; documented in body.
> • Acceptance evidence (expected): `deployment` row + `test_run` row on the release plan once v1 ships.
>
> I can't push to your repo, so copy the YAML into `.github/workflows/ci.yml` and commit it yourself. Sent the release plan for review in parallel.

Copy the YAML, commit it, push to main. The pipeline runs, deploys to Vercel, and fires a `deployment_status` webhook back to coznt.

> **You:** did the deploy land?

> **Coznt:** Yes — clean deploy, no incident in the 24-hour window yet. A `deployment` evidence row landed on the release plan, and a `deploy_clean` outcome row went to `skill_outcomes`. The release plan is now `in_progress` (in production, waiting on the 24-hour incident window to settle). Want to mark v1 shipped?

> **You:** yes.

> **Coznt:** Release plan transitions to `completed`. v1 is live.

---

## Step 9 — Steady state (2 min)

> **You:** what's the state of the world?

> **Coznt:** TaskList v1 is in production. Lead time on this project so far is about three hours; one clean deploy, zero incidents, zero rollbacks. Two work items closed (`TASK-1`, `TASK-2`). I'll surface anything that drifts — and if a bug ticket lands in `TASK`, I'll mirror it in and flag it for you.

Look at the cockpit:

- **Overview** — Plans: 7, In progress: 0, Governance pending: 0, Outcomes 30d: 5.
- **Plans** — 7 rows, all `completed` or `approved`. Filter chips show counts per kind (no kind has its own route — kind is a filter chip, not a tab, per the design discipline rules in spec §10).
- **Work items** — 2 rows, both Done, source=jira.
- **Governance → Skills** — every skill on this project still at `observe` (0). They have outcomes — they haven't crossed the promotion threshold yet. **That's the setup for Act 2.**

---

## Act 1 recap — what just happened

You spoke to your editor in plain English. Behind the scenes, coznt landed:

- **7 plan artifacts** — 1 epic, 1 feature, 1 spec, 1 ADR, 2 stories, 1 test_plan, 1 release_plan — every one authored, reviewed via a `governance_records` row, approved. No phase column was touched because there isn't one.
- **Provenance** on every agent-authored plan — which skill produced it, which model, and the skill's autonomy level *at the moment of generation*. The plan detail's Summary panel shows the counts; reviewers triage AI-authored sections from the row, not from guessing.
- **~7 `governance_records` rows** — all kind=`approval`, all `status='passed'`, each carrying a decided-by + decided-at audit footprint. Every approval is bound to a specific `draft → in_review` transition on a specific plan.
- **5 outcome rows** in the Skills view (Governance → Skills) — three PR merges, one deploy, one work-item lead-time computation. Each one fed the `recomputeSkillAutonomy` job. No promotions yet (the trailing window is too thin and uniform), but the evidence is banked.
- **2 Jira issues** (`TASK-1`, `TASK-2`) mirrored as work_items with full status sync. The cockpit and the Jira board agree.
- **Multiple `evidence_links` rows** — every plan that closed pointed at the proof artifact (PR, deployment, test run, work item). That's the surface that lets verification debt stay at zero.
- **DORA dashboard** populated with one full cycle.
- **Same flow, different surface.** Every plan artifact, skill outcome, governance_record, and audit_log row above could have been produced by authoring `.agents/plans/<kind>/*.md` files in PRs instead of conversing with the coach. The DB rows are identical; only the authoring surface differs. The file path — including PR-lifecycle → status transitions, frontmatter-declared relationships, and merge-webhook import — is documented in [`docs/spec/dev-authoring-surface.md`](../spec/dev-authoring-surface.md).

Open the **Audit** sub-tab under Governance (or the org-wide `/audit` route) and filter by your user. Every line of dialog above is in there as a governed action with a timestamp and a row hash. *This is what "trust observable" means* — your conversation became the audit trail without you ever thinking about audit.

---

# Act 2 — Growth: Watch a skill earn its promotion (two weeks later)

Two weeks have passed. You've been using TaskList, building small features, and the coach has been quietly accumulating outcome rows every time a PR landed. Today you log back in to build v1.1 — task priorities (the thing we cut from v1).

Open your editor. Your session has no project bound yet — the local session state cleared when you closed cleanly last time:

> **You:** set project tasklist

> **Coznt:** Bound to "TaskList" (slug: `tasklist`). Subsequent verbs read from this project until you call `switch_project` or end the session.

That's the `set_project` MCP verb (Tier-1 ALWAYS_ALLOWED). Fuzzy-matches by id, slug, or name within your org. If you had two coznt-bound projects open in different terminals you'd call `switch_project` instead, with the same matcher.

Open the cockpit. The **Governance → Skills** sub-tab looks different than Act 1.

## Step 10 — The cockpit looks different (3 min)

The Skills sub-tab now shows:

| Skill | Autonomy | Outcomes (30d) | Last reason |
|---|---|---|---|
| `change-risk-classifier` | **propose** (1) | 11 success, 0 rolled_back | `trailing_window_clean` — promoted 4d ago |
| `epic-decomposer` | observe (0) | 1 success | — |
| `feature-spec-generator` | observe (0) | 3 success | — |
| `adr-extractor` | observe (0) | 3 success | — |
| `test-author` | observe (0) | 4 success | — |
| `test-plan-generator` | observe (0) | 1 success | — |
| `spec-generator` | observe (0) | 1 success | — |

`change-risk-classifier` crossed the promotion threshold first because it runs on *every* inbound PR webhook — over two weeks it accumulated more invocations than the lifecycle drafting skills, which only fire when you ask the coach for a plan. Coznt's autonomy formula looks at the trailing 30-day window: 10+ successes, no `rolled_back` or `incident` rows, and successes spread across at least 3 distinct work items. All 11 PRs landed clean, so it qualified.

Click the skill row. The **Skill detail** page shows:

- **Autonomy level over time** — a step line from 0 → 1 four days ago.
- **`skill_autonomy_events` row** — `reason: trailing_window_clean`, `decidedBy: system`, `priorLevel: 0`, `newLevel: 1`, `at: 2026-05-27T14:02:17Z`.
- **Every contributing outcome** — 11 rows, each with a clickable PR link and verdict.

> **The vision claim, made concrete.** Coznt didn't promote this skill because someone marked it "ready". It promoted because evidence accumulated, and you can drill from the level change all the way to the PR that pushed it over. The reverse is just as true — if you ask "why was this skill promoted?", a single row answers.

What this means in practice: starting now, `change-risk-classifier`'s output gets a different treatment in the plan-review UI. At observe, every AI-classified risk needed human re-verification. At propose, the risk classification flows into the plan body with a *light* provenance badge instead of a heavy "needs review" gate.

---

## Step 11 — A second human joins (5 min)

Alice (your reviewer on this project) gets added to the project — operator action, **Settings → Members**, role `reviewer`. While you're there, edit the approval policy in **Settings → Governance policies** to set `requiredCount: 2` for story plans (so two humans sign off when work is real, not just you accepting your own drafts). From now on, story-level approvals route to both you and Alice, and her sign-offs feed the audit ledger with her user id.

Open your editor. The coach now knows there's a second persona on this project:

> **You:** ok, let's build v1.1. Add task priorities — low / medium / high — and let users filter the list by priority.

> **Coznt:** Got it. Quick check — for the priority field on existing rows, default to `medium` or leave nullable?

> **You:** default medium.

> **Coznt:** Drafting under epic `tasklist-v1`…
>
> **Drafted: Task priorities**  *(plan kind: `feature`, parent_of `tasklist-v1`)*
> • Add `priority` enum to `tasks` (low / medium / high), default `medium`.
> • Backfill existing rows with `medium`.
> • UI: priority chip on the list, filter by priority in the list view.
> • API: PATCH accepts priority; list query supports `?priority=high`.
>
> Risk classification (`change-risk-classifier`, propose, model claude-opus-4-7):
> • **Low risk.** Schema change is additive with a safe default. No API breakage. No auth surface touched.
>
> Sent for review. With the updated policy, this needs 2 approvers — you and Alice are both on the approver list.

Notice what just happened: the coach included a risk classification *inline*, with provenance (skill name, autonomy level, model). At observe, it would have been a separate "needs review" section. At propose, it's load-bearing on the plan body. Alice still reviews — but she reviews *with* the AI's classification, not *against* it.

Alice opens the plan and scrolls to the **Summary panel** on the right rail:

```
Summary
─────────────────────────────────────
Plan kind             feature
Total sections        4
  Human-authored      2 (Goals, Acceptance)
  AI-authored         2 (Risk classification, Suggested gates)

Provenance (AI sections)
  change-risk-classifier  propose (1)   2026-05-29 14:21
    model: claude-opus-4-7   prompt v3
    autonomyAtGeneration: 1
    [view skill outcome row →]

Governance records on this plan
  approval (pending)   2 of 2 approvers needed   [Decide →]

Verification badges
  ✓ rule:no-direct-db        passed
  ✓ rule:idempotency         n/a (no write surface)
  ⚠ rule:auth-scope          fires below — see plan-touching-auth-scope
```

This is the **provenance** surface: every AI-authored section identifies its skill, its model, its autonomy level *at the moment of generation*, and links to the `skill_outcomes` row that recorded the call. If the skill gets demoted tomorrow, Alice can find every plan it touched while at propose and re-triage by row, not by guessing. The "AI made this" question stops being a vibe-check.

Alice approves; you approve. Two `governance_records` rows for the same plan, both flip to `passed`, the policy engine sees `requiredCount: 2` is met, and the plan transitions `in_review → approved`.

> **Coznt:** Both approvals in. Story under this feature is `TASK-3` — create it in Jira and tell me when you're starting.

You create `TASK-3`. Coznt mirrors it.

---

## Step 12 — The rule engine fires (5 min)

You start coding. A few minutes in, you realize the priority filter query touches the same code path as the auth middleware fix Alice landed last week. You revise the story plan in coznt:

> **You:** update the story — also add a check that the priority filter respects the existing user_id scope so we don't leak tasks across users.

> **Coznt:** Updating… hmm — your edit triggered a rule.
>
> **Rule:** `plan-touching-auth-scope` (`keyword-presence` validator)
> **Materialized as:** a `governance_records` row, kind=`gate`, status=`failed`, attached to this plan.
> **Failed because:** plan body mentions `user_id` scope but has no security-implications section.
> **Suggested fix:** add a short "Security implications" subsection covering the scope check and the test that proves it.

The rule engine is doing exactly what it's supposed to — catching a plan that touches a sensitive surface without acknowledging the surface. The gate record blocks the next status transition until it's resolved. You add the section:

> **You:** add this — "Security implications: list query is already scoped by user_id via the auth context. Test added in tests/tasks-scope.test.ts to assert cross-user isolation."

> **Coznt:** Rule re-validated — the gate record flipped `failed → passed`. Pushing the update. Alice and you both need to re-approve since the body changed materially.

Two new `approval` records get created on the new transition; both you and Alice decide them; the plan moves on.

You build it, push, merge `TASK-3`, watch it close. The story plan flips to `completed`, an `evidence_links` row of type `external_link` (PR) and `work_item` (Jira ticket) attach automatically.

> **You:** how's v1.1 looking?

> **Coznt:** Two work items closed (`TASK-3` and a quick UI tweak in `TASK-4`). `change-risk-classifier` now sits at 13 success outcomes, still propose. **Verification debt** on TaskList is 8 — that's low; you have one open approval older than 24h (a doc plan from last week) bumping it.

---

## Step 13 — Verification debt becomes visible (3 min)

Open **Governance → Verification debt**. The four-tile breakdown:

| Tile | Value | Means |
|---|---|---|
| Autonomy | 4 | Distance from each (skill, project) to `merge` (level 2), weighted by 30-day invocations. |
| Open approvals | 2 | Weighted age — one approval 28h old. |
| Gate trips | 1 | The auth-scope gate fired and held the plan for ~20 min before you resolved it. |
| Unreviewed AI | 1 | Hours since an AI-authored section was authored but not yet reviewed. |
| **Total** | **8** | Sum of the four. Lower is better. |

This is the analytical surface coznt's been pushing toward since day one — every governed action is row-addressable, and the platform derives a single number from them so a leader doesn't need to read 200 audit rows to know whether the project is healthy.

> **The vision claim, made concrete.** "Verification debt: 8" is not a dashboard guess. Each of the four numbers above traces to specific rows: the gate trip is `skill_outcomes` row #4711, the open approval is `governance_records` row #883, etc. If you ask "why is this 8 and not 4?", the answer is four queryable rows. See [docs/product/verification-debt-thesis.md](../product/verification-debt-thesis.md) for the formula.

You ship v1.1. Lead time: 3h 20m. No incidents.

---

# Act 3 — Stress: When trust breaks (week 4)

Week 4. v1.2 added bulk actions — select multiple tasks, change priority on all of them at once. The feature was drafted by the coach (with `change-risk-classifier` clearing it as **medium risk** — bulk operations widen blast radius), approved by you and Alice, built, merged, deployed.

Then your phone buzzes at 9:47pm. PagerDuty.

## Step 14 — The incident (10 min)

> **PagerDuty:** TaskList — 500 error rate spiked 4× in the last 5 min. Last deploy was 23 min ago (v1.2).

You open your editor:

> **You:** prod's on fire. v1.2 deploy. What changed?

> **Coznt:** Looking… the v1.2 release plan rolled up four PRs. `TASK-12` (bulk priority change) is the only one that touches the write path under load. Risk classification was medium, primary signal was "bulk write to indexed column". You want the diff?

> **You:** yes, and start a hotfix branch.

> **Coznt:** Diff is at `<coznt>/plans/v1.2/diffs/TASK-12`. Hotfix branch created locally: `hotfix/TASK-12-bulk-priority`. The PR template has the incident link pre-filled.

You read the diff. The bulk update was missing a `WHERE user_id = $auth_user_id` clause — it was updating priorities across all users when triggered. You revert the offending commit, push:

```bash
git revert <bad-commit>
git push -u origin hotfix/TASK-12-bulk-priority
gh pr create --title "hotfix: revert TASK-12 bulk-priority" --body "Reverts the v1.2 bulk priority write path. Missing user_id scope. Closes incident INC-019."
```

Merge. Vercel redeploys. Error rate drops.

> **You:** is prod back?

> **Coznt:** Yes — error rate back to baseline within 90 seconds of the redeploy. Three things just happened:
>
> • An **`incident` plan** was opened automatically: `INC-019 — TaskList v1.2 cross-user write`. Status `in_progress`. Linked to `TASK-12` via a `causes` relationship.
> • **`pr_revert`** assessor → `skill_outcomes`, `verdict='rolled_back'`, attributed to `change-risk-classifier`.
> • **`deploy_incident`** assessor → `skill_outcomes`, `verdict='incident'`, attributed to the same skill.
>
> The autonomy recompute job just ran. **`change-risk-classifier` was demoted: propose (1) → observe (0).** A row landed in `skill_autonomy_events`:
> • `reason: rollback_within_24h`
> • `priorLevel: 1`, `newLevel: 0`
> • `triggeringOutcomes: [#5012, #5013]`
>
> Effective immediately: any plan section authored by `change-risk-classifier` will be marked "needs review" until it re-earns propose. And — *this is the autonomy gate at runtime* — its next tool call on this project will hard-fail at the PreToolUse interceptor and route into your Governance → Inbox instead of executing.

> **The vision claim, made concrete.** Coznt didn't demote the skill on vibes. It demoted because deterministic assessors fired, those assessors wrote rows, the recompute job read the trailing window and re-applied the formula. The demotion is a single row with a reason. If Alice asks tomorrow "why is the risk classifier observe again?", the answer is row #2071 in `skill_autonomy_events`, with two clickable outcome rows attached.

### The gate fires (the next morning)

Next morning you open your editor and the agent reflexively reaches for `change-risk-classifier` to triage an unrelated PR you opened overnight. You don't even type anything — the editor's MCP client posts to `POST /api/v1/agents/pre-tool-use` with `{ skillSlug: "change-risk-classifier", tool: "classify", changeRisk: "medium" }`. Coznt's `handlePreToolUse` resolves the autonomy threshold (`resolveAutonomyThreshold` says medium-risk classification needs level 2; the skill is at 0), denies the call, and logs the block as an `automation_log` row with `taskId='pre-tool-use:change-risk-classifier'` and `status='blocked'`. The editor returns:

```
{
  "allowed": false,
  "reason": "autonomy_gate: skill at level 0 but 2 required",
  "autonomy": { "level": 0, "levelName": "observe", "requiredLevel": 2 }
}
```

Open the **Governance → Skills** sub-tab. The skill row shows the demotion + a "blocked invocations today: 1" pill. Click it to see the `automation_log` entry — that's where autonomy overrides land (per spec §11.5 J10, autonomy overrides are deliberately *not* governance records; they're a distinct mechanism).

This is what the autonomy gate *feels like* in the daily loop. The gate isn't a wall — it's a router. The skill doesn't earn back autonomy from any one-time human releases (only `pr_merge` / `deploy_clean` assessors do that), but the gate keeps you in the loop until evidence accumulates again.

> **The Govern pillar, made concrete.** The autonomy threshold check is the runtime contract. It runs *before* the LLM call, on every tool the agent reaches for. The IDE pays for tokens; coznt decides whether tokens get spent.

---

## Step 15 — The postmortem (10 min)

> **You:** let's do a postmortem.

> **Coznt:** Drafting `incident-019-postmortem` as a `risk_register` plan — that's the postmortem slot in coznt's nine-kind plan vocabulary…
>
> **Drafted: Incident 019 — bulk-priority cross-user write**  *(plan kind: `risk_register`, relates_to `INC-019`, causes `Task priorities` feature)*
> • **Timeline:** deploy 21:24, first 500 21:38, page 21:47, revert merged 22:03, error rate normal 22:05.
> • **Root cause:** `TASK-12` bulk-update query missing `WHERE user_id = $auth_user_id`.
> • **Why the risk classifier missed it:** the diff was small (one new function), and the file diff didn't include the auth context import. The classifier flagged it as medium for "indexed column write" but missed the scope risk.
> • **Why review missed it:** Alice and you reviewed the plan body, not the code diff. Plan body said "bulk update with auth scope respected" — but the implementation diverged.
> • **Corrective actions:**
>   1. Add a new `gate` policy: any plan referencing `bulk write` requires a `code_diff_url` field in `details` before the `in_review → approved` transition is allowed.
>   2. Add an integration test: `tests/auth-scope.test.ts` — assert every write query is scoped.
>   3. `change-risk-classifier` stays at observe until 10 clean outcomes accumulate. Manual review of every classification in the meantime.
>
> Sent for review. With the policy update, `risk_register` plans now need 2 approvers.

You and Alice both approve. The corrective actions become real:

- **Action 1** — the new gate policy lands in `governance_policies` (kind=`gate`, scope=`organization`, watches `in_review → approved` on any plan body matching `/bulk write/i`). From now on, any plan with "bulk write" in the body fails the gate without a `code_diff_url` field.
- **Action 2** — you add the integration test, push it as `hotfix/auth-scope-tests`, merge it. Clean PR → `pr_merge` outcome → `change-risk-classifier` gets its first re-earning success row.
- **Action 3** — the `change-risk-classifier` skill detail page now shows a "demotion record" — a permanent link from the level-0 segment back to incident 019. Trust is restoring, but the receipt of its breach stays in the ledger.

The incident plan transitions to `completed`. An `evidence_links` row of type `incident` attaches the on-call timeline to the risk_register plan; another of type `external_link` points at the revert PR.

The portfolio's verification debt for TaskList jumped from 8 to **31** the moment the demotion landed — autonomy distance now contributes more, and the open postmortem plan adds an open-approval point until it's signed.

---

## Step 16 — Watching trust come back (5 min)

Over the next week, you and Alice ship five more small PRs. Each one is a clean `pr_merge` outcome for `change-risk-classifier`. The skill detail page shows the level-0 segment lengthening with success markers.

> **You:** how close to re-promotion?

> **Coznt:** `change-risk-classifier` has 6 clean outcomes since the demotion. The autonomy formula needs 10 in a 30-day window, no `rolled_back` or `incident` rows, distinct work items. You're 4 away. At your current cadence (~5 PRs/week), that's about a week.

Verification debt has come back down to 18 as the postmortem plan got signed and one of the older open approvals cleared.

---

# Act 4 — Steady state: The platform view

Week 6. You've been running TaskList in prod for two weeks since the incident. The skill re-promoted three days ago. Your team also stood up a sibling project — `BillingSvc`, a small invoicing service — and bound it to coznt last week. Now you want to see what the platform looks like *across* projects.

## Step 17 — `/me` — your personal ledger (3 min)

Visit `/me`. This is not a todo list. It's the audit ledger filtered to *your* user row.

```
Hi, you.

Open governance records waiting on you ... 2
   • adr (BillingSvc) — 6h old
   • release_plan v1.3 (TaskList) — 18m old

Records you're blocking by not deciding ... 1
   • feature plan (BillingSvc) — assigned to you 28h ago

Per-project autonomy contributions
   TaskList    — 14 decisions, 3 author actions
   BillingSvc  — 3 decisions

Recent outcomes attributable to your work (last 14d)
   • 6 pr_merge (clean)
   • 1 pr_revert (incident 019 — see postmortem)
   • 4 work_items closed
```

The "records you're blocking" line is the polite version of a nudge — every pending governance record that names you and hasn't moved adds to the team's verification debt, and the platform tells you which row it is and how long it's been there.

---

## Step 18 — Portfolio: TaskList vs BillingSvc (5 min)

Open `/portfolio`. Two project rows:

| Project | Status | Pending records | Skill autonomy | Verification debt | Trust trend (30d) |
|---|---|---|---|---|---|
| TaskList | active | 1 | 4 propose, 2 observe | **18** | ↘ (recovering) |
| BillingSvc | active | 7 | 0 propose, 6 observe | **47** | ↗ (accumulating) |

`BillingSvc` is heavier. Click the **47** to see why:

| Component | Contribution |
|---|---|
| Autonomy distance × invocations | 22 (six skills at observe, all actively invoked) |
| Open-record age | 14 (three records older than 48h) |
| Gate trip rate | 4 (three gate records `failed` in 30d) |
| Unreviewed AI-authored sections | 7 (four plans with AI sections pending reviewer attention) |

This is the *raison d'être* of the analytical layer: a leader can sweep across 5, 50, or 500 projects and see verification debt as a single number, then drill from the number to the rows that built it. No project is a black box, and no number is mysterious.

> **The vision claim, made concrete.** "BillingSvc has more debt than TaskList" is not a feeling. It's 22+14+4+7=47, sourced from 47 rows you can open. The platform's job is to *make this addressable* — verification debt isn't a metric for a board deck, it's a queue of clickable things.

---

## Step 19 — The audit log as unified ledger (5 min)

Open `/audit` (or **Governance → Audit** scoped to a project). Filter by **last 24 hours**. The stream:

```
2026-05-31 09:14:02  governance.decided   Alice → approval on release_plan v1.3  TaskList
2026-05-31 09:13:21  webhook.github       pr_merge #142 (clean)                  TaskList
2026-05-31 09:13:20  webhook.jira         TASK-31 transitioned to Done           TaskList
2026-05-31 09:12:18  skill.invocation     change-risk-classifier (propose)        TaskList
2026-05-31 09:10:55  plan.created         story TASK-31                          TaskList
2026-05-31 09:09:30  agent.session_start  coach: feature — bulk filter fix       TaskList
2026-05-31 08:47:14  webhook.jira         TASK-30 → In Progress                  TaskList
2026-05-31 08:32:01  governance.decided   you → approval on feature plan         BillingSvc
... 47 more rows ...
```

Every row has a `row_hash`. Every row links to its underlying entity (plan, work item, skill outcome, governance record). Filter by user, by project, by skill, by plan kind. This single stream is *the* coznt source-of-record — every other surface in the product is a view over it.

### The chain is a chain

Click the **Verify chain** button in the top-right. Coznt walks every row in the visible window, recomputes each `row_hash = sha256(prev_hash ‖ canonical_fields)`, and confirms the head:

```
✓ Chain verified — 1,847 rows in window
  Head: b7a4...0e3f  (matches stored chainHead)
  Per-org advisory lock: org_acme  ✓ held during write
  Zero hash drift detected.
```

Then for a chosen row, click **Receipt** — coznt emits a signed evidence packet (`POST /api/v1/audit/verify` if you want to script it) with the row's canonical fields, prev hash, and the recomputed hash. That's the artifact a SOC 2 / ISO 27001 auditor reads. The hash-chain proves no row was retroactively edited; the receipt proves any specific claim was true at the time it was written.

Two more things to notice:

1. **GitHub + Jira + coznt events live in the same stream.** PR merges, Jira transitions, and human governance decisions interleave by timestamp. This is the unification thesis: SDLC happens across tools, but the audit substrate is one ledger.
2. **The dialog from Act 1 is in here.** Scroll back to two weeks ago. Every "You: I want to build…" → "Coznt: drafting…" exchange is a row pair. The human conversation became the audit trail without anyone framing it as one.

---

## Step 20 — A glimpse of what comes next (2 min)

Click `change-risk-classifier` from the cockpit. Scroll to the bottom:

> **Next promotion (propose → merge):** needs 25 clean outcomes in 30d, no `rolled_back` or `incident`, distinct work items ≥ 8. Current: 14/25.

> **Senior unlocks:** `change-risk-classifier` can author "low" risk classifications without provenance badge gating reviewer attention.

> **Lead (3) unlocks the autonomy gate at full effect:** the PreToolUse interceptor (`POST /api/v1/agents/pre-tool-use`) auto-allows the skill's tool calls without routing through Governance → Inbox, *for the action/risk combinations its level covers*. The gate is **already live today** — the difference at lead is that more action × risk combinations pass without routing, per `resolveAutonomyThreshold`. The default thresholds: `deploy_production` never auto (∞), `merge_pr` low/medium ≥ level 2, high ≥ level 3, critical never auto.

This is coznt's roadmap surfaced *in the product itself*: a skill that earns trust through evidence eventually unlocks autonomous action, gated by the same ledger that produced the trust. The vision is not "AI agents do work" — it's "AI agents do work in proportion to the evidence they've banked, observable to humans every step of the way."

---

# What you just saw

Across four acts, you walked through one project's lifecycle from blank repo to "the platform knows it." The throughline:

| Pillar | Where you saw it |
|---|---|
| **Govern (autonomy gate)** | The PreToolUse interceptor blocked the demoted `change-risk-classifier` before any LLM tokens were spent, and logged the block as an `automation_log` row. The gate fires on every tool call. Autonomy overrides are deliberately *not* governance records — they're a distinct mechanism per spec §11.5 J10. |
| **Govern (governance records)** | Every plan transition from `draft → in_review → approved → in_progress → completed` was gated by a `governance_records` row — kind=`approval` (sign-off) or kind=`gate` (rule). The rule engine emits `gate` records that block transitions until they reach `passed` (or are superseded by an `exception` record). Four kinds, one status state machine, one evaluator dispatcher — per spec §10. |
| **Govern (policies vs records)** | The Standard template seeded `governance_policies` rows at project creation; those policies materialized `governance_records` whenever a plan crossed the watched transition. Policies are rules; records are applications of rules. |
| **Verify (deterministic ledger)** | `pr_merge`, `pr_revert`, `deploy_clean`, `deploy_incident` assessors wrote every `skill_outcomes` row. Promotion and demotion both flowed from those rows via `recomputeSkillAutonomy`. |
| **Verify (prompt-quality rubric)** | The capture hook scored every prompt against the 6-dim rubric before it reached the model; sub-threshold prompts were gated locally, scored ones fed `prompt_logs` as a leading indicator. |
| **Trust (audit log + hash chain)** | Step 19 — clicking *Verify chain* recomputed `row_hash = sha256(prev_hash ‖ canonical_fields)` for the visible window, confirmed the head, and let you emit a receipt for any row. The audit log is the unified source-of-record. |
| **Trust (verification debt)** | One number per project, four components, every component a clickable queue of rows. Watched it climb on demotion and recover on re-earning. |
| **Trust (evidence links)** | Every `completed` plan pointed at the proof artifact via `evidence_links` (deployment, test_run, work_item, external_link). Verification debt is "plans in `completed` with missing expected evidence" — every row you saw drove that number toward zero. |
| **Trust (provenance)** | The Summary panel showed which sections were AI-authored, which skill produced each, the model + autonomy at generation, and a link to the originating `skill_outcomes` row. Triage AI-authored content from a row, not a vibe. |
| **AI-DLC Governed (the tagline)** | Schema stayed vendor-neutral — nine plan kinds (`epic / feature / story / spec / adr / test_plan / release_plan / risk_register / incident`), seven relationship kinds, four governance kinds. No phase column, no per-vendor primitives. AI-DLC's Inception/Construction/Operations grouping renders as a methodology overlay on the same data. |
| **Two sources of truth** | Drizzle schemas owned the DB shape; Zod schemas owned the AI output shape and per-kind `details` JSONB validation (`src/lib/plan/schemas.ts`, `src/lib/governance/schemas.ts`). You never saw a manual TypeScript interface. |
| **Conversational ergonomics** | You typed sentences. The coach translated to ~40 verb invocations across the four acts. The verbs are there if you want them — they aren't required. |
| **Two-tool unification** | GitHub holds code, Jira holds the board, coznt is the governance + audit layer over both. The cockpit and the Jira board agree because the same webhook task wrote both. |

The audit log proves all of the above. Filter by your user, scroll back to the start of Act 1, and read every line of dialog as a governed action — including the prompt-quality scores, the autonomy gate decisions, and the chain-verification calls. That is the product.

---

# Where to go next

- **Run the brownfield variant.** Re-do this on a project where Jira already has a backlog of tickets and the repo has months of history. Step 3 changes — the coach opens with `get_assigned_work`, reads what's assigned to you, and drafts the first epic *referencing* those tickets. The conversation feels almost identical; the trust arc starts from a non-zero base because some skills already have outcome history on neighboring projects. **Tip:** start with `coznt walkthrough` (or paste `https://coznt.dev/walkthrough` into your agent) — it reads 30d of outcomes and proposes incident-specific skills + rules tailored to what already broke on the project.
- **Run the tracker-less variant.** Skip the Jira prerequisite, leave the repository binding to GitHub only. Coznt becomes both the planning surface (plan artifacts) and the audit ledger. Good for tiny side projects, hackathons, or pre-formalization evaluation.
- **Try short-syntax quick-add.** Press <kbd>Cmd+K</kbd> and type `fix payment edge case #spec +tasklist 2h @alice` — the palette parses the sigils, shows a preview, and opens `/plans/new` prefilled. Same grammar works from the CLI: `coznt call upsert_plan --shortSyntax "fix #spec +tasklist 2h"`.
- **Drive the verb surface from a terminal.** `coznt call <verb>` dispatches any registered MCP tool from your shell. `coznt call` (no args) lists every verb. Useful for scripting, smoke testing, or driving coznt from an agent that doesn't speak MCP yet.
- **Read the verb surface.** [`docs/spec/mcp-verbs.md`](../spec/mcp-verbs.md) — the live verb inventory. Key reads: `get_my_context`, `get_assigned_work`, `get_autonomy`, `get_verification_debt`, `get_provenance`. Key writes: `upsert_plan`, `submit_plan_for_review`, `create_governance_record`, `decide_governance_record`, `request_exception`, `attach_evidence`. Session: `set_project`, `switch_project`. The phase-era verbs (`submit_phase_for_review`, `get_phase_checklist`, `advance_phase`, `mark_gate_passed`) are deleted — governance is plan-bound, not phase-bound.
- **Author your own skills, rules, and plans as files.** [`docs/spec/dev-authoring-surface.md`](../spec/dev-authoring-surface.md) — the canonical contract for `.agents/skills/`, `.agents/rules/`, and `.agents/plans/<kind>/` file-based authoring. PR merge is the apply event; there is no sync command. Worked examples in [`docs/spec/dev-authoring-examples.md`](../spec/dev-authoring-examples.md): six end-to-end flows showing how a single `.md` file becomes governed behavior, evidence, and earned autonomy. **Quick start:** paste `https://coznt.dev/walkthrough` into your agent for a generated starter set of `.agents/` files based on this project's actual debt — the agent reads `get_verification_debt` + `get_outcomes`, maps real incidents to code, and opens a PR via `propose_artifact` for you to review.
- **Tune the routing.** The agent's session-start context comes from the coznt-claimed section in your `CLAUDE.md`/`AGENTS.md`. The block auto-refreshes via content-hash on every MCP response, but if you want to override coznt's default routing rules for this project (e.g. "every story needs a security ADR"), author a project-tier rule at `.agents/rules/` — it's picked up on PR merge and added to the routing surface the agent reads.
- **Read the verification debt thesis.** [docs/product/verification-debt-thesis.md](../product/verification-debt-thesis.md) — the formula, the rationale, and why "trust-establishment cost" is the analytical primitive coznt is built around.
- **Read the governance spec.** [docs/spec/governance-schema-simplified.md](../spec/governance-schema-simplified.md) — the canonical schema doc: five primitives, four governance kinds, nine plan kinds, seven relationship kinds, the §10 design discipline rules, and the litmus tests for "is this a policy or a record?".
- **Read the positioning.** [docs/positioning.md](../positioning.md) — AI-DLC Governed tagline, Govern–Verify–Trust spine, daemon + choreography architecture, what coznt deliberately is *not*.

# If the editor goes off-script

There is no separate coach to debug — your editor's agent IS the coach, configured by three surfaces. If it leaks a verb name at you, asks three questions when it should ask one, or routes to the wrong skill, the fix is in one of:

- **CLAUDE.md/AGENTS.md claim block** — the always-on routing rules. Run any MCP verb to trigger content-hash refresh if it looks stale.
- **MCP tool descriptions** — per-verb guidance lives in `src/mcp/server.ts`. PRs welcome.
- **`get_my_context` response** — the state-aware routing recommendation. Logic in `src/mcp/tools/get-my-context.ts`.
- **Server-side skill bodies** — `src/automations/skills/<slug>/` for the actual choreographies invoked via `invoke_skill`.

For the usual webhook / binding / autonomy issues, see [`operate/install.md`](../operate/install.md) and [`operate/webhook-auth.md`](../operate/webhook-auth.md).
