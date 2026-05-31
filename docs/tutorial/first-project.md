# Tutorial — Ship TaskList by talking to your editor

This tutorial walks you through building a small TODO app — **TaskList** — from a blank repo to a deployed v1, using nothing but plain English in your editor. You won't memorize any coznt verb names, plan kinds, or skill slugs. The agent does that translation for you, because coznt now ships a master choreography called **Project Lifecycle Coach** that wraps every governed action behind a natural-language conversation.

If you want to see the verbs under the hood, expand the **Under the hood** callouts at each step. They're there for the curious; they're not what an end user reads.

**Time:** ~60 minutes of active work.

**What you'll build:**
- A TaskList API (Postgres + Drizzle) with create / list / update / delete
- A minimal Next.js UI
- A CI pipeline that runs on every PR
- A v1 release deployed and graded

**What you won't do:** bind a real Jira / ADO board (greenfield) and you won't ever type a coznt verb name.

**Prerequisites:**
- Coznt running locally per [user-guide §B2](../user-guide.md#b2-first-time-install)
- An empty GitHub repo (`gh repo create acme/tasklist --public --clone`)
- Your editor connected to coznt per [user-guide §A2](../user-guide.md#a2-connect-your-editor-or-cli)

---

## Step 1 — Create the project in coznt (3 min)

This is the **only** non-chat step in the tutorial. The agent can't create projects for you — that's an operator action.

Open `<your-coznt-url>/projects/new` and fill:

| Field | Value |
|---|---|
| Name | `TaskList` |
| Slug | `tasklist` |
| Description | `Personal TODO manager — single-user v1` |
| Repo URL | `https://github.com/acme/tasklist` |
| Jira project key | _(leave blank — greenfield)_ |

Submit. You land at the cockpit, phase = **requirements**.

---

## Step 2 — Wire up your repo (2 min)

From inside your `tasklist` repo:

```bash
coznt connect       # pick "tasklist" when prompted
coznt sync          # pulls choreographies including "Project Lifecycle Coach"
```

Open `.coznt/skills/project-lifecycle/SKILL.md` if you want to read what your agent now knows. Don't edit it — `coznt sync` will overwrite local changes.

Restart your editor.

---

## Step 3 — Tell your editor what you're building (10 min)

Open your editor. Type:

> **You:** I want to build a small TODO app called TaskList. Single user, v1 should support a task with a title, status (todo / in-progress / done), and a due date. REST API, simple Next.js UI.

What the agent does, in plain English:

> **Coznt:** Got it. One quick check before I draft this — should v1 support task priorities, or keep that for v2?

> **You:** v2.

> **Coznt:** Drafting now…
>
> **Drafted: TaskList — v1 requirements**
> • Single-user TODO app with title, status (todo / in_progress / done), due date
> • REST API: create, list (filterable by status), patch (partial), delete
> • Next.js UI: list view with inline status toggle, "new task" form
> • Out of scope for v1: priorities, multi-user, auth
>
> Does that match what you wanted? Want me to send it to the tech lead for sign-off, or are you reviewing it yourself?

> **You:** I'll review it. Send it to me.

> **Coznt:** Sent. You'll see it in the top-right bell on your coznt tab.

<details>
<summary><strong>Under the hood</strong> — what just got called</summary>

The coach choreography ran this sequence without naming any of it to you:

1. `get_my_context` → confirmed phase=`requirements`, `invoke_skill` allowed.
2. `session_start` with intent `"coaching tasklist requirements"`.
3. `invoke_skill('requirements-document')` → server-side LLM call, Zod-validated output.
4. `draft_requirement` to stage the structured spec.
5. After your "yes", `push_requirements` to land it as a real plan.
6. `submit_for_approval` with you as the reviewer.
7. `session_end` with a one-line summary.

You would have had to know seven verb names, two skill slugs, and one phase enum. You typed two sentences instead.
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

The coach pulls design decisions out of you one at a time, in conversation.

> **Coznt:** We're in design now. First question — what's the storage plan?

> **You:** Postgres + Drizzle. Single `tasks` table, indexed on status and due_date.

> **Coznt:** Drafting that as a decision record…
>
> **Drafted: Storage decision**
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

> **Coznt:** Drafting the API conventions ADR… Sent. With this approved, design is done — ready for development?

> **You:** yes.

Approve in `/approvals`. Phase is now **development**.

<details>
<summary><strong>Under the hood</strong></summary>

Three `invoke_skill` calls — twice to `adr-extractor`, once to `storyboard-generator`. Three `submit_for_approval`. One `submit_phase_for_review`. You named no verbs.
</details>

---

## Step 6 — Development (30 min)

> **Coznt:** You're in development now. Which slice first — API endpoints, or the UI?

> **You:** API first.

> **Coznt:** I'll draft the story for that.
>
> **Drafted: Implement /tasks API**
> • POST, GET, PATCH, DELETE — full CRUD
> • Backed by `tasks` table per the storage ADR
> • Acceptance: each endpoint returns correct status codes per RFC 7807; PATCH is idempotent; tests cover happy + error paths
>
> Send for sign-off? Then I can draft the tests while you write the handlers.

> **You:** yes, both.

Approve in `/approvals`. The coach now writes a test scaffold:

> **Coznt:** Test scaffold is in `tests/tasks.test.ts`. Skeletons for each endpoint, with fixtures. Write the handlers, run the suite, and let me know when the PR's up — I'll watch for the merge.

You write the handlers in your editor (use the agent normally — coding help isn't governed). Commit and push:

```bash
git checkout -b feat/tasks-api
git add .
git commit -m "feat: /tasks API + drizzle schema"
git push -u origin feat/tasks-api
gh pr create --title "feat: /tasks API" --body "Closes the v1 API story"
```

Merge the PR (assume green CI). Back in your editor:

> **You:** did it land?

> **Coznt:** Yes — merged, no revert, checks green. That's your first success row on this project. You can see it in the **Trust** tab on the cockpit.

Repeat the loop once more for the UI slice. When both slices are merged:

> **You:** development done?

> **Coznt:** Almost — I'll roll up everything merged so far. *(drafts dev_summary, sends for sign-off)* Once that's approved, we're ready for testing.

<details>
<summary><strong>Under the hood</strong></summary>

`upsert_plan` for the story, `invoke_skill('test-author')` for the scaffold, `submit_for_approval`. Webhook → `process-webhook-event` → `pr_merge` assessor → `skill_outcomes` row with `verdict='success'`. Coach watches the ledger by calling `search_outcomes` periodically when you ask "did it land?". On phase wrap, `invoke_skill('dev-summary-generator')`.
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

> **Note.** On `main` today, `pnpm test` reports 11 pre-existing vitest failures unrelated to the tutorial flow (`set_project` Tier-1 verb registry, MCP config writer fixtures, chokepoint invariant). If you see exactly those failures, you haven't broken anything — those are tracked separately. Your own test file (`tests/tasks.test.ts`) should be green.

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

> **Coznt:** TaskList v1 is in production. Lead time on this project so far is about three hours; one deploy, zero incidents, zero rollbacks. I'll surface anything that drifts. If something breaks in prod, just tell me what happened and I'll start the postmortem.

That's the steady state. You're done.

---

## Step 10 — Look at what just happened (5 min)

You spoke to your editor in plain English. Behind the scenes, coznt landed:

- **~10 plans** — requirements, three ADRs, storyboard, two stories, dev_summary, test_plan, test_execution_report, cicd_pipeline, release_plan — every one authored, reviewed, approved.
- **Provenance** on every agent-authored plan — which skill produced it, which model, and the skill's autonomy level *at the moment of generation*. The plan detail's Summary panel shows the counts; reviewers triage AI-authored sections from the row, not from guessing.
- **~10 audit rows** for the approvals, plus rows for every governed agent action.
- **2 outcome rows** in the Trust tab — your PR merge and your deploy. Each one fed the `recomputeSkillAutonomy` job, and any level change is recorded in `skill_autonomy_events` so the "why was this skill promoted?" question is answerable from a single row.
- **All six phases** passed.
- **DORA dashboard** populated with one full cycle.

Open the **Audit log** in coznt and filter by your user. Every line of dialog above is in there as a governed action with a timestamp and a row hash. This is what "trust observable" means — your conversation became the audit trail without you ever thinking about audit.

Visit **`/me`** for your personal slice of the same ledger: open approvals waiting on you, approvals blocking others, per-project autonomy contributions, and recent outcomes attributable to your work. It's not a todo list — it's the audit ledger filtered to your row.

---

## What just changed vs. the verb-explicit walkthrough

The earlier draft of this tutorial had you typing prompts like *"Use coznt's `requirements-document` skill to draft…"*. That was teaching you coznt's vocabulary instead of letting the agent translate. The **Project Lifecycle Coach** choreography (`src/automations/skills/project-lifecycle/SKILL.md`) is what makes the natural path real — it reads `get_my_context` and `get_phase_checklist` each turn, routes you to the right leaf skill based on phase + checklist state, and keeps every verb name out of your face.

If you want to drive the verb surface directly (operator mode, agent debugging), see [user-guide §A7](../user-guide.md#a7-walking-the-full-loop) — same loop, every verb named.

## Where to go next

- **Bind a real tracker.** Re-run this with a Jira project bound (operator [§B5](../user-guide.md#b5-connect-github-once-per-org)). Step 3 changes — the coach calls `get_assigned_work` instead of drafting from scratch. The conversation feels almost identical.
- **Feel autonomy compound.** Run [`scripts/demo-execution-gate.ts`](../user-guide.md#a6-watching-autonomy-compound) to see promotion and demotion math without burning real PRs.
- **See your verification debt.** Open the project's portfolio row to see a derived score from autonomy distance × invocations, open-approval age, gate trip rate, and unreviewed AI-authored changes. Coznt's analytical engine for "how much trust-establishment cost has accumulated here?" — see [docs/product/verification-debt-thesis.md](../product/verification-debt-thesis.md) for the formula and rationale.
- **Try short-syntax quick-add.** Press <kbd>Cmd+K</kbd> and type `fix payment edge case #spec +tasklist 2h @alice` — the palette parses the sigils, shows a preview, and opens `/plans/new` prefilled. Same grammar works from the CLI: `coznt call upsert_plan --shortSyntax "fix #spec +tasklist 2h"`.
- **Drive the verb surface from a terminal.** `coznt call <verb>` dispatches any registered MCP tool from your shell. `coznt call` (no args) lists every verb. Useful for scripting, smoke testing, or driving coznt from an agent that doesn't speak MCP yet.
- **Read the verb surface anyway.** [`docs/spec/mcp-verbs.md`](../spec/mcp-verbs.md) — the full reference, 34+ verbs across 4 tiers (M-B added `get_autonomy`, `get_verification_debt`, `get_provenance` as read-only foundation reads). Useful for writing your own choreographies.
- **Write your own coach.** The lifecycle coach is just a SKILL.md. You can fork it for your team's conventions — e.g. "every story needs a security ADR" — and push it via `coznt sync`.

## If the coach goes off-script

The coach is a choreography, not a constraint. If it ever leaks a verb name at you, or asks three questions when it should ask one, the fix is in `src/automations/skills/project-lifecycle/SKILL.md`. File a PR. Jump to [user-guide §C2 Troubleshooting](../user-guide.md#c2-troubleshooting) for the usual webhook / binding / autonomy issues.
