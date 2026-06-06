/**
 * Milestone A — outcome lookback task.
 *
 * STUBBED after the governance schema refactor: the prior implementation
 * read `gate_evaluations` to find merged PRs whose 7d revert window had
 * elapsed and `deployments` for the 24h clean-deploy window. The
 * `gate_evaluations` table has been deleted; the autonomy gate now ships
 * via the PreToolUse interceptor and writes directly to `skill_outcomes`
 * on each invocation. There is no separate "merged PR" attestation source
 * to scan in the new schema.
 *
 * TODO (spec §5): replace with an evidence-link walk —
 *   - pr_merge: find plan_artifacts in status=completed with an
 *     evidence_link of evidenceType=work_item older than 7d that has no
 *     follow-up evidence_link of role=causes (i.e. no revert recorded).
 *   - deploy_clean: same idea, anchored on evidenceType=deployment with
 *     no incident link in the 24h window.
 * For now the task is a no-op so the worker keeps running clean.
 */

import type { TaskParams } from "@/automations/task-router";

export interface OutcomeAssessmentResult {
  prMergeCount: number;
  deployCleanCount: number;
}

/**
 * No-op pass. Returns zeros so callers don't change shape. Both arms of
 * the prior assessor (assessMergedPrs / assessCleanDeploys) need a
 * replacement evidence-link source before they can come back.
 */
export async function runOutcomeAssessment(
  _now: Date = new Date(),
): Promise<OutcomeAssessmentResult> {
  return { prMergeCount: 0, deployCleanCount: 0 };
}

/**
 * Worker-facing entrypoint. Kept registered so the cron tick still routes
 * here cleanly; logs a no-op marker so operators can confirm the cron is
 * firing without surfacing fake activity.
 */
export async function assessOutcomesTask(_params: TaskParams): Promise<void> {
  console.log(
    "[assess-outcomes] no-op after governance refactor — TODO: rewire against evidence_links",
  );
}
