import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { approvals, APPROVAL_ENTITY_TYPES, APPROVAL_STATUSES, type ApprovalEntityType } from "@/db/schema/approval";
import { plans } from "@/db/schema/plan";
import { phaseGates } from "@/db/schema/phase-gate";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const approvalSchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().min(1),
  phase: z.string().optional(),
  requestedById: z.string().min(1),
  requestedByName: z.string().optional(),
  requesterNote: z.string().optional(),
  approverIds: z.array(z.string()).optional(),
  status: z.enum(APPROVAL_STATUSES).default("pending"),
});

export const approvalCrud = createEntityCrud({
  db,
  table: approvals,
  queryKey: "approvals",
  idField: "id",
  schema: approvalSchema,
  onMutate: () => safeRevalidate("/approvals"),
});

export async function listApprovalsForEntity(entityType: ApprovalEntityType, entityId: string) {
  const ctx = await getActionContext();
  return db.query.approvals.findMany({
    where: and(
      eq(approvals.entityType, entityType),
      eq(approvals.entityId, entityId),
      eq(approvals.organizationId, ctx.organizationId),
    ),
    orderBy: [desc(approvals.createdAt)],
  });
}

/** Convenience wrapper for the most common case. */
export async function listApprovalsForPlan(planId: string) {
  return listApprovalsForEntity("plan", planId);
}

/**
 * Decide an approval. Side effects depend on the target entity:
 *   - `plan`        → plan.status moves to approved/rejected
 *   - `phase_gate`  → gate.status moves to passed/failed
 *   - others        → only the approval row changes; caller handles cascade
 */
export async function decideApproval(args: {
  approvalId: string;
  decision: "approved" | "rejected";
  note?: string;
}): Promise<void> {
  const ctx = await getActionContext();

  const existing = await db.query.approvals.findFirst({
    where: and(eq(approvals.id, args.approvalId), eq(approvals.organizationId, ctx.organizationId)),
  });
  if (!existing) throw new Error("Approval not found");
  if (existing.status !== "pending") throw new Error(`Approval already ${existing.status}`);

  const now = new Date();
  await db
    .update(approvals)
    .set({
      status: args.decision,
      decidedById: ctx.userId,
      decidedByName: ctx.user.name,
      decisionNote: args.note,
      decidedAt: now,
      updatedAt: now,
    })
    .where(eq(approvals.id, args.approvalId));

  if (existing.entityType === "plan") {
    await db
      .update(plans)
      .set({
        status: args.decision,
        approvedById: args.decision === "approved" ? ctx.userId : null,
        approvedAt: args.decision === "approved" ? now : null,
        updatedAt: now,
        updatedById: ctx.userId,
        updatedByName: ctx.user.name,
      })
      .where(and(eq(plans.id, existing.entityId), eq(plans.organizationId, ctx.organizationId)));
    safeRevalidate(`/plans/${existing.entityId}`);
  } else if (existing.entityType === "phase_gate") {
    await db
      .update(phaseGates)
      .set({
        status: args.decision === "approved" ? "passed" : "failed",
        approvedById: args.decision === "approved" ? ctx.userId : null,
        comment: args.note,
        evaluatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(phaseGates.id, existing.entityId), eq(phaseGates.organizationId, ctx.organizationId)));
  }
  // release / work_item: caller (release manager, integration handler) does the cascade.

  safeRevalidate("/approvals");
}

/** Request an approval for a plan. Sets the plan's status to in_review. */
export async function requestPlanApproval(planId: string, note?: string) {
  const ctx = await getActionContext();
  const approval = await approvalCrud.create({
    entityType: "plan",
    entityId: planId,
    requestedById: ctx.userId,
    requestedByName: ctx.user.name,
    requesterNote: note,
  });
  await db
    .update(plans)
    .set({ status: "in_review", updatedAt: new Date(), updatedById: ctx.userId, updatedByName: ctx.user.name })
    .where(and(eq(plans.id, planId), eq(plans.organizationId, ctx.organizationId)));
  safeRevalidate(`/plans/${planId}`);
  return approval;
}
