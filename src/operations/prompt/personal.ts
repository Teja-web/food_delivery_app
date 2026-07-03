/**
 * Personal dashboard operations — the `/me` route's data layer.
 *
 * Strictly a personal *slice of the audit ledger* — no personal todos,
 * no time tracking, no goals. Drift into those is SP-territory and
 * violates overlay positioning (see `developer-velocity.md`).
 *
 * All queries org-scope through the action context; the caller (action
 * layer) is responsible for passing the authenticated user's id/email.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  governanceRecords,
  type GovernanceRecord,
} from "@/db/schema/governance/records";
import { skillOutcomes, type SkillOutcome } from "@/db/schema/skill/skill-outcome";
import { projectTasks as plans } from "@/db/schema/plan/project-task";
import { projects } from "@/db/schema/project";
import {
  getSkillAutonomyAcrossProjects,
  getProjectAutonomyAggregate,
} from "@/operations/skill/skill-autonomy";

/**
 * Pending approval-kind governance records the user is waiting on someone
 * else to decide — i.e. the user requested approval (details.requestedById)
 * and the record is still pending.
 */
export async function listMyOpenApprovals(
  organizationId: string,
  userId: string,
): Promise<GovernanceRecord[]> {
  return db
    .select()
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.kind, "approval"),
        eq(governanceRecords.status, "pending"),
        sql`${governanceRecords.details}->>'requestedById' = ${userId}`,
      ),
    )
    .orderBy(desc(governanceRecords.createdAt));
}

/**
 * Pending approval-kind governance records where the user is an assigned
 * approver. Approvers live in `details.approverIds` (jsonb array). "Blocking
 * me" = the user's lack of decision is what's keeping these from advancing.
 */
export async function listApprovalsBlockingMe(
  organizationId: string,
  userId: string,
): Promise<GovernanceRecord[]> {
  return db
    .select()
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.kind, "approval"),
        eq(governanceRecords.status, "pending"),
        // jsonb array containment: details->'approverIds' @> '["<userId>"]'
        sql`${governanceRecords.details}->'approverIds' @> ${JSON.stringify([userId])}::jsonb`,
      ),
    )
    .orderBy(desc(governanceRecords.createdAt));
}

/**
 * Per-project autonomy aggregate for every project the user can see in
 * this org. The caller passes the project list so this function stays
 * unaware of project-visibility rules (those live in the project ops).
 */
export async function getProjectsAutonomyAggregate(
  organizationId: string,
  projectIds: string[],
): Promise<
  Array<{
    projectId: string;
    observe: number;
    propose: number;
    merge: number;
    lead: number;
    total: number;
    incidentsLast7d: number;
  }>
> {
  if (projectIds.length === 0) return [];
  const out: Array<{
    projectId: string;
    observe: number;
    propose: number;
    merge: number;
    lead: number;
    total: number;
    incidentsLast7d: number;
  }> = [];
  for (const projectId of projectIds) {
    const agg = await getProjectAutonomyAggregate(projectId, organizationId);
    out.push({ projectId, ...agg });
  }
  return out;
}

/**
 * Recent skill outcomes attributable to the user. Attribution is via
 * AI-authored plans/work_items the user has touched (createdBy/updatedBy);
 * the outcome ledger doesn't carry per-user attribution directly.
 *
 * v1: returns recent verdicted outcomes for skills that produced plans
 * the user created. Coarse but useful — refine as attribution improves.
 */
export async function getMyRecentOutcomes(
  organizationId: string,
  userId: string,
  windowDays = 30,
): Promise<SkillOutcome[]> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  // Skills the user has authored plans through (provenance.generatedBySkillId).
  const skillRows = await db
    .selectDistinct({ skillId: plans.generatedBySkillId })
    .from(plans)
    .where(
      and(
        eq(plans.organizationId, organizationId),
        eq(plans.createdById, userId),
        eq(plans.aiAuthored, true),
      ),
    );
  const skillIds = skillRows.map((r) => r.skillId).filter((id): id is string => id !== null);
  if (skillIds.length === 0) return [];

  return db
    .select()
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.organizationId, organizationId),
        gte(skillOutcomes.recordedAt, since),
        // Manual `inArray` to avoid the drizzle import sprawl.
        sql`${skillOutcomes.skillId} = ANY(${skillIds})`,
      ),
    )
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(100);
}

/**
 * Composite payload for the `/me` route. Pulls everything in parallel.
 */
export async function getMeDashboard(organizationId: string, userId: string) {
  const visibleProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.organizationId, organizationId));

  const [waitingOnMe, blockingMe, projectAggregates, recentOutcomes] = await Promise.all([
    listMyOpenApprovals(organizationId, userId),
    listApprovalsBlockingMe(organizationId, userId),
    getProjectsAutonomyAggregate(
      organizationId,
      visibleProjects.map((p) => p.id),
    ),
    getMyRecentOutcomes(organizationId, userId),
  ]);

  return {
    waitingOnMe,
    blockingMe,
    projectAggregates: projectAggregates.map((agg) => ({
      ...agg,
      projectName: visibleProjects.find((p) => p.id === agg.projectId)?.name ?? agg.projectId,
    })),
    recentOutcomes,
  };
}
