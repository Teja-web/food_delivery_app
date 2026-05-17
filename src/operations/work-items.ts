import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { workItems, WORK_ITEM_KINDS, WORK_ITEM_SOURCES } from "@/db/schema/work-item";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const workItemSchema = z.object({
  projectId: z.string().optional().nullable(),
  planId: z.string().optional().nullable(),
  source: z.enum(WORK_ITEM_SOURCES),
  externalId: z.string().min(1),
  externalUrl: z.string().url().optional(),
  kind: z.enum(WORK_ITEM_KINDS).optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.string().optional(),
  assigneeEmail: z.string().email().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
});

export const workItemCrud = createEntityCrud({
  db,
  table: workItems,
  queryKey: "workItems",
  idField: "id",
  schema: workItemSchema,
  searchFields: ["title", "description"],
  onMutate: () => safeRevalidate("/work-items"),
});

export async function listWorkItemsForPlan(planId: string) {
  const ctx = await getActionContext();
  return db.query.workItems.findMany({
    where: and(eq(workItems.planId, planId), eq(workItems.organizationId, ctx.organizationId)),
    orderBy: [desc(workItems.lastSyncedAt), desc(workItems.createdAt)],
  });
}

export async function listWorkItemsForProject(projectId: string, opts: { limit?: number } = {}) {
  const ctx = await getActionContext();
  return db.query.workItems.findMany({
    where: and(eq(workItems.projectId, projectId), eq(workItems.organizationId, ctx.organizationId)),
    orderBy: [desc(workItems.lastSyncedAt), desc(workItems.createdAt)],
    limit: opts.limit ?? 100,
  });
}

/**
 * Upsert by (source, externalId) — used by webhook handlers.
 */
export async function upsertWorkItem(input: z.infer<typeof workItemSchema> & { organizationId: string }) {
  const validated = workItemSchema.parse(input);
  const existing = await db.query.workItems.findFirst({
    where: and(eq(workItems.source, validated.source), eq(workItems.externalId, validated.externalId)),
  });

  if (existing) {
    await db
      .update(workItems)
      .set({ ...validated, lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(eq(workItems.id, existing.id));
    return existing.id;
  }

  const [inserted] = await db
    .insert(workItems)
    .values({ ...validated, organizationId: input.organizationId, lastSyncedAt: new Date() })
    .returning({ id: workItems.id });
  return inserted.id;
}
