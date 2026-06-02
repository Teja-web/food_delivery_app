# Tutorial — Ship TaskList, then live with it

This is coznt's flagship walkthrough. By the end, you will have:

1. **Shipped TaskList v1** end to end by talking to your editor in plain English — across all six SDLC phases, with GitHub holding your code and Jira holding your sprint board, and coznt acting as the governance layer over both.
2. **Watched an AI skill earn promotion** from `observe` to `propose` because real deterministic outcomes accumulated in its favor.
3. **Survived a production incident** that demoted a skill and triggered a postmortem — and watched coznt re-establish trust the same way it earned it the first time.
4. **Read the portfolio view** that surfaces verification debt across projects, and used the `/me` ledger to see your personal slice of the same audit substrate.

Coznt's tagline is **AI-DLC Governed**, and the operating spine is **Govern → Verify → Trust**: *govern* what AI can do (phases, rules, autonomy thresholds), *verify* what it produces (a deterministic outcome ledger that grades every action), *trust* what can be proven (a hash-chained audit log where every claim on screen links to a source-of-record row). "Trust observable" is the UX thesis under the Trust pillar.

The why-now: generating plausible code is cheap; **establishing trust in it is the scarce resource.** Organizations that don't operationalize Govern–Verify–Trust accumulate *verification debt* — unverified AI output that compounds risk until something fails in production. Coznt's job is to keep that debt addressable. The four acts walk you through what that looks like.

**Time:** ~90 min for Act 1 (active work). Acts 2–4 are presented as "two weeks later", "week four", and "steady state" — together they're another ~45 min of reading and clicking through.

**Reading guide:**

| Act | What it shows | You can stop after this and still be done… |
|---|---|---|
| Act 1 | Ship v1 across six phases with Jira and GitHub both bound | …if you only need to know "can coznt govern a real SDLC loop without imposing vocabulary on the human." |
| Act 2 | A skill earns its first promotion. A second human joins. Rule engine fires. | …if you only need to see autonomy compound from evidence. |
| Act 3 | Production incident → demotion → postmortem → recovery. | …if you need to see what happens when trust breaks. |
| Act 4 | `/me`, portfolio, verification debt, audit log as unified ledger. | …if you want the "view from above" — the platform's analytical surface. |

