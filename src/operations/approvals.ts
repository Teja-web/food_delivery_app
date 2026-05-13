import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { approvals, APPROVAL_ENTITY_TYPES, APPROVAL_STATUSES, type ApprovalEntityType } from "@/db/schema/approval";
import { plans } from "@/db/schema/plan";
import { phaseGates } from "@/db/schema/phase-gate";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";
import { tryAdvancePhase } from "@/operations/phase-advance";
import { getSkillAutonomy } from "@/operations/skill-autonomy";

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

    // Auto-advance: when this approval flipped a gate green, check if every
    // gate in the current phase is now passed/skipped. If so, advance.
    if (args.decision === "approved") {
      const gate = await db.query.phaseGates.findFirst({
        where: and(
          eq(phaseGates.id, existing.entityId),
          eq(phaseGates.organizationId, ctx.organizationId),
        ),
      });
      if (gate) {
        await tryAdvancePhase({
          organizationId: ctx.organizationId,
          projectId: gate.projectId,
          triggeredByName: ctx.user.name ?? "approval-system",
        });
      }
    }
  }
  // release / work_item: caller (release manager, integration handler) does the cascade.

  safeRevalidate("/approvals");
}

/**
 * Autonomy-gated auto-approve helper.
 *
 * Returns true when the originating skill has earned enough autonomy for the
 * given change complexity:
 *   - level >= 3 (principal) → auto-approve any complexity
 *   - level >= 2 (senior)    → auto-approve only "low" complexity
 *   - otherwise              → always requires human
 *
 * No skillId → returns false (we only auto-approve skill-driven changes).
 *
 * TODO(autonomy): wire this into the approval-creation flow. When that flow
 * exists (skill-driven plan/PR proposals), call `canAutoApprove({ skillId,
 * complexity })` and short-circuit to status="approved" + decidedById="system"
 * when true. Until then this helper is exported for downstream callers.
 */
export async function canAutoApprove(input: {
  skillId?: string | null;
  projectId: string | null;
  complexity?: "low" | "medium" | "high";
}): Promise<boolean> {
  if (!input.skillId) return false;
  const autonomy = await getSkillAutonomy(input.skillId, input.projectId);
  if (autonomy.level >= 3) return true;
  if (autonomy.level >= 2 && input.complexity === "low") return true;
  return false;
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
