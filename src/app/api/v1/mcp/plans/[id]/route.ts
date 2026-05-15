/**
 * GET /api/v1/mcp/plans/:id — fetch one plan with body, revisions, and
 * approval state. The companion to the list view at `/api/v1/mcp/plans`.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { plans } from "@/db/schema/plan";
import { planRevisions } from "@/db/schema/plan-revision";
import { approvals } from "@/db/schema/approval";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const plan = await db.query.plans.findFirst({
      where: and(eq(plans.id, id), eq(plans.organizationId, ctx.organizationId)),
    });
    if (!plan) {
      const err = new Error("Plan not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const [revisions, planApprovals] = await Promise.all([
      db.query.planRevisions.findMany({
        where: and(
          eq(planRevisions.planId, plan.id),
          eq(planRevisions.organizationId, ctx.organizationId),
        ),
        orderBy: [desc(planRevisions.revisionNumber)],
        columns: {
          revisionNumber: true,
          changeNote: true,
          createdAt: true,
          createdByName: true,
        },
      }),
      db.query.approvals.findMany({
        where: and(
          eq(approvals.entityType, "plan"),
          eq(approvals.entityId, plan.id),
          eq(approvals.organizationId, ctx.organizationId),
        ),
        orderBy: [desc(approvals.createdAt)],
        columns: {
          id: true,
          status: true,
          requestedByName: true,
          decidedByName: true,
          decidedAt: true,
        },
      }),
    ]);

    return {
      plan: {
        id: plan.id,
        kind: plan.kind,
        slug: plan.slug,
        title: plan.title,
        summary: plan.summary,
        body: plan.body,
        status: plan.status,
        priority: plan.priority,
        parentPlanId: plan.parentPlanId,
        externalRef: plan.externalRef,
        assigneeName: plan.assigneeName,
        updatedAt: plan.updatedAt,
      },
      revisions,
      approvals: planApprovals,
    };
  });
}
