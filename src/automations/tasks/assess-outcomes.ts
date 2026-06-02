/**
 * Milestone A — outcome lookback task.
 *
 * Runs the *deferred* assessors that can only fire after an observation
 * window elapses:
 *
 *   - assessPrMerged    — 7d post-merge, no revert, checks green
 *   - assessDeployClean — 24h post-deploy, no incident
 *
 * Invoked two ways, both landing here:
 *
 *   1. pg_cron tick → pgmq enqueue → worker → `rules.ts` → this task
 *      (the production path; registered in `scripts/db-setup.ts`)
 *   2. `pnpm assess-outcomes` (local dev / manual operator run) which
 *      calls `runOutcomeAssessment()` directly without the queue
 *
 * Idempotent: `(skill_id, source_kind, source_ref)` partial unique index
 * on `skill_outcomes` plus `ON CONFLICT DO NOTHING` writes mean repeated
 * runs (or both paths firing at once) cannot double-emit.
 */

import { and, desc, eq, isNotNull, lt } from "drizzle-orm";

import { db } from "@/db/client";
import { adapterBindings } from "@/db/schema/adapter-binding";
import { deployments } from "@/db/schema/deployment";
import { gateEvaluations } from "@/db/schema/gate-evaluation";
import { skills } from "@/db/schema/skill/skill";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import type { SkillOutcomeSourceKind } from "@/db/schema/skill/skill-outcome";
import {
  assessDeployClean,
  assessPrMerged,
  DEPLOY_INCIDENT_WINDOW_MS,
  PR_REVERT_WINDOW_MS,
} from "@/domain/outcomes";
import { attributeSkillFromCommitSha } from "@/lib/integrations/skill-attribution";
import {
  recomputeSkillAutonomy,
  recordAssessorOutcome,
} from "@/operations/skill/skill-autonomy";
import type { TaskParams } from "@/automations/task-router";

export interface OutcomeAssessmentResult {
  prMergeCount: number;
  deployCleanCount: number;
}

async function hasOutcome(
  skillId: string,
  sourceKind: SkillOutcomeSourceKind,
  sourceRef: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: skillOutcomes.id })
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.skillId, skillId),
        eq(skillOutcomes.sourceKind, sourceKind),
        eq(skillOutcomes.sourceRef, sourceRef),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function assessMergedPrs(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - PR_REVERT_WINDOW_MS);
  const rows = await db
    .select({
      id: gateEvaluations.id,
      organizationId: gateEvaluations.organizationId,
      projectId: gateEvaluations.projectId,
      prRef: gateEvaluations.prRef,
      skillId: gateEvaluations.skillId,
      evaluatedAt: gateEvaluations.evaluatedAt,
      verdict: gateEvaluations.verdict,
    })
    .from(gateEvaluations)
    .where(
      and(
        eq(gateEvaluations.verdict, "success"),
        isNotNull(gateEvaluations.skillId),
        lt(gateEvaluations.evaluatedAt, cutoff),
      ),
    )
    .orderBy(desc(gateEvaluations.evaluatedAt))
    .limit(1000);

  const latest = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.projectId}#${r.prRef}`;
    if (!latest.has(key)) latest.set(key, r);
  }

  let wrote = 0;
  for (const r of latest.values()) {
    if (!r.skillId) continue;

    const [later] = await db
      .select({ id: gateEvaluations.id })
      .from(gateEvaluations)
      .where(
        and(
          eq(gateEvaluations.projectId, r.projectId),
          eq(gateEvaluations.prRef, r.prRef),
          eq(gateEvaluations.verdict, "failure"),
        ),
      )
      .limit(1);
    if (later) continue;

    if (await hasOutcome(r.skillId, "pr_revert", r.prRef)) continue;
    if (await hasOutcome(r.skillId, "pr_merge", r.prRef)) continue;

    const result = assessPrMerged(
      {
        merged: true,
        mergedAt: r.evaluatedAt,
        closed: true,
        closedAt: r.evaluatedAt,
        createdAt: r.evaluatedAt,
      },
      { reverted: false, requiredChecksGreen: true },
      { now },
    );
    if (result.verdict !== "success") continue;

    await recordAssessorOutcome({
      skillId: r.skillId,
      projectId: r.projectId,
      sourceKind: "pr_merge",
      sourceRef: r.prRef,
      result,
    });
    await recomputeSkillAutonomy(r.skillId, r.projectId).catch((err) =>
      console.error("[assess-outcomes] recomputeSkillAutonomy failed:", err),
    );
    wrote += 1;
  }
  return wrote;
}

