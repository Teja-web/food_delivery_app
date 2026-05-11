"use server";

import { workItemCrud, listWorkItemsForPlan, upsertWorkItem } from "@/operations/work-items";

export async function listWorkItems(opts: { offset?: number; limit?: number } = {}) {
  return workItemCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "lastSyncedAt", sortOrder: "desc" });
}

export async function getWorkItem(id: string) {
  return workItemCrud.get(id);
}

export { listWorkItemsForPlan, upsertWorkItem };
