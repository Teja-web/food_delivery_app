import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { approvals, APPROVAL_STATUSES } from "@/db/schema/approval";
import { plans } from "@/db/schema/plan";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const approvalSchema = z.object({
  planId: z.string().min(1),
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

export async function listApprovalsForPlan(planId: string) {
  const ctx = await getActionContext();
  return db.query.approvals.findMany({
    where: and(eq(approvals.planId, planId), eq(approvals.organizationId, ctx.organizationId)),
    orderBy: [desc(approvals.createdAt)],
  });
}

/**
 * Decide an approval. Moves the underlying plan to `approved` or `rejected`
 * if the decision is conclusive.
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

  await db
    .update(approvals)
    .set({
      status: args.decision,
      decidedById: ctx.userId,
      decidedByName: ctx.user.name,
      decisionNote: args.note,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(approvals.id, args.approvalId));

  await db
    .update(plans)
    .set({
      status: args.decision,
      approvedById: args.decision === "approved" ? ctx.userId : null,
      approvedAt: args.decision === "approved" ? new Date() : null,
      updatedAt: new Date(),
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .where(and(eq(plans.id, existing.planId), eq(plans.organizationId, ctx.organizationId)));

  safeRevalidate(`/plans/${existing.planId}`);
  safeRevalidate("/approvals");
}
