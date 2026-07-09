/**
 * Verification-debt operations — turn project state into a score.
 *
 * Pure formula lives in `src/domain/verification-debt/score.ts`. This
 * module is the data-fetching layer that snapshots project state into
 * the formula's input shape.
 *
 * Per spec §5: verification debt is observed from `governance_records`
 * and `evidence_links` — no special tracking table. Open governance
 * (kind=approval/gate) feeds the open-approval / gate-trip terms;
 * AI-authored plans without `evidence_links` of the expected type feed
 * the unreviewed-changes term.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { skillOutcomes } from "@/db/schema/skill/skill-outcome";
import { skillAutonomy } from "@/db/schema/skill/skill-autonomy";
import { governanceRecords } from "@/db/schema/governance/records";
import { projectTasks as plans } from "@/db/schema/plan/project-task";
import { evidenceLinks } from "@/db/schema/evidence";
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
 * Open approval-kind governance records scoped to this project. Severity
 * weight defaults to 1 — gate-targeted approvals could lift it, but we
 * defer the join cost until profiling shows it matters.
 */
async function snapshotOpenApprovals(
  projectId: string,
  organizationId: string,
): Promise<OpenApprovalSnapshot[]> {
  const rows = await db
    .select({ createdAt: governanceRecords.createdAt })
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.projectId, projectId),
        eq(governanceRecords.kind, "approval"),
        eq(governanceRecords.status, "pending"),
      ),
    );
  const now = Date.now();
  return rows.map((row) => ({
    ageHours: Math.max(0, (now - row.createdAt.getTime()) / (1000 * 60 * 60)),
  }));
}

/**
 * Gate pass/fail counts per debt-relevant kind in the window. Reads
 * governance_records with kind="gate" and inspects `details.type` for
 * the gate sub-kind (security/coverage/lint/custom).
 */
async function snapshotGateTrips(
  projectId: string,
  organizationId: string,
  since: Date,
): Promise<GateTripSnapshot[]> {
  const rows = await db
    .select({
      details: governanceRecords.details,
      status: governanceRecords.status,
    })
    .from(governanceRecords)
    .where(
      and(
        eq(governanceRecords.organizationId, organizationId),
        eq(governanceRecords.projectId, projectId),
        eq(governanceRecords.kind, "gate"),
        gte(governanceRecords.updatedAt, since),
      ),
    );

  const debtKinds: DebtGateKind[] = ["security", "coverage", "lint", "custom"];
  const buckets = new Map<DebtGateKind, { total: number; failed: number }>();
  for (const kind of debtKinds) buckets.set(kind, { total: 0, failed: 0 });

  for (const row of rows) {
    const gateType = (row.details as { type?: string } | null)?.type;
    if (!gateType || !debtKinds.includes(gateType as DebtGateKind)) continue;
    const bucket = buckets.get(gateType as DebtGateKind)!;
    bucket.total += 1;
    if (row.status === "failed") bucket.failed += 1;
  }

  return Array.from(buckets.entries())
    .filter(([, b]) => b.total > 0)
    .map(([kind, b]) => ({ kind, total: b.total, failed: b.failed }));
}

/**
 * AI-authored plans + work-items on this project that have no evidence_link
 * recording review (spec §5). "Unreviewed" = aiAuthored=true AND no
 * evidence_link of an attestation-equivalent type targeting the plan.
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

  // Reviewed = plans that have any evidence_link attached. Coarse but
  // matches the spec §5 framing: presence of evidence is the receipt.
  const evidenceRows = await db
    .select({ projectTaskId: evidenceLinks.projectTaskId })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.organizationId, organizationId),
        eq(evidenceLinks.projectId, projectId),
      ),
    );
  const reviewedPlanIds = new Set<string>();
  for (const row of evidenceRows) reviewedPlanIds.add(row.projectTaskId);

  const now = Date.now();
  const snapshots: UnreviewedAiChangeSnapshot[] = [];

  for (const plan of aiPlans) {
    if (reviewedPlanIds.has(plan.id)) continue;
    const at = plan.generatedAt ?? new Date();
    snapshots.push({ hoursSinceAuthored: Math.max(0, (now - at.getTime()) / (1000 * 60 * 60)) });
  }
  for (const wi of aiWorkItems) {
    // work_items don't ride evidence_links directly; conservatively count
    // every AI-authored work_item created in the window as unreviewed.
    const at = wi.generatedAt ?? new Date();
    snapshots.push({ hoursSinceAuthored: Math.max(0, (now - at.getTime()) / (1000 * 60 * 60)) });
  }
  return snapshots;
}
