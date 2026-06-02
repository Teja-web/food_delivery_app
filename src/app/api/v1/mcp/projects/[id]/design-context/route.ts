/**
 * GET /api/v1/mcp/projects/[id]/design-context
 *
 * Richer-than-orientation snapshot for design/development/testing
 * phases. Returns ADRs (with bodies, not just titles) + active
 * feature/story plans + linked work_items. The agent uses this when
 * it needs to consult prior decisions or know what features are in
 * flight, beyond what `get_my_context` provides at orientation.
 */

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { plans } from "@/db/schema/plan/plan";
import { projects } from "@/db/schema/project";
import { workItems } from "@/db/schema/work-item";
import { handleApi } from "@/lib/auth/api-key";

const ACTIVE_PLAN_STATUSES = ["in_review", "approved", "in_progress"] as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true, organizationId: true, name: true, phase: true },
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const [adrs, activeFeatures, openWorkItems] = await Promise.all([
      db.query.plans.findMany({
        where: and(
          eq(plans.organizationId, project.organizationId),
          eq(plans.projectId, project.id),
          eq(plans.kind, "adr"),
        ),
        orderBy: [desc(plans.updatedAt)],
        limit: 25,
        columns: {
          id: true,
          title: true,
          summary: true,
          body: true,
          status: true,
          updatedAt: true,
        },
      }),
      db.query.plans.findMany({
        where: and(
          eq(plans.organizationId, project.organizationId),
          eq(plans.projectId, project.id),
          inArray(plans.kind, ["feature", "story"]),
          inArray(plans.status, [...ACTIVE_PLAN_STATUSES]),
        ),
        orderBy: [desc(plans.updatedAt)],
        limit: 50,
        columns: {
          id: true,
          kind: true,
          title: true,
          summary: true,
          status: true,
          priority: true,
          parentPlanId: true,
          updatedAt: true,
        },
      }),
      db.query.workItems.findMany({
        where: and(
          eq(workItems.organizationId, project.organizationId),
          eq(workItems.projectId, project.id),
        ),
        orderBy: [desc(workItems.updatedAt)],
        limit: 50,
        columns: {
          id: true,
          source: true,
          kind: true,
          externalId: true,
          externalUrl: true,
          title: true,
          status: true,
          planId: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      project: { id: project.id, name: project.name, phase: project.phase },
      adrs: adrs.map((p) => ({
        id: p.id,
        title: p.title,
        summary: p.summary,
        body: p.body,
        status: p.status,
        updatedAt: p.updatedAt.toISOString(),
      })),
      activeFeatures: activeFeatures.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        summary: p.summary,
        status: p.status,
        priority: p.priority,
        parentPlanId: p.parentPlanId,
        updatedAt: p.updatedAt.toISOString(),
      })),
      workItems: openWorkItems.map((w) => ({
        id: w.id,
        source: w.source,
        kind: w.kind,
        externalId: w.externalId,
        externalUrl: w.externalUrl,
        title: w.title,
        status: w.status,
        planId: w.planId,
        updatedAt: w.updatedAt.toISOString(),
      })),
    };
  });
}
