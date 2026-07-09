/**
 * The `coznt walkthrough` prompt — pasted into a coding agent (Claude Code,
 * Cursor) to bootstrap `.agents/skills/`, `.agents/rules/`, and `.agents/plans/`
 * authoring for a project, tailored to that project's actual past failures.
 *
 * Spec: docs/spec/dev-authoring-surface.md §15.
 *
 * The angle vs. Continue: coznt scans the codebase **and** the team's real
 * incidents, rollbacks, and recurring PR review comments — then proposes
 * skills and rules that would have caught them.
 *
 * Served two ways:
 *   - `coznt walkthrough` (CLI) — prints the prompt to stdout for paste.
 *   - GET /walkthrough (web)    — returns the prompt as text/markdown so a
 *                                  coding agent can fetch it directly.
 */

export const walkthroughPrompt = `# Coznt walkthrough — generate authored skills, rules, and plans for *this* repo

You are bootstrapping coznt for the current project. Your job is to read what
already broke here, then propose 1–3 skills, 1–3 rules, and a few ADR/spec
stubs that would have caught those failures. Coznt is connected via MCP.

Execute these eight steps in order. Stop and surface the result of each step
to me before moving on — I want to see what you found.

## Step 1 — Confirm coznt is connected

Call \`coznt call get_my_context\`. You should get back a project + autonomy
summary. If you get an error or no project, stop and tell me — the repo
isn't connected and I need to run \`coznt connect\` first.

## Step 2 — Read this project's verification debt

Call \`coznt call get_verification_debt\`. The response lists:
  - plans in status \`completed\` with no expected \`evidence_links\` row
  - approvals aging past their SLA
  - gates tripping repeatedly
  - autonomy distance per skill

These are the recurring failure surfaces. Summarize the top 3–5 debt sources
for me.

## Step 3 — Read 30 days of real outcomes

Call \`coznt call get_outcomes --window=30d\`. The response is the autonomy
ledger: \`success\`, \`rolled_back\`, \`incident\` rows with sourceKind
(\`invocation\`, \`pr_merge\`, \`pr_revert\`, \`pr_abandon\`,
\`deploy_clean\`, \`deploy_incident\`).

Identify every \`incident\` and \`rolled_back\` row. For each, note the skill
slug, the entity it touched, and the time. These are the real failures.

## Step 4 — Map each incident to a code surface

For each incident from step 3, use \`git log\`, \`git blame\`, and the repo's
recent diff history to find the change that caused it. Note the file(s),
the directory pattern (e.g. \`drizzle/**/*.sql\`, \`src/payments/**\`), and
the failure mode (DROP COLUMN, missing rollback, missing test, etc.).

## Step 5 — Propose 1–3 skills that would have caught those incidents

For each high-signal incident pattern, draft an \`.agents/skills/*.md\` file
per docs/spec/dev-authoring-surface.md §6. The frontmatter sets
\`triggers\` so it dispatches on the relevant signal — usually
\`webhook: pr_opened\` with \`pathGlobs\` matching the affected directory.

Set \`requiredLevel: 0\` for the first run — the skill observes and reports
for 30 days before earning higher autonomy via outcome evidence.

Call \`coznt call propose_artifact\` with the array of proposed files. The
verb opens a PR with the files; coznt's PR-merge webhook re-imports them
into the DB on merge.

## Step 6 — Propose 1–3 rules that codify recurring review comments

Run \`gh pr list --state=merged --limit=30 --json number,reviews\` (or
\`gh api repos/<owner>/<repo>/pulls/comments?per_page=100\`) to read past PR
review comments. Look for *repeated* asks — phrases like "needs rollback",
"add a test", "this is too big to land in one PR".

For each pattern, draft an \`.agents/rules/*.md\` file using the
\`keyword-presence\` validator for doc-shape gates (e.g. "every spec must
contain Rollback and Acceptance criteria") or \`action-policy\` for path /
action gates (e.g. "no Write to migrations/** below autonomy level 3").
See dev-authoring-surface.md §8.

Call \`coznt call propose_artifact\` to file them.

## Step 7 — Propose ADR/spec stubs for implicit decisions

Scan the codebase for decisions that show up in code but aren't documented:
  - the queue library chosen (pgmq vs. SQS vs. BullMQ)
  - the auth model (JWT vs. session)
  - the migration strategy
  - any "we don't do X here" patterns visible in the code

Draft 1–3 \`.agents/plans/adrs/*.md\` files (kind: \`adr\`) using the
frontmatter in dev-authoring-surface.md §7.3. Reference the code paths that
implement the decision. Open them as stubs — humans will fill in the
\`details.context\` and \`details.consequences\` in PR review.

Call \`coznt call propose_artifact\` to file them.

## Step 8 — Validate locally

Run \`coznt check\` to dry-run every proposed skill against the last week's
diffs and confirm none of them is excessively noisy (>30% trip rate is a
red flag — tighten the trigger or raise the keyword bar).

Run \`coznt check --rules\` to verify the proposed rules evaluate cleanly
against current state.

Report the final list back to me with PR links and a one-line rationale
per file. I'll review each PR before merge — coznt only writes to the
.agents/ files on PR merge, so the proposed files are a review surface,
not a live config change.

---

A note on style: coznt's value is its **outcome ledger**. Continue and
Cursor scan codebases. You're scanning the codebase **plus** the actual
failures. Lean into incident-driven proposals — every skill and rule
should trace to a real \`incident\` or \`rolled_back\` row from step 3, or
to a recurring review comment from step 6. Don't propose generic best
practices the team didn't ask for.
`;

export const walkthroughVersion = "1";
