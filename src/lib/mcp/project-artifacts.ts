/**
 * `projectArtifacts` — the rich state snapshot surfaced on
 * `get_my_context`. Lets the agent self-orient without firing N
 * follow-up queries.
 *
 * Single function, one DB-roundtrip per artifact category, run in
 * parallel. None of the sub-queries is allowed to throw — this is an
 * observability surface, not a transaction. A failed sub-query
 * contributes null/zero to the result rather than wedging context
 * assembly.
 */

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { approvals } from "@/db/schema/approval";
import { phaseGates } from "@/db/schema/phase-gate";
import { plans, PLAN_KINDS, PLAN_STATUSES, type PlanKind, type PlanStatus } from "@/db/schema/plan";
import { computeProjectDebt } from "@/operations/verification-debt";

export interface PlansArtifact {
  total: number;
  byKind: Record<PlanKind, number>;
  byStatus: Record<PlanStatus, number>;
}

export interface ApprovalsArtifact {
  pendingTotal: number;
  /** Age of the oldest open approval in hours, or null if no pending rows. */
  oldestOpenAgeHours: number | null;
}

export interface PhaseGatesArtifact {
  total: number;
  pending: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface ProjectArtifacts {
  plans: PlansArtifact;
  approvals: ApprovalsArtifact;
  phaseGates: PhaseGatesArtifact;
  /**
   * Total verification debt score. Null when computation fails.
   * Caller can drill into the four-term breakdown via the
   * `/verification-debt` MCP verb when a number alone isn't enough.
   */
  verificationDebt: number | null;
}

function zeroByKind(): Record<PlanKind, number> {
  const out = {} as Record<PlanKind, number>;
  for (const k of PLAN_KINDS) out[k] = 0;
  return out;
}

function zeroByStatus(): Record<PlanStatus, number> {
  const out = {} as Record<PlanStatus, number>;
  for (const s of PLAN_STATUSES) out[s] = 0;
  return out;
}

async function gatherPlans(
  organizationId: string,
  projectId: string,
): Promise<PlansArtifact> {
  try {
    const rows = await db
      .select({ kind: plans.kind, status: plans.status })
      .from(plans)
      .where(
        and(
          eq(plans.organizationId, organizationId),
          eq(plans.projectId, projectId),
        ),
      );

    const byKind = zeroByKind();
    const byStatus = zeroByStatus();
    for (const r of rows) {
      if ((PLAN_KINDS as readonly string[]).includes(r.kind)) {
        byKind[r.kind as PlanKind]++;
      }
      if ((PLAN_STATUSES as readonly string[]).includes(r.status)) {
        byStatus[r.status as PlanStatus]++;
      }
    }
    return { total: rows.length, byKind, byStatus };
  } catch {
    return { total: 0, byKind: zeroByKind(), byStatus: zeroByStatus() };
  }
}

async function gatherApprovals(
  organizationId: string,
  projectId: string,
): Promise<ApprovalsArtifact> {
  try {
    const [row] = await db
      .select({
        count: sql<number>`count(*)::int`,
        oldestCreatedAt: sql<Date | null>`min(${approvals.createdAt})`,
      })
      .from(approvals)
      .where(
        and(
          eq(approvals.organizationId, organizationId),
          eq(approvals.projectId, projectId),
          eq(approvals.status, "pending"),
        ),
      );
    const pendingTotal = row?.count ?? 0;
    let oldestOpenAgeHours: number | null = null;
    if (row?.oldestCreatedAt) {
      const ageMs = Date.now() - new Date(row.oldestCreatedAt).getTime();
      oldestOpenAgeHours = Math.max(0, Math.round(ageMs / 3600_000));
    }
    return { pendingTotal, oldestOpenAgeHours };
  } catch {
    return { pendingTotal: 0, oldestOpenAgeHours: null };
  }
}

async function gatherPhaseGates(
  _organizationId: string,
  projectId: string,
): Promise<PhaseGatesArtifact> {
  try {
    const rows = await db
      .select({ status: phaseGates.status })
      .from(phaseGates)
      .where(eq(phaseGates.projectId, projectId))
      .orderBy(asc(phaseGates.createdAt));
    const out: PhaseGatesArtifact = {
      total: rows.length,
      pending: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
    };
    for (const r of rows) {
      if (r.status === "pending") out.pending++;
      else if (r.status === "passed") out.passed++;
      else if (r.status === "failed") out.failed++;
      else if (r.status === "skipped") out.skipped++;
    }
    return out;
  } catch {
    return { total: 0, pending: 0, passed: 0, failed: 0, skipped: 0 };
  }
}

async function gatherVerificationDebt(
  organizationId: string,
  projectId: string,
): Promise<number | null> {
  try {
    const breakdown = await computeProjectDebt(projectId, organizationId);
    return breakdown.total;
  } catch {
    return null;
  }
}

/**
 * Run all four artifact gatherers in parallel against the same
 * (organization, project) pair. The four queries are independent;
 * doing them serially would needlessly inflate get_my_context latency.
 */
export async function gatherProjectArtifacts(
  organizationId: string,
  projectId: string,
): Promise<ProjectArtifacts> {
  const [plansArtifact, approvalsArtifact, phaseGatesArtifact, verificationDebt] =
    await Promise.all([
      gatherPlans(organizationId, projectId),
      gatherApprovals(organizationId, projectId),
      gatherPhaseGates(organizationId, projectId),
      gatherVerificationDebt(organizationId, projectId),
    ]);
  return {
    plans: plansArtifact,
    approvals: approvalsArtifact,
    phaseGates: phaseGatesArtifact,
    verificationDebt,
  };
}
