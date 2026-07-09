/**
 * recomputeSkillAutonomy — fired by skill_outcomes.insert.
 *
 * The worker passes the new row's id as `params.entityId`. We look up the
 * outcome row to discover its (skillId, projectId) pair, then defer to
 * `recomputeSkillAutonomy()` in operations to apply the promotion/demotion
 * rules per-pair. The extra lookup is cheap (a single indexed PK fetch) and
 * keeps the rule registry uniform: every task receives `entityId` of the row
 * that triggered it.
 *
 * If `params.data.skillId` is already present (e.g. when called from a cron
 * job or a synchronous backfill), we skip the lookup. `projectId` may be
 * null — that's the legacy / org-wide branch.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { recomputeSkillAutonomy as recompute } from "@/operations/skill/skill-autonomy";
import type { TaskParams } from "@/automations/task-router";

export async function recomputeSkillAutonomyTask(params: TaskParams): Promise<void> {
  const data = params.data as { skillId?: string; projectId?: string | null } | undefined;
  let skillId = data?.skillId;
  let projectId: string | null | undefined = data?.projectId;

  if (!skillId || projectId === undefined) {
    const outcome = await db.query.skillOutcomes.findFirst({
      where: eq(skillOutcomes.id, params.entityId),
      columns: { skillId: true, projectId: true, sourceKind: true },
    });
    if (!outcome) return; // outcome row may have been deleted; nothing to do
    // `prompt_quality_signal` rows have skillId=null — they fan out per
    // skill on the project rather than recomputing a single pair.
    if (outcome.sourceKind === "prompt_quality_signal") {
      if (!outcome.projectId) return;
      const { skills } = await import("@/db/schema/skill/skill");
      const { and: andOp, eq: eqOp, or: orOp, isNull } = await import("drizzle-orm");
      const affected = await db
        .select({ id: skills.id })
        .from(skills)
        .where(
          andOp(
            eqOp(skills.enabled, true),
            orOp(eqOp(skills.projectId, outcome.projectId), isNull(skills.projectId)),
          ),
        );
      for (const s of affected) await recompute(s.id, outcome.projectId);
      return;
    }
    if (!outcome.skillId) return;
    skillId = outcome.skillId;
    projectId = outcome.projectId;
  }

  await recompute(skillId, projectId ?? null);
}
