import { z } from "zod/v4";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { approvals } from "@/db/schema/plan/approval";
import { phaseGates, GATE_TYPES, GATE_STATUSES, type GateStatus } from "@/db/schema/phase-gate";
import { PROJECT_PHASES, type ProjectPhase } from "@/db/schema/project";
import { workItems } from "@/db/schema/work-item";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const phaseGateSchema = z.object({
  projectId: z.string().min(1),
  phase: z.enum(PROJECT_PHASES),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(GATE_TYPES),
  threshold: z.number().optional(),
  status: z.enum(GATE_STATUSES).default("pending"),
});

export const phaseGateCrud = createEntityCrud({
  db,
  table: phaseGates,
  queryKey: "phaseGates",
  idField: "id",
  schema: phaseGateSchema,
  onMutate: () => safeRevalidate("/projects"),
});

export async function listGatesForPhase(projectId: string, phase: ProjectPhase) {
  const ctx = await getActionContext();
  return db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, projectId),
      eq(phaseGates.phase, phase),
      eq(phaseGates.organizationId, ctx.organizationId),
    ),
  });
}

export async function listGatesForProject(projectId: string) {
  const ctx = await getActionContext();
  return db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, projectId),
      eq(phaseGates.organizationId, ctx.organizationId),
    ),
  });
}

export async function setGateStatus(gateId: string, status: GateStatus, comment?: string) {
  const ctx = await getActionContext();
  await db
    .update(phaseGates)
    .set({ status, comment, evaluatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(phaseGates.id, gateId), eq(phaseGates.organizationId, ctx.organizationId)));
  safeRevalidate("/projects");
}

export interface UnmetGate {
  id: string;
  name: string;
  type: (typeof GATE_TYPES)[number];
  status: GateStatus;
}

/**
 * Count open GitHub PRs for a project that still have a pending approval row.
 * Drives the `unapproved_prs` gate's runtime verdict: > 0 → gate is unmet,
 * 0 → gate clears. Keying off shared `prRef` format (`github:owner/repo#N`)
 * which work_items.externalId, approvals.entityId, and gateEvaluations.prRef
 * all use after the normalization in `upsertGithubPrWorkItem`.
 */
export async function countOpenUnapprovedPrs(
  organizationId: string,
  projectId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workItems)
    .where(
      and(
        eq(workItems.organizationId, organizationId),
        eq(workItems.projectId, projectId),
        eq(workItems.source, "github"),
        eq(workItems.kind, "pull_request"),
        eq(workItems.status, "open"),
        sql`EXISTS (
          SELECT 1 FROM ${approvals}
          WHERE ${approvals.organizationId} = ${workItems.organizationId}
            AND ${approvals.entityType} = 'work_item'
            AND ${approvals.entityId} = ${workItems.externalId}
            AND ${approvals.status} = 'pending'
        )`,
      ),
    );
  return row?.count ?? 0;
}

/** Returns the list of gates blocking advancement (empty = clear to proceed). */
export async function findUnmetGates(projectId: string, phase: ProjectPhase): Promise<UnmetGate[]> {
  const ctx = await getActionContext();
  const rows = await db.query.phaseGates.findMany({
    where: and(
      eq(phaseGates.projectId, projectId),
      eq(phaseGates.phase, phase),
      eq(phaseGates.organizationId, ctx.organizationId),
    ),
  });

  const unmet: UnmetGate[] = [];
  for (const r of rows) {
    if (r.type === "unapproved_prs") {
      // Runtime-evaluated: stored status is best-effort UI; the source of
      // truth is the current count of open unapproved PRs for the project.
      const count = await countOpenUnapprovedPrs(ctx.organizationId, projectId);
      if (count > 0) {
        unmet.push({
          id: r.id,
          name: r.name,
          type: r.type,
          status: "failed",
        });
      }
      continue;
    }
    if (r.status === "pending" || r.status === "failed") {
      unmet.push({ id: r.id, name: r.name, type: r.type, status: r.status });
    }
  }
  return unmet;
}
