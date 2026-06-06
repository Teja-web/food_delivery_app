/**
 * Plan Artifact CRUD + revision/upsert helpers.
 *
 * File name preserved as `plans.ts` for import stability; the table is now
 * `plan_artifacts` and exports use `planArtifacts` / `planCrud` (the latter
 * kept as an alias for callers).
 */

import { z } from "zod/v4";
import { and, desc, eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  planArtifacts,
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_PRIORITIES,
  PLAN_STATUSES,
  PLAN_CLASSIFICATIONS,
  type PlanKind,
} from "@/db/schema/plan/plan-artifact";
import { planRevisions } from "@/db/schema/plan/plan-revision";
import { planRelationships } from "@/db/schema/plan/plan-relationship";
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
  title: z.string().min(1),
  summary: z.string().optional(),
  body: z.string().default(""),
  details: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(PLAN_STATUSES).default("draft"),
  priority: z.enum(PLAN_PRIORITIES).optional(),
  effortEstimate: z.string().optional(),
  dueDate: z.date().optional(),
  classifications: z.array(z.enum(PLAN_CLASSIFICATIONS)).optional(),
  externalRef: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export const planCrud = createEntityCrud({
  db,
  table: planArtifacts,
  queryKey: "planArtifacts",
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

export async function createPlan(input: PlanCreateInput) {
  const slug = input.slug ?? slugify(input.title);
  return planCrud.create({ ...input, slug });
}

export async function listPlansByProject(
  projectId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const ctx = await getActionContext();
  return db.query.planArtifacts.findMany({
    where: and(
      eq(planArtifacts.organizationId, ctx.organizationId),
      eq(planArtifacts.projectId, projectId),
    ),
    orderBy: [desc(planArtifacts.updatedAt)],
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}

export async function listPlansByKind(kind: PlanKind, opts: { limit?: number } = {}) {
  const ctx = await getActionContext();
  return db.query.planArtifacts.findMany({
    where: and(eq(planArtifacts.organizationId, ctx.organizationId), eq(planArtifacts.kind, kind)),
    orderBy: [desc(planArtifacts.updatedAt)],
    limit: opts.limit ?? 100,
    with: { project: true },
  });
}

export async function appendPlanRevision(args: {
  planArtifactId: string;
  body: string;
  details?: Record<string, unknown>;
  changeNote?: string;
}): Promise<number> {
  const ctx = await getActionContext();
  const last = await db.query.planRevisions.findFirst({
    where: eq(planRevisions.planArtifactId, args.planArtifactId),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
  const next = (last?.revisionNumber ?? 0) + 1;

  await db.insert(planRevisions).values({
    organizationId: ctx.organizationId,
    planArtifactId: args.planArtifactId,
    revisionNumber: next,
    body: args.body,
    details: args.details,
    changeNote: args.changeNote,
    createdById: ctx.userId,
    createdByName: ctx.user.name,
  });

  await db
    .update(planArtifacts)
    .set({
      body: args.body,
      details: args.details,
      updatedAt: new Date(),
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .where(
      and(eq(planArtifacts.id, args.planArtifactId), eq(planArtifacts.organizationId, ctx.organizationId)),
    );

  safeRevalidate(`/plans/${args.planArtifactId}`);
  return next;
}

export async function upsertPlanByKindAndSlug(args: {
  projectId: string;
  kind: PlanKind;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  details?: Record<string, unknown>;
  parentPlanArtifactId?: string | null;
  changeNote?: string;
}): Promise<{
  plan: typeof planArtifacts.$inferSelect;
  revisionNumber: number;
  created: boolean;
}> {
  const ctx = await getActionContext();

  const existing = await db.query.planArtifacts.findFirst({
    where: and(
      eq(planArtifacts.organizationId, ctx.organizationId),
      eq(planArtifacts.projectId, args.projectId),
      eq(planArtifacts.kind, args.kind),
      eq(planArtifacts.slug, args.slug),
    ),
  });

  if (existing) {
    const revisionNumber = await appendPlanRevision({
      planArtifactId: existing.id,
      body: args.body,
      details: args.details,
      changeNote: args.changeNote,
    });
    await db
      .update(planArtifacts)
      .set({
        title: args.title,
        summary: args.summary,
        updatedAt: new Date(),
        updatedById: ctx.userId,
        updatedByName: ctx.user.name,
      })
      .where(
        and(eq(planArtifacts.id, existing.id), eq(planArtifacts.organizationId, ctx.organizationId)),
      );

    if (args.parentPlanArtifactId) {
      await upsertParentOf(existing.id, args.parentPlanArtifactId);
    }

    const refreshed = await db.query.planArtifacts.findFirst({
      where: and(
        eq(planArtifacts.id, existing.id),
        eq(planArtifacts.organizationId, ctx.organizationId),
      ),
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
    status: "draft",
  });

  if (args.parentPlanArtifactId) {
    await upsertParentOf(created.id, args.parentPlanArtifactId);
  }

  return { plan: created, revisionNumber: 0, created: true };
}

async function upsertParentOf(childId: string, parentId: string) {
  const ctx = await getActionContext();
  const existing = await db.query.planRelationships.findFirst({
    where: and(
      eq(planRelationships.organizationId, ctx.organizationId),
      eq(planRelationships.fromPlanArtifactId, parentId),
      eq(planRelationships.toPlanArtifactId, childId),
      eq(planRelationships.kind, "parent_of"),
    ),
  });
  if (existing) return;
  await db.insert(planRelationships).values({
    organizationId: ctx.organizationId,
    fromPlanArtifactId: parentId,
    toPlanArtifactId: childId,
    kind: "parent_of",
    createdById: ctx.userId,
  });
}

export async function listPlanRevisions(planArtifactId: string) {
  const ctx = await getActionContext();
  return db.query.planRevisions.findMany({
    where: and(
      eq(planRevisions.planArtifactId, planArtifactId),
      eq(planRevisions.organizationId, ctx.organizationId),
    ),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
}

/** Children rolled up under this plan via `parent_of` relationships. */
export async function listChildPlans(parentPlanArtifactId: string) {
  const ctx = await getActionContext();
  const rels = await db.query.planRelationships.findMany({
    where: and(
      eq(planRelationships.fromPlanArtifactId, parentPlanArtifactId),
      eq(planRelationships.kind, "parent_of"),
      eq(planRelationships.organizationId, ctx.organizationId),
    ),
  });
  if (rels.length === 0) return [];
  return db.query.planArtifacts.findMany({
    where: and(
      inArray(
        planArtifacts.id,
        rels.map((r) => r.toPlanArtifactId),
      ),
      eq(planArtifacts.organizationId, ctx.organizationId),
    ),
    orderBy: [desc(planArtifacts.updatedAt)],
  });
}

/** Walks up `parent_of` relationships. Returns root-first, exclusive of the plan itself. */
export async function getPlanAncestry(
  planArtifactId: string,
): Promise<Array<{ id: string; title: string; kind: PlanKind }>> {
  const ctx = await getActionContext();
  const chain: Array<{ id: string; title: string; kind: PlanKind }> = [];
  let cursor: string | null = planArtifactId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const rel: typeof planRelationships.$inferSelect | undefined =
      await db.query.planRelationships.findFirst({
        where: and(
          eq(planRelationships.toPlanArtifactId, cursor),
          eq(planRelationships.kind, "parent_of"),
          eq(planRelationships.organizationId, ctx.organizationId),
        ),
      });
    if (!rel) break;
    const parent:
      | { id: string; title: string; kind: PlanKind }
      | undefined = await db.query.planArtifacts.findFirst({
      where: and(
        eq(planArtifacts.id, rel.fromPlanArtifactId),
        eq(planArtifacts.organizationId, ctx.organizationId),
      ),
      columns: { id: true, title: true, kind: true },
    });
    if (!parent) break;
    chain.unshift(parent);
    cursor = parent.id;
  }
  return chain;
}

export function validateParentKind(childKind: PlanKind, parentKind: PlanKind | null): string | null {
  if (!parentKind) return null;
  const allowed = PLAN_KIND_PARENTS[childKind];
  if (!allowed) return `${childKind} plans cannot have a parent`;
  if (!allowed.includes(parentKind)) {
    return `${childKind} parent must be one of: ${allowed.join(", ")}`;
  }
  return null;
}
