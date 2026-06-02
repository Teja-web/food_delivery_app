import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { plans, PLAN_KINDS, PLAN_KIND_PARENTS, PLAN_PRIORITIES, PLAN_STATUSES, type PlanKind } from "@/db/schema/plan/plan";
import { planRevisions } from "@/db/schema/plan/plan-revision";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";
import { applyRulesToPlan } from "@/operations/rule-engine";

const slugSuffix = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 6);

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${base || "plan"}-${slugSuffix()}`;
}

const planSchema = z.object({
  projectId: z.string().min(1),
  kind: z.enum(PLAN_KINDS),
  slug: z.string().min(1),
  parentPlanId: z.string().optional().nullable(),
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
  hooks: {
    afterCreate: async (record) => {
      await applyRulesToPlan(record);
    },
    afterUpdate: async (record) => {
      await applyRulesToPlan(record);
    },
  },
});

type PlanCreateInput = Omit<z.input<typeof planSchema>, "slug"> & { slug?: string };

/**
 * Canonical plan-creation path. Auto-derives `slug` from `title` when callers
 * don't supply one (UI form, batch requirement ingest, ADR logging). Routes
 * authoring an idempotent identity (MCP `upsert_plan`) pass an explicit slug.
 */
export async function createPlan(input: PlanCreateInput) {
  const slug = input.slug ?? slugify(input.title);
  return planCrud.create({ ...input, slug });
}

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

/** List plans by kind across the entire org, with project rows joined. */
export async function listPlansByKind(kind: PlanKind, opts: { limit?: number } = {}) {
  const ctx = await getActionContext();
  const rows = await db.query.plans.findMany({
    where: and(eq(plans.organizationId, ctx.organizationId), eq(plans.kind, kind)),
    orderBy: [desc(plans.updatedAt)],
    limit: opts.limit ?? 100,
    with: { project: true },
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

/**
 * Upsert a plan by `(projectId, kind, slug)`.
 *
 * If a plan with that key exists, append a `plan_revisions` row and refresh
 * the live body/details/title/summary. Otherwise create a new draft plan.
 *
 * Returns the live plan plus `revisionNumber` (0 on first create; 1, 2, …
 * for subsequent revisions) and a `created` flag.
 *
 * Used by the `upsert_plan` MCP verb to land AI-authored documents
 * (test plans, release notes, etc.) without the agent needing separate
 * create/update verbs.
 */
export async function upsertPlanByKindAndSlug(args: {
  projectId: string;
  kind: PlanKind;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  details?: Record<string, unknown>;
  parentPlanId?: string | null;
  changeNote?: string;
}): Promise<{
  plan: typeof plans.$inferSelect;
  revisionNumber: number;
  created: boolean;
}> {
  const ctx = await getActionContext();

  const existing = await db.query.plans.findFirst({
    where: and(
      eq(plans.organizationId, ctx.organizationId),
      eq(plans.projectId, args.projectId),
      eq(plans.kind, args.kind),
      eq(plans.slug, args.slug),
    ),
  });

  if (existing) {
    const revisionNumber = await appendPlanRevision({
      planId: existing.id,
      body: args.body,
      details: args.details,
      changeNote: args.changeNote,
    });
    // appendPlanRevision already updated body/details; also refresh title/summary.
    await db
      .update(plans)
      .set({
        title: args.title,
        summary: args.summary,
        parentPlanId: args.parentPlanId ?? existing.parentPlanId,
        updatedAt: new Date(),
        updatedById: ctx.userId,
        updatedByName: ctx.user.name,
      })
      .where(and(eq(plans.id, existing.id), eq(plans.organizationId, ctx.organizationId)));

    const refreshed = await db.query.plans.findFirst({
      where: and(eq(plans.id, existing.id), eq(plans.organizationId, ctx.organizationId)),
    });
    return { plan: refreshed!, revisionNumber, created: false };
  }

  const created = await planCrud.create({
    projectId: args.projectId,
    kind: args.kind,
    slug: args.slug,
    title: args.title,
    summary: args.summary,
    body: args.body,
    details: args.details,
    parentPlanId: args.parentPlanId ?? null,
    status: "draft",
  });
  return { plan: created, revisionNumber: 0, created: true };
}

export async function listPlanRevisions(planId: string) {
  const ctx = await getActionContext();
  return db.query.planRevisions.findMany({
    where: and(eq(planRevisions.planId, planId), eq(planRevisions.organizationId, ctx.organizationId)),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
}

/** Plans rolling up under this one (one level deep). */
export async function listChildPlans(parentPlanId: string) {
  const ctx = await getActionContext();
  return db.query.plans.findMany({
    where: and(eq(plans.parentPlanId, parentPlanId), eq(plans.organizationId, ctx.organizationId)),
    orderBy: [desc(plans.updatedAt)],
  });
}

/** Walks up parentPlanId until null. Returns root-first. */
export async function getPlanAncestry(planId: string) {
  const ctx = await getActionContext();
  const chain: { id: string; title: string; kind: PlanKind }[] = [];
  let cursor: string | null = planId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const p: { id: string; title: string; kind: PlanKind; parentPlanId: string | null } | undefined =
      await db.query.plans.findFirst({
        where: and(eq(plans.id, cursor), eq(plans.organizationId, ctx.organizationId)),
        columns: { id: true, title: true, kind: true, parentPlanId: true },
      });
    if (!p) break;
    chain.unshift({ id: p.id, title: p.title, kind: p.kind });
    cursor = p.parentPlanId;
  }
  return chain.slice(0, -1); // drop the plan itself
}

/** Validation helper: returns the human-readable error if the parent kind isn't allowed for the child kind. */
export function validateParentKind(childKind: PlanKind, parentKind: PlanKind | null): string | null {
  if (!parentKind) return null;
  const allowed = PLAN_KIND_PARENTS[childKind];
  if (!allowed) return `${childKind} plans cannot have a parent`;
  if (!allowed.includes(parentKind)) {
    return `${childKind} parent must be one of: ${allowed.join(", ")}`;
  }
  return null;
}
