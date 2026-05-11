import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { plans, PLAN_KINDS, PLAN_PRIORITIES, PLAN_STATUSES } from "@/db/schema/plan";
import { planRevisions } from "@/db/schema/plan-revision";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const planSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(PLAN_KINDS),
  slug: z.string().optional(),
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().default(""),
  details: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(PLAN_STATUSES).default("draft"),
  priority: z.enum(PLAN_PRIORITIES).optional(),
  effortEstimate: z.string().optional(),
  dueDate: z.date().optional(),
  externalRef: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export const planCrud = createEntityCrud({
  db,
  table: plans,
  queryKey: "plans",
  idField: "id",
  schema: planSchema,
  searchFields: ["title", "summary", "body"],
  getWith: { project: true },
  onMutate: () => safeRevalidate("/plans"),
});

/** List plans for a project, ordered by most recent. */
export async function listPlansByProject(projectId: string, opts: { limit?: number; offset?: number } = {}) {
  const ctx = await getActionContext();
  const rows = await db.query.plans.findMany({
    where: and(eq(plans.organizationId, ctx.organizationId), eq(plans.projectId, projectId)),
    orderBy: [desc(plans.updatedAt)],
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
  return rows;
}

/** Append a revision and update the live plan's body. Returns the new revision number. */
export async function appendPlanRevision(args: {
  planId: string;
  body: string;
  details?: Record<string, unknown>;
  changeNote?: string;
}): Promise<number> {
  const ctx = await getActionContext();
  const last = await db.query.planRevisions.findFirst({
    where: eq(planRevisions.planId, args.planId),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
  const next = (last?.revisionNumber ?? 0) + 1;

  await db.insert(planRevisions).values({
    organizationId: ctx.organizationId,
    planId: args.planId,
    revisionNumber: next,
    body: args.body,
    details: args.details,
    changeNote: args.changeNote,
    createdById: ctx.userId,
    createdByName: ctx.user.name,
  });

  await db
    .update(plans)
    .set({ body: args.body, details: args.details, updatedAt: new Date(), updatedById: ctx.userId, updatedByName: ctx.user.name })
    .where(and(eq(plans.id, args.planId), eq(plans.organizationId, ctx.organizationId)));

  safeRevalidate(`/plans/${args.planId}`);
  return next;
}

export async function listPlanRevisions(planId: string) {
  const ctx = await getActionContext();
  return db.query.planRevisions.findMany({
    where: and(eq(planRevisions.planId, planId), eq(planRevisions.organizationId, ctx.organizationId)),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
}