**Prerequisites:**
- Coznt running locally per [user-guide §B2](../user-guide.md#b2-first-time-install).
- An empty GitHub repo (`gh repo create acme/tasklist --public --clone`).
- A fresh Jira project — create it in Jira UI (**Project → Create → Scrum**, key `TASK`). Coznt binds to existing Jira projects; it doesn't provision them.
- GitHub and Jira tokens connected to coznt per [user-guide §B5](../user-guide.md#b5-connect-github-once-per-org) (one-time per org).
- Your editor connected to coznt per [user-guide §A2](../user-guide.md#a2-connect-your-editor-or-cli).

**What you won't do:** type a coznt verb name. Coznt ships a master choreography — **Project Lifecycle Coach** — that wraps every governed action behind plain conversation. The **Under the hood** callouts show what got called, for the curious. They are not what an end user reads.

---

# Act 1 — Foundation: Ship TaskList v1 (~60 min)

You're going to build TaskList, a single-user TODO app: title, status (`todo` / `in_progress` / `done`), due date. REST API + Next.js UI + CI + a v1 release deployed to Vercel.

You'll bind both a fresh GitHub repo (for code) and a fresh Jira project (for sprint tracking) from day one — coznt becomes the governance and audit layer over both.

---

## Step 1 — Create the project in coznt (3 min)

This is the **only** non-chat step in Act 1. The agent can't create projects for you — that's an operator action.

Open `<your-coznt-url>/projects/new` and fill:

| Field | Value |
|---|---|
| Name | `TaskList` |
| Slug | `tasklist` |
| Description | `Personal TODO manager — single-user v1` |
| Repo URL | `https://github.com/acme/tasklist` |
| Jira project key | `TASK` |

Submit. You land at the cockpit, phase = **requirements**. Both bindings are now live: any PR you open against the repo will fire `pr_merge`/`pr_revert` assessors, and any issue you create in the `TASK` Jira project will mirror into coznt's `work_items` table within a second.

---

## Step 2 — Wire up your repo (2 min)

From inside your `tasklist` repo:

```bash
coznt connect       # pick "tasklist" when prompted
coznt sync          # pulls choreographies including "Project Lifecycle Coach"
```

`coznt connect` does three things in one pass:

1. Writes your editor's MCP config (`.mcp.json` for Claude Code, `.cursor/mcp.json` for Cursor, `.zed/settings.json` for Zed, etc.) so the editor can talk to coznt's verb surface.
2. **Installs the prompt-quality hook** (default-on for Claude Code, opt-in elsewhere). Every prompt you submit will be scored locally against the 6-dimension rubric — *clarity, scope, acceptance, prior context, constraints, verifiability* — and prompts below `COZNT_PROMPT_MIN_SCORE` are gated *before* they reach the model. This is Milestone B's pre-flight gate for the agent-loop side of governance. See `docs/operate/prompt-hook.md` for the rubric and threshold knobs.
3. Adds `.coznt/.local/` and `.mcp.json` to your `.gitignore` so the API key never lands in a commit.

`coznt sync` writes `.coznt/skills/project-lifecycle/SKILL.md` into your repo. That file is what your editor's agent now knows about coznt — don't edit it; `coznt sync` will overwrite local changes. If you want to read what your agent knows, open it.

Restart your editor.

> **What the hook feels like in practice.** When you type a prompt like *"do the thing"* the hook scores it (low clarity, missing acceptance criteria, no constraints) and refuses with a one-line summary of which dimensions failed. You rewrite as *"add a `priority` enum (low/medium/high, default medium) to the tasks table; backfill existing rows; show as a chip on the list view; the existing auth-scope test must still pass"* — clarity high, scope explicit, acceptance verifiable, constraint cited — and the hook lets it through. The hook doesn't block you from working; it blocks the model from receiving prompts that won't produce verifiable output. Score history is captured in `prompt_logs` so the Verify pillar can later correlate prompt quality with outcome quality.

---

## Step 3 — Tell your editor what you're building (10 min)

Open your editor. Type:

> **You:** I want to build a small TODO app called TaskList. Single user, v1 should support a task with a title, status (todo / in-progress / done), and a due date. REST API, simple Next.js UI.

> **Coznt:** Got it. Quick lay-of-the-land — your Jira project `TASK` is empty (no assigned issues yet), and your repo is fresh. So I'll keep requirements as coznt plans for now; once we get to stories, I'll prompt you to create matching Jira issues so your sprint board reflects the build.
>
> One check before I draft this — should v1 support task priorities, or hold that for v2?

> **You:** v2.

> **Coznt:** Drafting now…
>
> **Drafted: TaskList — v1 spec**
> • Single-user TODO app with title, status (todo / in_progress / done), due date
> • REST API: create, list (filterable by status), patch (partial), delete
> • Next.js UI: list view with inline status toggle, "new task" form
> • Acceptance: every endpoint returns RFC 7807 problem+json on error; list is paginated to 100; PATCH is idempotent
> • Out of scope for v1: priorities, multi-user, auth
>
> Filed as plan kind `spec` — the spec-driven kind coznt's schema added for GitHub Workspace / Anthropic / OpenAI parity. Does that match what you wanted? Want me to send it to the tech lead for sign-off, or are you reviewing it yourself?

> **You:** I'll review it. Send it to me.

> **Coznt:** Sent. You'll see it in the top-right bell on your coznt tab.

<details>
<summary><strong>Under the hood</strong> — what just got called</summary>

The coach choreography ran this sequence without naming any of it to you:

1. `get_my_context` → confirmed phase=`requirements`, `invoke_skill` allowed.
2. `get_assigned_work` → returned empty (no Jira issues assigned, no in-progress plans). The coach used this to phrase its opening line correctly.
3. `session_start` with intent `"coaching tasklist requirements"`.
4. `invoke_skill('requirements-document')` → server-side LLM call, Zod-validated output.
5. `draft_requirement` to stage the structured spec.
6. After your "yes", `push_requirements` to land it as a real plan.
7. `submit_for_approval` with you as the reviewer.
8. `session_end` with a one-line summary.

You would have had to know eight verb names, two skill slugs, and one phase enum. You typed two sentences instead.

The spec plan is **coznt-native** — it lives in `plans` with kind=`spec`, not in Jira. Stories (Step 6) are where Jira earns its keep, because stories are what your sprint board actually tracks.
</details>

---

## Step 4 — Approve and advance (3 min)

Open your coznt tab. The bell shows `1`. Click it → approve the requirements plan.

Back in your editor:

> **You:** what's next?

> **Coznt:** Requirements is done — one approved plan, gate is green. Ready to move into design, or want to add anything first?

> **You:** let's go.

> **Coznt:** Sent for advancement. The tech lead (you, on this project) needs to sign off — check your bell.

Approve. Phase flips to **design**.

<details>
<summary><strong>Under the hood</strong></summary>

`get_phase_checklist` → all green. `submit_phase_for_review` opens an approval. On approval, the project row updates to `phase='design'`. Your next agent turn sees the new `allowedTools` from `get_my_context`.
</details>

---

## Step 5 — Design (15 min)

The coach pulls design decisions out of you one at a time, in conversation. These all become coznt-native plans — Jira doesn't track ADRs.

> **Coznt:** We're in design now. First question — what's the storage plan?

> **You:** Postgres + Drizzle. Single `tasks` table, indexed on status and due_date.

> **Coznt:** Drafting that as a decision record…
>
> **Drafted: Storage decision (ADR-001)**
> • Postgres + Drizzle, single `tasks` table, composite index on `(status, due_date)`
> • Alternatives considered: SQLite (no concurrency), MongoDB (overkill for v1)
> • Implication: schema changes go through `pnpm db:generate`
>
> Want me to send it for sign-off?

> **You:** yes.

> **Coznt:** Sent. Next question — how do you want the UI flow to work? Just the list view, or a separate detail page per task?

> **You:** just a list view with an inline edit modal.

> **Coznt:** Drafting the storyboard…
>
> **Drafted: TaskList UI storyboard**
> • One screen: filterable list, inline status toggle, "new task" button → modal
> • Empty state: "No tasks yet. Add your first." with a single CTA
> • Mermaid flow diagram included
>
> Send for sign-off?

> **You:** yes.

Approve both in `/approvals`. Then:

> **You:** anything else for design?

> **Coznt:** One more: any non-functional requirements I should record? Error format, idempotency, rate limits?

> **You:** Errors use RFC 7807 problem+json. PATCH is merge-patch (RFC 7396). No rate limits in v1.

> **Coznt:** Drafting the API conventions ADR-002… Sent. With this approved, design is done — ready for development?

> **You:** yes.

Approve in `/approvals`. Phase is now **development**.

<details>
<summary><strong>Under the hood</strong></summary>

Three `invoke_skill` calls — twice to `adr-extractor`, once to `storyboard-generator`. Three `submit_for_approval`. One `submit_phase_for_review`. Each invocation appended a row to `skill_outcomes` with `verdict='success'`. These rows are now part of `adr-extractor`'s and `storyboard-generator`'s ledger on this project — they don't promote yet (the autonomy formula needs a thicker window), but they're banked.
</details>

---

## Step 6 — Development (30 min)

This is where Jira earns its keep.

> **Coznt:** You're in development now. Which slice first — API endpoints, or the UI?

> **You:** API first.

> **Coznt:** I'll draft the story. Heads-up — when you approve it, I'll prompt you to create the matching Jira issue in `TASK` so your sprint board picks it up. From there, status flows both ways automatically.
>
> **Drafted: Implement /tasks API**
> • POST, GET, PATCH, DELETE — full CRUD
> • Backed by `tasks` table per ADR-001
> • Acceptance: each endpoint returns correct status codes per RFC 7807; PATCH is idempotent; tests cover happy + error paths
>
> Send for sign-off? I can draft the tests while you write the handlers.

> **You:** yes, both.

Approve in `/approvals`. The coach now writes a test scaffold:

> **Coznt:** Test scaffold is in `tests/tasks.test.ts`. Skeletons for each endpoint, with fixtures. Now go create the matching Jira issue:
>
> 1. Open Jira → `TASK` project → **Create issue**, type Story.
> 2. Title: "Implement /tasks API".
> 3. Description: paste a link to the coznt plan (I'll show it: `<coznt>/plans/abc123`).
>
> The webhook will pull it into coznt as `TASK-1`, mirrored into `work_items`. From then on you can reference `TASK-1` in commits and PR titles, and the link reads cleanly in both directions.

You create `TASK-1` in Jira. Within ~1 second the work_items table has a new row (`source='jira'`, `externalId='TASK-1'`, `status='to_do'`). Drag the Jira card to **In Progress**. Coznt sees the inbound webhook and updates `work_items.status='in_progress'`.

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

> **Coznt:** Yes — clean PR merge (no revert, checks green), and `TASK-1` transitioned to Done in Jira. Two outcome rows just landed in the Trust tab:
> • `change-risk-classifier` — `pr_merge` assessor, verdict `success`
> • `work_item` `TASK-1` — closed, lead time 2h 14m
>
> That's your first success row on this project.

Repeat the loop once more for the UI slice (`TASK-2`). When both slices are merged:

> **You:** development done?

> **Coznt:** Almost — I'll roll up everything merged so far. *(drafts dev_summary plan, sends for sign-off)* Once that's approved, we're ready for testing.

<details>
<summary><strong>Under the hood</strong></summary>

`upsert_plan` for the story, `invoke_skill('test-author')` for the scaffold, `submit_for_approval`. Two webhook paths fed coznt:

1. **GitHub** → `process-webhook-event` → `pr_merge` assessor → `skill_outcomes` row, `verdict='success'`, `sourceKind='pr_merge'`.
2. **Jira** → same task, `handleJira()` branch → upserts `work_items` (source=`jira`, externalId=`TASK-1`). Status transitions on the Jira side reflect into `work_items.status`; closing `TASK-1` triggers `compute-work-item-lead-time` task.

Coach watches both streams by calling `search_outcomes` when you ask "did it land?". On phase wrap, `invoke_skill('dev-summary-generator')` — its outcome row goes into the ledger too.
</details>

---

## Step 7 — Testing (10 min)

> **You:** what's next?

> **Coznt:** Want me to draft the test plan, or do you have one?

> **You:** draft it.

> **Coznt:** *(drafts test_plan covering API endpoints + UI flows, sends for sign-off)* When you've run the suite, point me at the results and I'll roll up the execution report.

Run your tests:

```bash
pnpm test
```

> **Note.** On `main` today, `pnpm test` reports 11 pre-existing vitest failures unrelated to the tutorial flow (`set_project` Tier-1 verb registry, MCP config writer fixtures, chokepoint invariant). If you see exactly those failures, you haven't broken anything — those are tracked separately. Your own `tests/tasks.test.ts` should be green.

> **You:** all green. Report it.

> **Coznt:** *(drafts test_execution_report from the test_plan + your results, sends for sign-off)* Once that's approved, ready for CI/CD.

Approve both. Advance.

---

## Step 8 — CI/CD (10 min)

> **You:** let's wire up CI.

> **Coznt:** GitHub Actions or Azure DevOps?

> **You:** GitHub Actions. Deploy to Vercel on merge to main.

> **Coznt:** *(drafts cicd_pipeline plan with the YAML body)* Here's the pipeline. I can't push to your repo, so copy the YAML into `.github/workflows/ci.yml` and commit it yourself. Want me to send the plan for sign-off in parallel?

> **You:** yes.

Copy the YAML, commit it, push to main. The pipeline runs, deploys to Vercel, and fires a `deployment_status` webhook back to coznt.

> **You:** did the deploy land?

> **Coznt:** Yes — clean deploy, no incident in the 24-hour window yet. Your deploy outcome row is in the Trust tab. Ready to cut the v1 release?

> **You:** yes.

> **Coznt:** *(drafts release_plan rolling up everything merged in this project, sends for sign-off)* Approve and you're shipped.

Approve. v1 is live.

---

## Step 9 — Monitoring (2 min)

> **You:** what's the state of the world?

> **Coznt:** TaskList v1 is in production. Lead time on this project so far is about three hours; one deploy, zero incidents, zero rollbacks. Two work items closed (`TASK-1`, `TASK-2`). I'll surface anything that drifts — and if a bug ticket lands in `TASK`, I'll mirror it in and flag it for you.

That's the steady state for Act 1. Look at your cockpit and you'll see:

- **Phase:** monitoring
- **Plans approved:** ~10
- **Outcome rows banked:** 5+ (PR merges, deploy, work item closes)
- **Skill autonomy:** every skill on this project still at `observe` (0). They have outcomes — they haven't crossed the promotion threshold yet. **That's the setup for Act 2.**

---

## Act 1 recap — what just happened

You spoke to your editor in plain English. Behind the scenes, coznt landed:

- **~10 plans** — requirements, three ADRs, storyboard, two stories, dev_summary, test_plan, test_execution_report, cicd_pipeline, release_plan — every one authored, reviewed, approved.
- **Provenance** on every agent-authored plan — which skill produced it, which model, and the skill's autonomy level *at the moment of generation*. The plan detail's Summary panel shows the counts; reviewers triage AI-authored sections from the row, not from guessing.
- **~10 audit rows** for the approvals, plus rows for every governed agent action.
- **5 outcome rows** in the Trust tab — three PR merges, one deploy, one work-item lead-time computation. Each one fed the `recomputeSkillAutonomy` job. No promotions yet (the trailing window is too thin and uniform), but the evidence is banked.
- **2 Jira issues** (`TASK-1`, `TASK-2`) mirrored as work_items with full status sync. The Trust tab and the Jira board agree.
- **All six phases** passed.
- **DORA dashboard** populated with one full cycle.

Open the **Audit log** in coznt and filter by your user. Every line of dialog above is in there as a governed action with a timestamp and a row hash. *This is what "trust observable" means* — your conversation became the audit trail without you ever thinking about audit.

---

# Act 2 — Growth: Watch a skill earn its promotion (two weeks later)

Two weeks have passed. You've been using TaskList, building small features, and the coach has been quietly accumulating outcome rows every time a PR landed. Today you log back in to build v1.1 — task priorities (the thing we cut from v1).

Open your editor. Your session has no project bound yet — there's no `.coznt/.local/` cache because you closed it cleanly last time:

> **You:** set project tasklist

> **Coznt:** Bound to "TaskList" (slug: `tasklist`, phase: monitoring). Subsequent verbs read from this project until you call `switch_project` or end the session.

That's the `set_project` MCP verb (Tier-1 ALWAYS_ALLOWED — works without a phase). Fuzzy-matches by id, slug, or name within your org. If you had two coznt-bound projects open in different terminals you'd call `switch_project` instead, with the same matcher.

Open the cockpit. You'll notice something different than Act 1.

## Step 10 — The cockpit looks different (3 min)

The **Trust** tab now shows:

| Skill | Autonomy | Outcomes (30d) | Last change |
|---|---|---|---|
| `change-risk-classifier` | **propose** (1) | 11 success, 0 rolled_back | **Promoted** 4d ago |
| `adr-extractor` | observe (0) | 3 success | — |
| `test-author` | observe (0) | 4 success | — |
| `requirements-document` | observe (0) | 1 success | — |
| `storyboard-generator` | observe (0) | 1 success | — |
| `dev-summary-generator` | observe (0) | 1 success | — |
| `cicd-pipeline-authoring` | observe (0) | 1 success | — |

`change-risk-classifier` crossed the promotion threshold first because it runs on *every* inbound PR webhook — over two weeks it accumulated more invocations than the lifecycle drafting skills, which only fire when you ask the coach for a plan. Coznt's autonomy formula looks at the trailing 30-day window: 10+ successes, no `rolled_back` or `incident` rows, and successes spread across at least 3 distinct work items. All 11 PRs landed clean, so it qualified.

Click the skill row. The **Skill detail** page shows:

- **Autonomy level over time** — a step line from 0 → 1 four days ago.
- **`skill_autonomy_events` row** — `reason: trailing_window_clean`, `decidedBy: system`, `priorLevel: 0`, `newLevel: 1`, `at: 2026-05-27T14:02:17Z`.
- **Every contributing outcome** — 11 rows, each with a clickable PR link and verdict.

> **The vision claim, made concrete.** Coznt didn't promote this skill because someone marked it "ready". It promoted because evidence accumulated, and you can drill from the level change all the way to the PR that pushed it over. The reverse is just as true — if you ask "why was this skill promoted?", a single row answers.

What this means in practice: starting now, `change-risk-classifier`'s output gets a different treatment in the plan-review UI. At observe, every AI-classified risk needed human re-verification. At propose, the risk classification flows into the plan body with a *light* provenance badge instead of a heavy "needs review" gate.

---

## Step 11 — A second human joins (5 min)

Alice (your reviewer on this project) gets added to the project — operator action, `/projects/tasklist/people`, role `reviewer`. From now on, story-level approvals can route to her, and her sign-offs feed the audit ledger with her user id.

Open your editor. The coach now knows there's a second persona on this project:

> **You:** ok, let's build v1.1. Add task priorities — low / medium / high — and let users filter the list by priority.

> **Coznt:** Got it. Quick check — for the priority field on existing rows, default to `medium` or leave nullable?

> **You:** default medium.

> **Coznt:** Drafting the feature plan…
>
> **Drafted: TaskList v1.1 — task priorities**
> • Add `priority` enum to `tasks` (low / medium / high), default `medium`
> • Backfill existing rows with `medium`
> • UI: priority chip on the list, filter by priority in the list view
> • API: PATCH accepts priority; list query supports `?priority=high`
>
> Risk classification (`change-risk-classifier`, propose, model claude-opus-4-7):
> • **Low risk.** Schema change is additive with a safe default. No API breakage. No auth surface touched.
>
> Want me to route this for sign-off? You're the author — Alice is a natural reviewer.

> **You:** route to Alice.

> **Coznt:** Sent. She'll see it in her bell.

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

Verification badges
  ✓ rule:no-direct-db        passed
  ✓ rule:idempotency         n/a (no write surface)
  ⚠ rule:auth-scope          fires below — see plan-touching-auth-scope
```

This is the **provenance** surface: every AI-authored section identifies its skill, its model, its autonomy level *at the moment of generation*, and links to the `skill_outcomes` row that recorded the call. If the skill gets demoted tomorrow, Alice can find every plan it touched while at propose and re-triage by row, not by guessing. The "AI made this" question stops being a vibe-check.

Alice approves. The coach moves on:

> **Coznt:** Approved by Alice. Story is ready — `TASK-3` should be your sprint card. Create it in Jira and tell me when you're starting.

You create `TASK-3`. Coznt mirrors it.

---

## Step 12 — The rule engine fires (5 min)

You start coding. A few minutes in, you realize the priority filter query touches the same code path as the auth middleware fix Alice landed last week. You revise the story plan in coznt:

> **You:** update the story — also add a check that the priority filter respects the existing user_id scope so we don't leak tasks across users.

> **Coznt:** Updating… hmm — your edit triggered a rule.
>
> **Rule:** `plan-touching-auth-scope` (`keyword-presence` validator)
> **Failed because:** plan body mentions `user_id` scope but has no security-implications section.
> **Suggested fix:** add a short "Security implications" subsection covering the scope check and the test that proves it.

The rule engine is doing exactly what it's supposed to — catching a plan that touches a sensitive surface without acknowledging the surface. You add the section:

> **You:** add this — "Security implications: list query is already scoped by user_id via the auth context. Test added in tests/tasks-scope.test.ts to assert cross-user isolation."

> **Coznt:** Rule re-validated — passes. Pushing the update. Alice needs to re-approve since the body changed.

Alice re-approves. You build it, push, merge `TASK-3`, watch it close.

> **You:** how's v1.1 looking?

> **Coznt:** Two work items closed (`TASK-3` and a quick UI tweak in `TASK-4`). `change-risk-classifier` now sits at 13 success outcomes, still propose. **Verification debt** on TaskList is 8 — that's low; you have one open approval older than 24h (a doc plan from last week) bumping it.

---

## Step 13 — Verification debt becomes visible (3 min)

Open the cockpit. The portfolio strip at the top now shows a **Verification debt** column. TaskList: 8. (You don't have a sibling project yet — Act 4 will introduce one.)

Click the score. The breakdown:

| Component | Contribution |
|---|---|
| Autonomy distance × invocations | 4 |
| Open-approval age | 2 (one approval 28h old) |
| Gate trip rate | 1 (one rule trip in 30d) |
| Unreviewed AI-authored sections | 1 |

This is the analytical surface coznt's been pushing toward since day one — every governed action is row-addressable, and the platform derives a single number from them so a leader doesn't need to read 200 audit rows to know whether the project is healthy.

> **The vision claim, made concrete.** "Verification debt: 8" is not a dashboard guess. Each of the four numbers above traces to specific rows: the gate trip is `skill_outcomes` row #4711, the open approval is `approvals` row #883, etc. If you ask "why is this 8 and not 4?", the answer is four queryable rows. See [docs/product/verification-debt-thesis.md](../product/verification-debt-thesis.md) for the formula.

You ship v1.1. Lead time: 3h 20m. No incidents.

---

# Act 3 — Stress: When trust breaks (week 4)

Week 4. v1.2 added bulk actions — select multiple tasks, change priority on all of them at once. Plan was drafted by the coach (with `change-risk-classifier` clearing it as **medium risk** — bulk operations widen blast radius), approved by Alice, built, merged, deployed.

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

> **Coznt:** Yes — error rate back to baseline within 90 seconds of the redeploy. Two outcome rows just landed:
>
> • **`pr_revert`** assessor → `skill_outcomes`, `verdict='rolled_back'`, attributed to `change-risk-classifier` (the skill that authored the medium-risk classification on `TASK-12`).
> • **`deploy_incident`** assessor → `skill_outcomes`, `verdict='incident'`, attributed to the same skill.
>
> The autonomy recompute job just ran. **`change-risk-classifier` was demoted: propose (1) → observe (0).** A row landed in `skill_autonomy_events`:
> • `reason: rollback_within_24h`
> • `priorLevel: 1`, `newLevel: 0`
> • `triggeringOutcomes: [#5012, #5013]`
>
> Effective immediately: any plan section authored by `change-risk-classifier` will be marked "needs review" until it re-earns propose. And — *this is the Milestone-D gate* — its next tool call on this project will hard-fail at the PreToolUse interceptor and route into your approvals inbox instead of executing.

> **The vision claim, made concrete.** Coznt didn't demote the skill on vibes. It demoted because deterministic assessors fired, those assessors wrote rows, the recompute job read the trailing window and re-applied the formula. The demotion is a single row with a reason. If Alice asks tomorrow "why is the risk classifier observe again?", the answer is row #2071 in `skill_autonomy_events`, with two clickable outcome rows attached.

### The gate fires (the next morning)

Next morning you open your editor and the agent reflexively reaches for `change-risk-classifier` to triage an unrelated PR you opened overnight. You don't even type anything — the editor's MCP client posts to `POST /api/v1/agents/pre-tool-use` with `{ skillSlug: "change-risk-classifier", tool: "classify", changeRisk: "medium" }`. Coznt's `handlePreToolUse` resolves the autonomy threshold (`resolveAutonomyThreshold` says medium-risk classification needs level 2; the skill is at 0), denies the call, and opens a `skill_invocation` approval. The editor returns:

```
{
  "allowed": false,
  "reason": "autonomy_gate: skill at level 0 but 2 required",
  "autonomy": { "level": 0, "levelName": "observe", "requiredLevel": 2 },
  "approvalId": "appr_4f1a..."
}
```

Open your coznt tab. The bell shows 1. Click it — it's an **agent-initiated approval** in the H3 inbox:

> **`change-risk-classifier` wants to classify PR #156 (medium risk).** Currently at observe (0); medium-risk classification needs merge (2). [Let it run once] [Hold and review the PR myself]

This is what M-D *feels like* in the daily loop. The gate isn't a wall — it's a router. You can release the single call, the skill runs, and the outcome row is attributed normally. The skill doesn't earn back autonomy from your one-time releases (only `pr_merge` / `deploy_clean` assessors do that), but the gate keeps you in the loop until evidence accumulates again.

> **The Govern pillar, made concrete.** The autonomy threshold check is the M-D contract. It runs *before* the LLM call, on every tool the agent reaches for. The IDE pays for tokens; coznt decides whether tokens get spent.

---

## Step 15 — The postmortem (10 min)

> **You:** let's do a postmortem.

> **Coznt:** Drafting `incident-019-postmortem` as a `risk_register` plan — that's the postmortem slot in coznt's schema…
>
> **Drafted: Incident 019 — bulk-priority cross-user write**
> • **Timeline:** deploy 21:24, first 500 21:38, page 21:47, revert merged 22:03, error rate normal 22:05.
> • **Root cause:** `TASK-12` bulk-update query missing `WHERE user_id = $auth_user_id`.
> • **Why the risk classifier missed it:** the diff was small (one new function), and the file diff didn't include the auth context import. The classifier flagged it as medium for "indexed column write" but missed the scope risk.
> • **Why review missed it:** Alice reviewed the plan body, not the code diff. Plan body said "bulk update with auth scope respected" — but the implementation diverged.
> • **Corrective actions:**
>   1. Add a `rule-engine` policy: any plan referencing `bulk write` requires a code-diff link before approval.
>   2. Add an integration test: `tests/auth-scope.test.ts` — assert every write query is scoped.
>   3. `change-risk-classifier` stays at observe until 10 clean outcomes accumulate. Manual review of every classification in the meantime.
>
> Route to Alice for sign-off?

> **You:** yes.

Alice approves. The corrective actions become real:

- **Action 1** — the new rule lands in the rule engine. From now on, any plan with "bulk write" in the body fails validation without a `code_diff_url` field.
- **Action 2** — you add the integration test, push it as `hotfix/auth-scope-tests`, merge it. Clean PR → `pr_merge` outcome → `change-risk-classifier` gets its first re-earning success row.
- **Action 3** — the `change-risk-classifier` skill detail page now shows a "demotion record" — a permanent link from the level-0 segment back to incident 019. Trust is restoring, but the receipt of its breach stays in the ledger.

The portfolio's verification debt for TaskList jumped from 8 to **31** the moment the demotion landed — autonomy distance now contributes more, and the open postmortem ADR adds an open-approval point until it's signed.

---

## Step 16 — Watching trust come back (5 min)

Over the next week, you and Alice ship five more small PRs. Each one is a clean `pr_merge` outcome for `change-risk-classifier`. The skill detail page shows the level-0 segment lengthening with success markers.

> **You:** how close to re-promotion?

> **Coznt:** `change-risk-classifier` has 6 clean outcomes since the demotion. The autonomy formula needs 10 in a 30-day window, no `rolled_back` or `incident` rows, distinct work items. You're 4 away. At your current cadence (~5 PRs/week), that's about a week.

Verification debt has come back down to 18 as the postmortem ADR got signed and one of the older open approvals cleared.

---

# Act 4 — Steady state: The platform view

Week 6. You've been running TaskList in prod for two weeks since the incident. The skill re-promoted three days ago. Your team also stood up a sibling project — `BillingSvc`, a small invoicing service — and bound it to coznt last week. Now you want to see what the platform looks like *across* projects.

## Step 17 — `/me` — your personal ledger (3 min)

Visit `/me`. This is not a todo list. It's the audit ledger filtered to *your* user row.

```
Hi, you.

Open approvals waiting on you ............ 2
   • adr-007 (BillingSvc) — 6h old
   • release_plan v1.3 (TaskList) — 18m old

Approvals you're blocking by not reviewing  1
   • feature plan (BillingSvc) — assigned to you 28h ago

Per-project autonomy contributions
   TaskList    — 14 reviews, 3 author actions
   BillingSvc  — 3 reviews

Recent outcomes attributable to your work (last 14d)
   • 6 pr_merge (clean)
   • 1 pr_revert (incident 019 — see postmortem)
   • 4 work_items closed
```

The "approvals you're blocking" line is the polite version of a nudge — every governed item that names you and hasn't moved adds to the team's verification debt, and the platform tells you which row it is and how long it's been there.

---

## Step 18 — Portfolio: TaskList vs BillingSvc (5 min)

Open `/portfolio`. Two project rows:

| Project | Phase | Open approvals | Skill autonomy | Verification debt | Trust trend (30d) |
|---|---|---|---|---|---|
| TaskList | monitoring | 1 | 4 propose, 2 observe | **18** | ↘ (recovering) |
| BillingSvc | development | 7 | 0 propose, 6 observe | **47** | ↗ (accumulating) |

`BillingSvc` is heavier. Click the **47** to see why:

| Component | Contribution |
|---|---|
| Autonomy distance × invocations | 22 (six skills at observe, all actively invoked) |
| Open-approval age | 14 (three approvals older than 48h) |
| Gate trip rate | 4 (three rule trips in 30d) |
| Unreviewed AI-authored sections | 7 (four plans with AI sections pending reviewer attention) |

This is the *raison d'être* of the analytical layer: a leader can sweep across 5, 50, or 500 projects and see verification debt as a single number, then drill from the number to the rows that built it. No project is a black box, and no number is mysterious.

> **The vision claim, made concrete.** "BillingSvc has more debt than TaskList" is not a feeling. It's 22+14+4+7=47, sourced from 47 rows you can open. The platform's job is to *make this addressable* — verification debt isn't a metric for a board deck, it's a queue of clickable things.

---

## Step 19 — The audit log as unified ledger (5 min)

Open `/audit`. Filter by **last 24 hours**. The stream:

```
2026-05-31 09:14:02  approval.granted    Alice → release_plan v1.3            TaskList
2026-05-31 09:13:21  webhook.github      pr_merge #142 (clean)                TaskList
2026-05-31 09:13:20  webhook.jira        TASK-31 transitioned to Done         TaskList
2026-05-31 09:12:18  skill.invocation    change-risk-classifier (propose)      TaskList
2026-05-31 09:10:55  plan.created        story TASK-31                        TaskList
2026-05-31 09:09:30  agent.session_start coach: dev — bulk filter fix         TaskList
2026-05-31 08:47:14  webhook.jira        TASK-30 → In Progress                TaskList
2026-05-31 08:32:01  approval.granted    you → feature plan                   BillingSvc
... 47 more rows ...
```

Every row has a `row_hash`. Every row links to its underlying entity (plan, work item, skill outcome, approval). Filter by user, by project, by skill, by phase. This single stream is *the* coznt source-of-record — every other surface in the product is a view over it.

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

1. **GitHub + Jira + coznt events live in the same stream.** PR merges, Jira transitions, and human approvals interleave by timestamp. This is the unification thesis: SDLC happens across tools, but the audit substrate is one ledger.
2. **The dialog from Act 1 is in here.** Scroll back to two weeks ago. Every "You: I want to build…" → "Coznt: drafting…" exchange is a row pair. The human conversation became the audit trail without anyone framing it as one.

---

## Step 20 — A glimpse of what comes next (2 min)

Click `change-risk-classifier` from the cockpit. Scroll to the bottom:

> **Next promotion (propose → merge):** needs 25 clean outcomes in 30d, no `rolled_back` or `incident`, distinct work items ≥ 8. Current: 14/25.

> **Senior unlocks:** `change-risk-classifier` can author "low" risk classifications without provenance badge gating reviewer attention.

> **Lead (3) unlocks the M-D autonomy gate at full effect:** the PreToolUse interceptor (`POST /api/v1/agents/pre-tool-use`) auto-allows the skill's tool calls without a `skill_invocation` approval, *for the action/risk combinations its level covers*. The dispatch gate is **already live today** — the difference at lead is that more action × risk combinations pass without routing, per `resolveAutonomyThreshold`. The default thresholds: `deploy_production` never auto (∞), `merge_pr` low/medium ≥ level 2, high ≥ level 3, critical never auto.

This is coznt's roadmap surfaced *in the product itself*: a skill that earns trust through evidence eventually unlocks autonomous action, gated by the same ledger that produced the trust. The vision is not "AI agents do work" — it's "AI agents do work in proportion to the evidence they've banked, observable to humans every step of the way."

---

# What you just saw

Across four acts, you walked through one project's lifecycle from blank repo to "the platform knows it." The throughline:

| Pillar | Where you saw it |
|---|---|
| **Govern (M-D autonomy gate)** | The PreToolUse interceptor blocked the demoted `change-risk-classifier` before any LLM tokens were spent, opened a `skill_invocation` approval, and let you release the call once with full audit. The gate fires on every tool call. |
| **Govern (rule engine)** | Act 2's `plan-touching-auth-scope` keyword-presence rule caught a plan touching a sensitive surface without naming it. Act 3's postmortem added a new `action-policy` rule to the engine. |
| **Govern (phase gates)** | Every phase advance was gated on its checklist. You never overrode a gate. |
| **Verify (deterministic ledger)** | `pr_merge`, `pr_revert`, `deploy_clean`, `deploy_incident` assessors wrote every `skill_outcomes` row. Promotion and demotion both flowed from those rows via `recomputeSkillAutonomy`. |
| **Verify (prompt-quality rubric)** | The capture hook scored every prompt against the 6-dim rubric before it reached the model; sub-threshold prompts were gated locally, scored ones fed `prompt_logs` as a leading indicator. |
| **Trust (audit log + hash chain)** | Step 19 — clicking *Verify chain* recomputed `row_hash = sha256(prev_hash ‖ canonical_fields)` for the visible window, confirmed the head, and let you emit a receipt for any row. The audit log is the unified source-of-record. |
| **Trust (verification debt)** | One number per project, four components, every component a clickable queue of rows. Watched it climb on demotion and recover on re-earning. |
| **Trust (provenance)** | The Summary panel showed which sections were AI-authored, which skill produced each, the model + autonomy at generation, and a link to the originating `skill_outcomes` row. Triage AI-authored content from a row, not a vibe. |
| **AI-DLC Governed (the tagline)** | Schema stayed vendor-neutral (plan kinds `epic / feature / story / spec / adr / test_plan / release_plan / incident / storyboard / dev_summary / go_live_report / cicd_pipeline / risk_register`). AI-DLC's Inception/Construction/Operations grouping renders as a methodology overlay; nothing AWS-specific lives in the schema. |
| **Two sources of truth** | Drizzle schemas owned the DB shape; Zod schemas owned the AI output shape. You never saw a manual TypeScript interface. |
| **Conversational ergonomics** | You typed sentences. The coach translated to ~50 verb invocations across the four acts. The verbs are there if you want them — they aren't required. |
| **Two-tool unification** | GitHub holds code, Jira holds the board, coznt is the governance + audit layer over both. The Trust tab and the Jira board agree because the same webhook task wrote both. |

The audit log proves all of the above. Filter by your user, scroll back to the start of Act 1, and read every line of dialog as a governed action — including the prompt-quality scores, the M-D gate decisions, and the chain-verification calls. That is the product.

---

# Where to go next

- **Run the brownfield variant.** Re-do this on a project where Jira already has a backlog of tickets and the repo has months of history. Step 3 changes — the coach opens with `get_assigned_work`, reads what's assigned to you, and drafts requirements *referencing* those tickets. The conversation feels almost identical; the trust arc starts from a non-zero base because some skills already have outcome history on neighboring projects.
- **Run the tracker-less variant.** Skip the Jira prerequisite, leave the project key blank. Coznt becomes both the planning surface and the audit ledger. Good for tiny side projects, hackathons, or pre-formalization evaluation.
- **Try short-syntax quick-add.** Press <kbd>Cmd+K</kbd> and type `fix payment edge case #spec +tasklist 2h @alice` — the palette parses the sigils, shows a preview, and opens `/plans/new` prefilled. Same grammar works from the CLI: `coznt call upsert_plan --shortSyntax "fix #spec +tasklist 2h"`.
- **Drive the verb surface from a terminal.** `coznt call <verb>` dispatches any registered MCP tool from your shell. `coznt call` (no args) lists every verb. Useful for scripting, smoke testing, or driving coznt from an agent that doesn't speak MCP yet.
- **Read the verb surface.** [`docs/spec/mcp-verbs.md`](../spec/mcp-verbs.md) — 44 verbs across 5 tiers. M-B added `get_autonomy`, `get_verification_debt`, `get_provenance` as read-only foundation reads. M-C added the agent-loop governance verbs (`log_prompt`, `rate_prompt`, `flush_local_prompts`). M-D added `set_project` and `switch_project` for explicit session binding. Useful for writing your own choreographies.
- **Write your own coach.** The lifecycle coach is just a SKILL.md. Fork it for your team's conventions — e.g. "every story needs a security ADR" — and push it via `coznt sync`.
- **Read the verification debt thesis.** [docs/product/verification-debt-thesis.md](../product/verification-debt-thesis.md) — the formula, the rationale, and why "trust-establishment cost" is the analytical primitive coznt is built around.
- **Read the positioning.** [docs/positioning.md](../positioning.md) — the canonical doc: AI-DLC Governed tagline, Govern–Verify–Trust spine, daemon + choreography architecture, what coznt deliberately is *not*.

# If the coach goes off-script

The coach is a choreography, not a constraint. If it ever leaks a verb name at you, or asks three questions when it should ask one, the fix is in `src/automations/skills/project-lifecycle/SKILL.md`. File a PR. Jump to [user-guide §C2 Troubleshooting](../user-guide.md#c2-troubleshooting) for the usual webhook / binding / autonomy issues.
