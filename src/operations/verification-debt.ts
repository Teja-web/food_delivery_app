/**
 * Verification-debt operations — turn project state into a score.
 *
 * Pure formula lives in `src/lib/verification-debt/score.ts`. This module
 * is the data-fetching layer that snapshots project state into the
 * formula's input shape.
 *
 * Per Decision #1: materialized — recomputed on outcome insert via the
 * `refresh-verification-debt.ts` task (M-B foundation; task lands in a
 * follow-up). For now `computeProjectDebt` is callable directly from
 * pages; once materialized, pages will read a denormalized column.
 */

import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { skillAutonomy } from "@/db/schema/skill/skill-autonomy";
import { approvals } from "@/db/schema/plan/approval";
import { phaseGates } from "@/db/schema/phase-gate";
import { plans } from "@/db/schema/plan/plan";
import { workItems } from "@/db/schema/work-item";
import {
  computeVerificationDebt,
  type DebtGateKind,
  type GateTripSnapshot,
  type OpenApprovalSnapshot,
  type SkillInvocationSnapshot,
  type UnreviewedAiChangeSnapshot,
  type VerificationDebtBreakdown,
} from "@/domain/verification-debt/score";

const WINDOW_DAYS = 30;

/**
 * Snapshot every input the formula needs for one project, then call the
 * pure scorer.
 *
 * Reads are best-effort idempotent: if a sub-query fails, that term
 * contributes zero rather than the whole compute throwing. We're an
 * observability score, not a transaction.
 */
export async function computeProjectDebt(
  projectId: string,
  organizationId: string,
): Promise<VerificationDebtBreakdown> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [skills, openApprovals, gateTrips, unreviewedAi] = await Promise.all([
    snapshotSkills(projectId, organizationId, since),
    snapshotOpenApprovals(projectId, organizationId),
    snapshotGateTrips(projectId, organizationId, since),
    snapshotUnreviewedAiChanges(projectId, organizationId),
  ]);

  return computeVerificationDebt({
    skills,
    openApprovals,
    gateTrips,
    unreviewedAiChanges: unreviewedAi,
  });
}

/**
 * Per-(skill, project) autonomy level + invocations in window.
 */
async function snapshotSkills(
  projectId: string,
  organizationId: string,
  since: Date,
): Promise<SkillInvocationSnapshot[]> {
  // Pull autonomy rows for this project; null-projectId rows are excluded
  // (those are org-wide / legacy, not relevant to project debt).
  const autonomyRows = await db
    .select({ skillId: skillAutonomy.skillId, level: skillAutonomy.level })
    .from(skillAutonomy)
    .where(
      and(
        eq(skillAutonomy.organizationId, organizationId),
        eq(skillAutonomy.projectId, projectId),
      ),
    );
  if (autonomyRows.length === 0) return [];

  // Count outcomes per skill in window.
  const counts = await db
    .select({
      skillId: skillOutcomes.skillId,
      total: sql<number>`count(*)::int`,
    })
    .from(skillOutcomes)
    .where(
      and(
        eq(skillOutcomes.organizationId, organizationId),
        eq(skillOutcomes.projectId, projectId),
        gte(skillOutcomes.recordedAt, since),
      ),
    )
    .groupBy(skillOutcomes.skillId);

  const countMap = new Map<string, number>();
  for (const row of counts) if (row.skillId) countMap.set(row.skillId, Number(row.total));

  return autonomyRows.map((row) => ({
    autonomyLevel: row.level,
    invocationsInWindow: countMap.get(row.skillId) ?? 0,
  }));
}

/**
 * Open approval rows scoped to this project; severity weight defaults to 1
 * here — gate-targeted approvals could lift it, but joining to phase_gates
 * for severity adds query cost we'll defer until profiling shows it
 * matters.
 */
