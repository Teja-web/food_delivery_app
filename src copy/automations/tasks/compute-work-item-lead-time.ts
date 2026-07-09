/**
 * computeWorkItemLeadTime — fired by work_items.update.
 *
 * When status transitions into a terminal state ("done" / "closed" /
 * "resolved"), record `(updatedAt - createdAt)` as a `lead_time` metric.
 * Re-runs are cheap — the metric is just appended; downstream aggregation
 * handles dedupe by entity.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { workItems } from "@/db/schema/work-item";
import { metrics } from "@/db/schema/metric";
import type { TaskParams } from "@/automations/task-router";

const TERMINAL_STATUSES = new Set(["done", "closed", "resolved", "merged"]);

export async function computeWorkItemLeadTime(params: TaskParams): Promise<void> {
  const oldData = params.data as { status?: string } | undefined;
  // The CrudEvent passes newData under `data`. Old status comes from the previous row in PG.
  // For simplicity we infer based on the *current* status alone — a duplicate
  // metric on re-update is acceptable given how infrequent terminal flips are.
  const newStatus = oldData?.status?.toLowerCase();
  if (!newStatus || !TERMINAL_STATUSES.has(newStatus)) return;

  const [row] = await db
    .select()
    .from(workItems)
    .where(eq(workItems.id, params.entityId))
    .limit(1);
  if (!row) return;

  const leadTimeHours = (row.updatedAt.getTime() - row.createdAt.getTime()) / 3_600_000;
  if (leadTimeHours < 0) return;

  await db.insert(metrics).values({
    organizationId: row.organizationId,
    projectId: row.projectId,
    type: "lead_time",
    value: leadTimeHours,
    unit: "hours",
    metadata: {
      workItemId: row.id,
      source: row.source,
      externalId: row.externalId,
      kind: row.kind,
    },
    recordedAt: row.updatedAt,
  });
}