async function ownerRepoForProject(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ externalKey: adapterBindings.externalKey })
    .from(adapterBindings)
    .where(
      and(
        eq(adapterBindings.projectId, projectId),
        eq(adapterBindings.provider, "github"),
      ),
    )
    .limit(1);
  if (!row?.externalKey) return null;
  return row.externalKey.replace(/^[^/]+\//, "") || null;
}

async function assessCleanDeploys(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - DEPLOY_INCIDENT_WINDOW_MS);
  const rows = await db
    .select({
      id: deployments.id,
      organizationId: deployments.organizationId,
      projectId: deployments.projectId,
      environment: deployments.environment,
      commitSha: deployments.commitSha,
      completedAt: deployments.completedAt,
      rolledBackAt: deployments.rolledBackAt,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.status, "success"),
        isNotNull(deployments.completedAt),
        lt(deployments.completedAt, cutoff),
      ),
    )
    .orderBy(desc(deployments.completedAt))
    .limit(1000);

  let wrote = 0;
  for (const d of rows) {
    if (!d.commitSha || !d.completedAt) continue;
    const ownerRepo = await ownerRepoForProject(d.projectId);
    const installationId = process.env.COZNT_TEST_INSTALLATION_ID ?? null;
    if (!ownerRepo || !installationId) continue;

    const slug = await attributeSkillFromCommitSha(d.commitSha, ownerRepo, installationId);
    if (!slug) continue;
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.organizationId, d.organizationId), eq(skills.slug, slug)),
    });
    if (!skill) continue;

    if (await hasOutcome(skill.id, "deploy_incident", `deployment:${d.id}`)) continue;
    if (await hasOutcome(skill.id, "deploy_clean", `deployment:${d.id}`)) continue;

    const result = assessDeployClean(
      {
        status: "success",
        environment: d.environment,
        completedAt: d.completedAt,
        rolledBackAt: d.rolledBackAt,
      },
      { firstIncidentAt: null },
      { now },
    );
    if (result.verdict !== "success") continue;

    await recordAssessorOutcome({
      skillId: skill.id,
      projectId: d.projectId,
      sourceKind: "deploy_clean",
      sourceRef: `deployment:${d.id}`,
      result,
    });
    await recomputeSkillAutonomy(skill.id, d.projectId).catch((err) =>
      console.error("[assess-outcomes] recomputeSkillAutonomy failed:", err),
    );
    wrote += 1;
  }
  return wrote;
}

/**
 * Run one assessment pass. Safe to invoke from both the worker (cron tick
 * via pgmq) and ad-hoc scripts — idempotent via the source_ref unique index.
 */
export async function runOutcomeAssessment(
  now: Date = new Date(),
): Promise<OutcomeAssessmentResult> {
  const prMergeCount = await assessMergedPrs(now);
  const deployCleanCount = await assessCleanDeploys(now);
  return { prMergeCount, deployCleanCount };
}

/**
 * Worker-facing entrypoint. The pg_cron tick enqueues a synthetic
 * `cron_tick:assess-outcomes` event; `src/lib/rules.ts` routes it here.
 */
export async function assessOutcomesTask(_params: TaskParams): Promise<void> {
  const result = await runOutcomeAssessment();
  console.log(
    `[assess-outcomes] pass complete: ${result.prMergeCount} pr_merge, ${result.deployCleanCount} deploy_clean`,
  );
}
