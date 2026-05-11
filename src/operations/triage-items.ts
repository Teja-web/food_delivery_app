import { createEntityCrud } from "@/lib/crud";
import { db } from "@/db/client";
import { triageItems } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { triageItemSchema } from "./schemas";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

const triageCrud = createEntityCrud({
  db,
  table: triageItems,
  queryKey: "triageItems",
  idField: "id",
  schema: triageItemSchema,
  onMutate: () => safeRevalidate("/today"),
  searchFields: ["title", "subtitle", "action"],
});

export const getTriageItems = triageCrud.list;
export const getTriageItem = triageCrud.get;
export const createTriageItem = triageCrud.create;
export const updateTriageItem = triageCrud.update;
export const deleteTriageItem = triageCrud.delete;

/** Get active triage items for a specific role. */
export async function getTriageItemsForRole(roleId: string) {
  const ctx = await getActionContext();
  return db
    .select()
    .from(triageItems)
    .where(
      and(
        eq(triageItems.organizationId, ctx.organizationId),
        eq(triageItems.roleId, roleId),
        eq(triageItems.status, "active"),
      ),
    );
}

/** Get all triage items for an entity (any status), for the activity feed. */
export async function getTriageItemsForEntity(entityType: "role" | "candidate" | "interview" | "application", entityId: string) {
  const ctx = await getActionContext();
  const colMap = {
    role: triageItems.roleId,
    candidate: triageItems.candidateId,
    interview: triageItems.interviewId,
    application: triageItems.applicationId,
  };
  const col = colMap[entityType];
  return db
    .select()
    .from(triageItems)
    .where(
      and(
        eq(triageItems.organizationId, ctx.organizationId),
        eq(col, entityId),
      ),
    )
    .orderBy(triageItems.createdAt);
}

/** Get the fulfilment triage item for a specific role. */
async function getRoleFulfilment(roleId: string) {
  const ctx = await getActionContext();
  const rows = await db
    .select({ title: triageItems.title, action: triageItems.action, urgency: triageItems.urgency })
    .from(triageItems)
    .where(
      and(
        eq(triageItems.organizationId, ctx.organizationId),
        eq(triageItems.roleId, roleId),
        eq(triageItems.type, "fulfilment"),
        eq(triageItems.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export type RoleFulfilment = { title: string; action: string | null; urgency: string };

/** Batch-fetch active fulfilment triage items for many roles. Returns roleId → first item map. */
export async function getRoleFulfilmentsByIds(roleIds: string[]): Promise<Map<string, RoleFulfilment>> {
  if (roleIds.length === 0) return new Map();
  const ctx = await getActionContext();
  const rows = await db
    .select({
      roleId: triageItems.roleId,
      title: triageItems.title,
      action: triageItems.action,
      urgency: triageItems.urgency,
    })
    .from(triageItems)
    .where(
      and(
        eq(triageItems.organizationId, ctx.organizationId),
        inArray(triageItems.roleId, roleIds),
        eq(triageItems.type, "fulfilment"),
        eq(triageItems.status, "active"),
      ),
    )
    .orderBy(triageItems.createdAt);
  const map = new Map<string, RoleFulfilment>();
  for (const r of rows) {
    if (!r.roleId || map.has(r.roleId)) continue;
    map.set(r.roleId, { title: r.title, action: r.action, urgency: r.urgency });
  }
  return map;
}
