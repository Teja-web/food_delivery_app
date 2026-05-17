# Install

*Purpose: take coznt from seeded data to a real repo. Run once per environment.*

What an operator does once, per environment, to take coznt's loop from "running on seeded data" to "running on a real repo." The companion to [`./github-app.md`](./github-app.md) (App registration).

This doc assumes the codebase is already deployed (`pnpm dev` works, the DB is migrated, the worker is running). Everything below is configuration and operations.

---

## Prerequisites

- A coznt deployment with the worker process running (`pnpm tsx scripts/worker.ts` or your orchestrator's equivalent)
- Postgres reachable, schema current — run `pnpm db:migrate` if you've just pulled new migrations (Milestone A adds `0000_uneven_boomer.sql` for `skill_outcomes.source_kind` + `source_ref` + the partial unique index)
- A GitHub org you control (you'll register the App against it)
- A target repo on that org — the bound staging repo the loop will run against

---

## 1. Register the GitHub App

Follow [`./github-app.md`](./github-app.md). By the end you should have:

- `COZNT_GITHUB_APP_ID=…` in `.env`
- `COZNT_GITHUB_APP_PRIVATE_KEY=…` in `.env`
- `COZNT_GITHUB_WEBHOOK_SECRET=…` in `.env` (this one is new for Milestone A — the route now verifies HMAC signatures)
- The App installed on the target repo

Restart the worker after writing `.env` so it picks up the new variables.

## 2. Verify HMAC verification is live

```bash
# Deliver a tampered payload — should be rejected.
curl -sS -X POST http://localhost:3029/api/v1/webhooks/github \
  -H 'X-GitHub-Event: ping' \
  -H 'X-Hub-Signature-256: sha256=deadbeef' \
  -H 'Content-Type: application/json' \
  -d '{"zen":"hello"}'
# Expect: {"error":"Invalid webhook signature","reason":"mismatch"}
```

If you get a 200, the HMAC path isn't reaching the route. Double-check `COZNT_GITHUB_WEBHOOK_SECRET` is in the *worker's* environment, not just the web shell.

A legitimate ping from GitHub (Settings → App → Recent Deliveries → "Redeliver") should return 200 with `{"status":"no-binding"}` until you complete step 3.

## 3. Bind the repo to a coznt project

In the coznt web UI:

1. Open `/integrations`
2. Click **+ New binding**, pick the GitHub adapter
3. `externalKey`: `github.com/<owner>/<repo>` (exactly — case-sensitive)
4. `projectId`: the coznt project to attribute outcomes to
5. Save

You should immediately see future webhook deliveries get a `project_id` resolved in the `webhook_events` table.

## 4. Smoke test against the seeded workspace

```bash
pnpm db:seed              # if you haven't already
pnpm smoke:milestone-a
```

The script (in `scripts/smoke-milestone-a.ts`) walks through:

1. Initial execution-gate evaluation
2. Synthetic revert PR → `assessPrReverted` → `skill_outcomes.pr_revert` row
3. Idempotency check (duplicate insert returns null)
4. `recomputeSkillAutonomy` reflects the new outcome
5. Deferred `assessPrMerged` → `skill_outcomes.pr_merge` row
6. Re-evaluated gate uses the new autonomy

A clean run prints six `✓` lines and exits 0. Any failure exits 1 with a labelled error.

## 5. Live test on the bound repo

1. On the bound repo, open a branch and add a commit with the trailer:

   ```
   git commit -m "test: smoke flow

   Made-by: frontend-test-author"
   ```

2. Open a PR. Within ~10 seconds you should see:
   - A check named **coznt / autonomy gate** appear on the PR
   - A new row in `gate_evaluations` (visible at `/audit`)

3. Merge the PR. After 7 days the next `pnpm assess-outcomes` run will write the `pr_merge` success row (or run it manually any time after the window elapses).

4. To simulate the reverted path immediately: open a revert PR (`Revert "test: smoke flow"` with a body containing `This reverts commit <sha>`) and merge it. Within ~10 seconds a `pr_revert` outcome should land on the *original* skill (not the revert author).

## 6. Lookback cron — automatic via pg_cron

You don't register a system crontab or a platform scheduled job. `pnpm db:setup` (`scripts/db-setup.ts` → `setupCronJobs()`) registers a pg_cron job named `coznt:assess-outcomes` that fires hourly inside Postgres. The job body is a single `SELECT pgmq.send(...)` that enqueues a `cron_tick` event onto `coznt_events`; the worker drains it and routes via `src/lib/rules.ts` to `assessOutcomesTask`, which runs the deferred `assessPrMerged` + `assessDeployClean` passes.

Verify the job is registered:

```sql
-- Run against the cluster's `postgres` database (where pg_cron lives).
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname LIKE 'coznt:%';
-- Expect: coznt:assess-outcomes | 0 * * * * | t
```

If pg_cron isn't available on your Postgres image, `setupCronJobs()` logs and skips — scheduled features degrade gracefully and the data simply isn't ripened automatically. You can still run the pass on demand from a deploy shell:

```bash
pnpm assess-outcomes
```

Both paths call the same `runOutcomeAssessment()` function and are idempotent — `(skill_id, source_kind, source_ref)` partial unique index prevents double-writes even if you fire both at once.

## 7. Acceptance criteria

Tick these off in order; you're done with Milestone A when every box is checked against the bound real repo:

- [ ] A PR opened with a `Made-by:` trailer produces a `skill_outcome` row within 1 minute of merge (or revert). Verify with: `select * from coznt.skill_outcomes where source_ref like 'github:<owner>/<repo>#%' order by recorded_at desc limit 5;`
- [ ] `recomputeSkillAutonomy` picks up the new outcome on its next run. Verify: `select * from coznt.skill_autonomy where skill_id = '<skill-id>' and project_id = '<project-id>';` shows `last_reviewed_at` after the outcome time.
- [ ] A fresh PR by the same skill reflects the post-Milestone-A autonomy level in its check-run conclusion.
- [ ] `/audit?scope=skills` shows the full chain of events with deterministic hashes.

## What's intentionally NOT covered

These belong to later milestones:

- AI agents producing the signal (Milestone C — `Mode 2 begins`)
- Cross-project rollup beyond what H1 already shows (Milestone B)
- Deployment Protection Rules — secondary execution gate
- DSSE-signed audit log
- Real outcome assessors for Jira / ADO / Confluence

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Webhooks reach the route but `webhook_events.processing_error = "no project binding for ..."` | Step 3 incomplete. Open `/integrations` and create the binding. |
| `signature mismatch` even on legitimate deliveries | `COZNT_GITHUB_WEBHOOK_SECRET` doesn't match what's set in GitHub App settings. Or the worker hasn't been restarted since you wrote `.env`. |
| `pr_revert` outcome attributed to the wrong skill | The revert PR's body needs `This reverts commit <sha>` — the SHA matches against `gate_evaluations.pr_head_sha`. If the body just has `Revert "<title>"`, the fallback is title-match against `gate_evaluations.pr_title`. |
| `assess-outcomes` runs but writes no rows | Check the cutoff: `pr_merge` only fires >7 days post-merge, `deploy_clean` only >24h post-deploy. For dev, override windows via `--window-ms` (not yet wired; for now temporarily edit `PR_REVERT_WINDOW_MS` in `src/domain/outcomes.ts`). |
| Skill attribution missing on deploy outcomes | `attributeSkillFromCommitSha` needs `COZNT_TEST_INSTALLATION_ID` set in the worker env (or a per-binding installation id, once that lands). Without it the deploy is silently skipped. |