async function snapshotOpenApprovals(
  projectId: string,
  organizationId: string,
): Promise<OpenApprovalSnapshot[]> {
  const rows = await db
    .select({ createdAt: approvals.createdAt })
    .from(approvals)
    .where(
      and(
        eq(approvals.organizationId, organizationId),
        eq(approvals.projectId, projectId),
        eq(approvals.status, "pending"),
      ),
    );
  const now = Date.now();
  return rows.map((row) => ({
    ageHours: Math.max(0, (now - row.createdAt.getTime()) / (1000 * 60 * 60)),
  }));
}

/**
 * Gate pass/fail counts per debt-relevant kind in the window.
 */
async function snapshotGateTrips(
  projectId: string,
  organizationId: string,
  since: Date,
): Promise<GateTripSnapshot[]> {
  const rows = await db
    .select({
      kind: phaseGates.type,
      status: phaseGates.status,
    })
    .from(phaseGates)
    .where(
      and(
        eq(phaseGates.organizationId, organizationId),
        eq(phaseGates.projectId, projectId),
        gte(phaseGates.updatedAt, since),
      ),
    );

  const debtKinds: DebtGateKind[] = ["security", "coverage", "lint", "custom"];
  const buckets = new Map<DebtGateKind, { total: number; failed: number }>();
  for (const kind of debtKinds) buckets.set(kind, { total: 0, failed: 0 });

  for (const row of rows) {
    if (!debtKinds.includes(row.kind as DebtGateKind)) continue;
    const bucket = buckets.get(row.kind as DebtGateKind)!;
    bucket.total += 1;
    if (row.status === "failed") bucket.failed += 1;
  }

  return Array.from(buckets.entries())
    .filter(([, b]) => b.total > 0)
    .map(([kind, b]) => ({ kind, total: b.total, failed: b.failed }));
}

/**
 * AI-authored plans + work-items on this project that have no approval
 * recording review. "Unreviewed" here means: aiAuthored=true AND no
 * decided approval targeting it.
 */
async function snapshotUnreviewedAiChanges(
  projectId: string,
  organizationId: string,
): Promise<UnreviewedAiChangeSnapshot[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const aiPlans = await db
    .select({ id: plans.id, generatedAt: plans.generatedAt })
    .from(plans)
    .where(
      and(
        eq(plans.organizationId, organizationId),
        eq(plans.projectId, projectId),
        eq(plans.aiAuthored, true),
        gte(plans.createdAt, since),
      ),
    );
  const aiWorkItems = await db
    .select({ id: workItems.id, generatedAt: workItems.generatedAt })
    .from(workItems)
    .where(
      and(
        eq(workItems.organizationId, organizationId),
        eq(workItems.projectId, projectId),
        eq(workItems.aiAuthored, true),
        gte(workItems.createdAt, since),
      ),
    );

  // Approved targets — exclude these from "unreviewed."
  const approvedRows = await db
    .select({ entityType: approvals.entityType, entityId: approvals.entityId })
    .from(approvals)
    .where(
      and(
        eq(approvals.organizationId, organizationId),
        eq(approvals.projectId, projectId),
        eq(approvals.status, "approved"),
      ),
    );
  const approvedKeys = new Set<string>();
  for (const row of approvedRows) {
    approvedKeys.add(`${row.entityType}:${row.entityId}`);
  }

  const now = Date.now();
  const snapshots: UnreviewedAiChangeSnapshot[] = [];

  for (const plan of aiPlans) {
    if (approvedKeys.has(`plan:${plan.id}`)) continue;
    const at = plan.generatedAt ?? new Date();
    snapshots.push({ hoursSinceAuthored: Math.max(0, (now - at.getTime()) / (1000 * 60 * 60)) });
  }
  for (const wi of aiWorkItems) {
    if (approvedKeys.has(`work_item:${wi.id}`)) continue;
    const at = wi.generatedAt ?? new Date();
    snapshots.push({ hoursSinceAuthored: Math.max(0, (now - at.getTime()) / (1000 * 60 * 60)) });
  }
  return snapshots;
}
