/**
 * Project Task CRUD + revision/upsert helpers.
 *
 * File name preserved as `plans.ts` for import stability; the table is now
 * `project_tasks` and exports use `projectTasks` / `planCrud` (the latter
 * kept as an alias for callers).
 */

import { z } from "zod/v4";
import { and, desc, eq, inArray } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  projectTasks,
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_PRIORITIES,
  PLAN_STATUSES,
  type PlanKind,
} from "@/db/schema/plan/project-task";
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
  metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(PLAN_STATUSES).default("draft"),
  priority: z.enum(PLAN_PRIORITIES).optional(),
  dueDate: z.date().optional(),
  externalRef: z.string().optional(),
  assigneeId: z.string().optional(),
  assigneeName: z.string().optional(),
});

export const planCrud = createEntityCrud({
  db,
  table: projectTasks,
  queryKey: "projectTasks",
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

export function normalizeProjectTaskMetadata(input: {
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  effortEstimate?: string | null;
  classifications?: string[] | null;
  claimedPath?: string | null;
}): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {
    ...(input.details ?? {}),
    ...(input.metadata ?? {}),
  };

  if (input.effortEstimate != null) metadata.effortEstimate = input.effortEstimate;
  if (input.classifications != null) metadata.classifications = input.classifications;
  if (input.claimedPath != null) {
    const source =
      typeof metadata.source === "object" && metadata.source !== null && !Array.isArray(metadata.source)
        ? (metadata.source as Record<string, unknown>)
        : {};
    metadata.source = { ...source, claimedPath: input.claimedPath };
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

export async function createPlan(input: PlanCreateInput) {
  const slug = input.slug ?? slugify(input.title);
  return planCrud.create({ ...input, slug });
}

export async function listPlansByProject(
  projectId: string,
  opts: { limit?: number; offset?: number } = {},
) {
  const ctx = await getActionContext();
  return db.query.projectTasks.findMany({
    where: and(
      eq(projectTasks.organizationId, ctx.organizationId),
      eq(projectTasks.projectId, projectId),
    ),
    orderBy: [desc(projectTasks.updatedAt)],
    limit: opts.limit ?? 50,
    offset: opts.offset ?? 0,
  });
}

export async function listPlansByKind(kind: PlanKind, opts: { limit?: number } = {}) {
  const ctx = await getActionContext();
  return db.query.projectTasks.findMany({
    where: and(eq(projectTasks.organizationId, ctx.organizationId), eq(projectTasks.kind, kind)),
    orderBy: [desc(projectTasks.updatedAt)],
    limit: opts.limit ?? 100,
    with: { project: true },
  });
}

export async function appendPlanRevision(args: {
  projectTaskId: string;
  body: string;
  metadata?: Record<string, unknown>;
  changeNote?: string;
}): Promise<number> {
  const ctx = await getActionContext();
  const last = await db.query.planRevisions.findFirst({
    where: eq(planRevisions.projectTasksId, args.projectTaskId),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
  const next = (last?.revisionNumber ?? 0) + 1;

  await db.insert(planRevisions).values({
    organizationId: ctx.organizationId,
    projectTasksId: args.projectTaskId,
    revisionNumber: next,
    body: args.body,
    details: args.metadata,
    changeNote: args.changeNote,
    createdById: ctx.userId,
    createdByName: ctx.user.name,
  });

  await db
    .update(projectTasks)
    .set({
      body: args.body,
      metadata: args.metadata,
      updatedAt: new Date(),
      updatedById: ctx.userId,
      updatedByName: ctx.user.name,
    })
    .where(
      and(eq(projectTasks.id, args.projectTaskId), eq(projectTasks.organizationId, ctx.organizationId)),
    );

  safeRevalidate(`/plans/${args.projectTaskId}`);
  return next;
}

export async function upsertPlanByKindAndSlug(args: {
  projectId: string;
  kind: PlanKind;
  slug: string;
  title: string;
  summary?: string;
  body: string;
  metadata?: Record<string, unknown>;
  parentProjectTaskId?: string | null;
  changeNote?: string;
}): Promise<{
  plan: typeof projectTasks.$inferSelect;
  revisionNumber: number;
  created: boolean;
}> {
  const ctx = await getActionContext();

  const existing = await db.query.projectTasks.findFirst({
    where: and(
      eq(projectTasks.organizationId, ctx.organizationId),
      eq(projectTasks.projectId, args.projectId),
      eq(projectTasks.kind, args.kind),
      eq(projectTasks.slug, args.slug),
    ),
  });

  if (existing) {
    const revisionNumber = await appendPlanRevision({
      projectTaskId: existing.id,
      body: args.body,
      metadata: args.metadata,
      changeNote: args.changeNote,
    });
    await db
      .update(projectTasks)
      .set({
        title: args.title,
        summary: args.summary,
        updatedAt: new Date(),
        updatedById: ctx.userId,
        updatedByName: ctx.user.name,
      })
      .where(
        and(eq(projectTasks.id, existing.id), eq(projectTasks.organizationId, ctx.organizationId)),
      );

    if (args.parentProjectTaskId) {
      await upsertParentOf(existing.id, args.parentProjectTaskId);
    }

    const refreshed = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, existing.id),
        eq(projectTasks.organizationId, ctx.organizationId),
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
    metadata: args.metadata,
    status: "draft",
  });

  if (args.parentProjectTaskId) {
    await upsertParentOf(created.id, args.parentProjectTaskId);
  }

  return { plan: created, revisionNumber: 0, created: true };
}

async function upsertParentOf(childId: string, parentId: string) {
  const ctx = await getActionContext();
  const existing = await db.query.planRelationships.findFirst({
    where: and(
      eq(planRelationships.organizationId, ctx.organizationId),
      eq(planRelationships.fromProjectTasksId, parentId),
      eq(planRelationships.toProjectTasksId, childId),
      eq(planRelationships.kind, "parent_of"),
    ),
  });
  if (existing) return;
  await db.insert(planRelationships).values({
    organizationId: ctx.organizationId,
    fromProjectTasksId: parentId,
    toProjectTasksId: childId,
    kind: "parent_of",
    createdById: ctx.userId,
  });
}

export async function listPlanRevisions(projectTaskId: string) {
  const ctx = await getActionContext();
  return db.query.planRevisions.findMany({
    where: and(
      eq(planRevisions.projectTasksId, projectTaskId),
      eq(planRevisions.organizationId, ctx.organizationId),
    ),
    orderBy: [desc(planRevisions.revisionNumber)],
  });
}

/** Children rolled up under this plan via `parent_of` relationships. */
export async function listChildPlans(parentProjectTaskId: string) {
  const ctx = await getActionContext();
  const rels = await db.query.planRelationships.findMany({
    where: and(
      eq(planRelationships.fromProjectTasksId, parentProjectTaskId),
      eq(planRelationships.kind, "parent_of"),
      eq(planRelationships.organizationId, ctx.organizationId),
    ),
  });
  if (rels.length === 0) return [];
  return db.query.projectTasks.findMany({
    where: and(
      inArray(
        projectTasks.id,
        rels.map((r) => r.toProjectTasksId),
      ),
      eq(projectTasks.organizationId, ctx.organizationId),
    ),
    orderBy: [desc(projectTasks.updatedAt)],
  });
}

/** Walks up `parent_of` relationships. Returns root-first, exclusive of the plan itself. */
export async function getPlanAncestry(
  projectTaskId: string,
): Promise<Array<{ id: string; title: string; kind: PlanKind }>> {
  const ctx = await getActionContext();
  const chain: Array<{ id: string; title: string; kind: PlanKind }> = [];
  let cursor: string | null = projectTaskId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const rel: typeof planRelationships.$inferSelect | undefined =
      await db.query.planRelationships.findFirst({
        where: and(
          eq(planRelationships.toProjectTasksId, cursor),
          eq(planRelationships.kind, "parent_of"),
          eq(planRelationships.organizationId, ctx.organizationId),
        ),
      });
    if (!rel) break;
    const parent:
      | { id: string; title: string; kind: PlanKind }
      | undefined = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, rel.fromProjectTasksId),
        eq(projectTasks.organizationId, ctx.organizationId),
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
