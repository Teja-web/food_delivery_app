/**
 * Local-dev / manual runner for the Milestone-A outcome lookback.
 *
 * In production this fires hourly via pg_cron (registered in
 * `scripts/db-setup.ts` setupCronJobs()) — the SQL body enqueues a
 * cron_tick event onto pgmq; the worker drains it via `src/lib/rules.ts`
 * and routes to `assessOutcomesTask` in `src/automations/tasks/assess-outcomes.ts`.
 *
 * This script is for:
 *   - local dev (`pnpm assess-outcomes`) without standing up pg_cron
 *   - operator-side manual re-runs from a deploy shell
 *   - CI smoke checks
 *
 * Calls the same `runOutcomeAssessment()` function the worker calls,
 * so both paths share an implementation. Idempotent — `(skill_id,
 * source_kind, source_ref)` partial unique index prevents double-writes
 * even if pg_cron and this script run simultaneously.
 */

import "dotenv/config";

import { runOutcomeAssessment } from "../src/automations/tasks/assess-outcomes";
import { createLogger } from "../src/lib/logger";

const log = createLogger("assess-outcomes");

async function main(): Promise<void> {
  const { buildScopedContext, runWithContext } = await import(
    "../src/lib/auth/context"
  );
  const ctx = buildScopedContext("__cron__", {
    id: "cron:assess-outcomes",
    name: "assess-outcomes (manual run)",
  });
  await runWithContext(ctx, async () => {
    const result = await runOutcomeAssessment();
    log.info(
      `pass complete: ${result.prMergeCount} pr_merge, ${result.deployCleanCount} deploy_clean`,
    );
  });
}

main().then(
  () => process.exit(0),
  (err) => {
    log.error("fatal", { err: String(err) });
    process.exit(1);
  },
);
