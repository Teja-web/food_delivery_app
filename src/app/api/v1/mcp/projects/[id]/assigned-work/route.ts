/**
 * GET /api/v1/mcp/projects/[id]/assigned-work
 *
 * Open work for the project: in-progress plans + open work_items
 * (issues / PRs). Optional `assigneeEmail` filter narrows to one
 * person; otherwise returns everything open in the project.
 *
 * "Open" for plans = status in (in_review, approved, in_progress).
 * "Open" for work_items = status not in (closed, merged, done).
 */

import { and, eq, inArray, notInArray } from "drizzle-orm";

import { db } from "@/db/client";
import { user } from "@/db/schema/auth";
import { plans } from "@/db/schema/plan";
import { projects } from "@/db/schema/project";
import { workItems } from "@/db/schema/work-item";
import { handleApi } from "@/lib/api/auth";

const OPEN_PLAN_STATUSES = ["in_review", "approved", "in_progress"] as const;
const CLOSED_WORK_ITEM_STATUSES = [
  "closed",
  "merged",
  "done",
  "resolved",
  "cancelled",
];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true, organizationId: true },
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

    const url = new URL(req.url);
    const assigneeEmail = url.searchParams.get("assigneeEmail");

    // Resolve email → user.id once. Plans store `assigneeId` (FK to user);
    // work_items store `assigneeEmail` (denormalized from upstream system).
    // When the agent passes an email, we filter plans by the resolved id
    // and work_items by the email directly. If no user matches, the plan
    // filter returns nothing (still a valid result — agent sees empty
    // plans + any work_items that match the raw email).
    let assigneeUserId: string | null = null;
    if (assigneeEmail) {
      const row = await db.query.user.findFirst({
        where: eq(user.email, assigneeEmail),
        columns: { id: true },
      });
      assigneeUserId = row?.id ?? null;
    }

    const planWhere = assigneeEmail
      ? and(
          eq(plans.organizationId, project.organizationId),
          eq(plans.projectId, project.id),
          inArray(plans.status, [...OPEN_PLAN_STATUSES]),
          // No match → return no plans. Avoid eq(col, null) which would
          // emit `= NULL` (never true). Use isNull-equivalent: filter to
          // a sentinel that can't match.
          eq(plans.assigneeId, assigneeUserId ?? "__no_such_user__"),
        )
      : and(
          eq(plans.organizationId, project.organizationId),
          eq(plans.projectId, project.id),
          inArray(plans.status, [...OPEN_PLAN_STATUSES]),
        );

    const workItemWhere = assigneeEmail
      ? and(
          eq(workItems.organizationId, project.organizationId),
          eq(workItems.projectId, project.id),
          eq(workItems.assigneeEmail, assigneeEmail),
          notInArray(workItems.status, CLOSED_WORK_ITEM_STATUSES),
        )
      : and(
          eq(workItems.organizationId, project.organizationId),
          eq(workItems.projectId, project.id),
          notInArray(workItems.status, CLOSED_WORK_ITEM_STATUSES),
        );

    const [openPlans, openWorkItems] = await Promise.all([
      db.query.plans.findMany({
        where: planWhere,
        columns: {
          id: true,
          kind: true,
          title: true,
          status: true,
          priority: true,
          assigneeId: true,
          assigneeName: true,
          updatedAt: true,
        },
        limit: 100,
      }),
      db.query.workItems.findMany({
        where: workItemWhere,
        columns: {
          id: true,
          source: true,
          kind: true,
          externalId: true,
          externalUrl: true,
          title: true,
          status: true,
          assigneeEmail: true,
          updatedAt: true,
        },
        limit: 100,
      }),
    ]);

    return {
      project: { id: project.id },
      assigneeResolution: assigneeEmail
        ? { email: assigneeEmail, userId: assigneeUserId, matched: assigneeUserId !== null }
        : null,
      plans: openPlans.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        status: p.status,
        priority: p.priority,
        assigneeId: p.assigneeId,
        assigneeName: p.assigneeName,
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
        assigneeEmail: w.assigneeEmail,
        updatedAt: w.updatedAt.toISOString(),
      })),
    };
  });
}
