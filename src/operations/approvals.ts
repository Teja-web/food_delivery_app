import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { approvals, APPROVAL_ENTITY_TYPES, APPROVAL_STATUSES, type ApprovalEntityType } from "@/db/schema/approval";
import { plans } from "@/db/schema/plan";
import { phaseGates } from "@/db/schema/phase-gate";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { ForbiddenError, getActionContext, hasElevatedRole } from "@/lib/auth/context";
import { tryAdvancePhase } from "@/operations/phase-advance";
import { getSkillAutonomy } from "@/operations/skill-autonomy";
import {
  pushPlanToConfluence,
  pushPlanToJira,
  pushPlanToAdo,
  triggerAdoPipelineForGate,
  transitionJiraIssueForPlan,
} from "@/lib/integrations/outbound";

const approvalSchema = z.object({
  entityType: z.enum(APPROVAL_ENTITY_TYPES),
  entityId: z.string().min(1),
  /**
   * Optional at the API boundary — `resolveProjectIdForApproval` fills it
   * in when the caller didn't supply it, by looking up the target entity.
   */
  projectId: z.string().nullable().optional(),
  phase: z.string().optional(),
  requestedById: z.string().min(1),
  requestedByName: z.string().optional(),
  requesterNote: z.string().optional(),
  approverIds: z.array(z.string()).optional(),
  status: z.enum(APPROVAL_STATUSES).default("pending"),
});

/**
 * Look up the project the target entity belongs to. Used at approval-create
 * time so portfolio rollup counts are real instead of org-total-divided-by-N.
 *
 *   plan        → plans.projectId
 *   phase_gate  → phase_gates.projectId
 *   work_item   → work_items.projectId
 *   release     → encoded in entityId as `<projectId>:<version>` per the
 *                 release-plan convention; fall back to null if unparseable
 */
export async function resolveProjectIdForApproval(
  entityType: ApprovalEntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === "plan") {
    const [row] = await db
      .select({ projectId: plans.projectId })
      .from(plans)
      .where(eq(plans.id, entityId))
      .limit(1);
    return row?.projectId ?? null;
  }
  if (entityType === "phase_gate") {
    const [row] = await db
      .select({ projectId: phaseGates.projectId })
      .from(phaseGates)
      .where(eq(phaseGates.id, entityId))
      .limit(1);
    return row?.projectId ?? null;
  }
  if (entityType === "work_item") {
    const { workItems } = await import("@/db/schema/work-item");
    const [row] = await db
      .select({ projectId: workItems.projectId })
      .from(workItems)
      .where(eq(workItems.id, entityId))
      .limit(1);
    return row?.projectId ?? null;
  }
  if (entityType === "release") {
    const colonIdx = entityId.indexOf(":");
    return colonIdx > 0 ? entityId.slice(0, colonIdx) : null;
  }
  return null;
}

export const approvalCrud = createEntityCrud({
  db,
  table: approvals,
  queryKey: "approvals",
  idField: "id",
  schema: approvalSchema,
  onMutate: () => safeRevalidate("/approvals"),
});

/**
 * Preferred create path — resolves projectId from the target entity before
 * inserting, so portfolio rollup counts are accurate. `approvalCrud.create`
 * still works for callers that already know the projectId.
 */
export async function createApprovalWithProjectResolution(
  input: z.input<typeof approvalSchema>,
): Promise<Awaited<ReturnType<typeof approvalCrud.create>>> {
  const projectId =
    input.projectId !== undefined
      ? input.projectId
      : await resolveProjectIdForApproval(input.entityType, input.entityId);
  return approvalCrud.create({ ...input, projectId });
}

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

  // Approver enforcement: when the approval row pins a non-empty `approverIds`
  // list, the deciding user must be on it (or hold an elevated role as the
  // override path). Empty/null list keeps the legacy "anyone in org" behavior.
  const approvers = existing.approverIds ?? [];
  if (approvers.length > 0 && !approvers.includes(ctx.userId) && !hasElevatedRole(ctx)) {
    throw new ForbiddenError(
      "You are not an authorized approver for this request.",
    );
  }

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

    // Outbound sync on approval. Best-effort — no-op when no binding exists,
    // failures logged but never re-thrown.
    if (args.decision === "approved") {
      const plan = await db.query.plans.findFirst({
        where: and(eq(plans.id, existing.entityId), eq(plans.organizationId, ctx.organizationId)),
      });
      if (plan) {
        // ADRs → Confluence page (per the SDLC vision: "approved ADRs push to Confluence").
        if (plan.kind === "adr") {
          await pushPlanToConfluence(plan.id);
        }
        // Stories / features / epics → Jira issue + ADO work item (whichever is bound).
        if (plan.kind === "story" || plan.kind === "feature" || plan.kind === "epic") {
          await pushPlanToJira(plan.id);
          await pushPlanToAdo(plan.id);
          await transitionJiraIssueForPlan(plan.id, "approved");
        }
      }
    }
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
        // CI/CD gate pass → trigger the bound ADO pipeline (best-effort).
        await triggerAdoPipelineForGate(gate.id);
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
