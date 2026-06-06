/**
 * GET /api/v1/mcp/plans/:id — fetch one plan_artifact with body, revisions,
 * and the governance records currently targeting it.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import { planRevisions } from "@/db/schema/plan/plan-revision";
import { governanceRecords } from "@/db/schema/governance/records";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const plan = await db.query.planArtifacts.findFirst({
      where: and(eq(plans.id, id), eq(plans.organizationId, ctx.organizationId)),
    });
    if (!plan) throw httpError(404, "Plan not found");
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const [revisions, records] = await Promise.all([
      db.query.planRevisions.findMany({
        where: and(
          eq(planRevisions.planArtifactId, plan.id),
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
      db.query.governanceRecords.findMany({
        where: and(
          eq(governanceRecords.planArtifactId, plan.id),
          eq(governanceRecords.organizationId, ctx.organizationId),
        ),
        orderBy: [desc(governanceRecords.createdAt)],
        columns: {
          id: true,
          kind: true,
          status: true,
          decidedByName: true,
          decidedAt: true,
          transitionFrom: true,
          transitionTo: true,
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
        externalRef: plan.externalRef,
        assigneeName: plan.assigneeName,
        updatedAt: plan.updatedAt,
      },
      revisions,
      governanceRecords: records,
    };
  });
}
