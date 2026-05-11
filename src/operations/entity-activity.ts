/**
 * Entity Activity — generic activity feed from automation_log.
 *
 * Queries execution log entries for an entity and optionally its related
 * entities. Each entry includes run references so the UI can link to the
 * structured intelligence record that was produced.
 */

import { db } from "@/db/client";
import { automationLog } from "@/db/schema";
import { desc, and, eq, inArray, or, sql } from "drizzle-orm";

interface ActivityEntry {
  id: string;
  taskId: string;
  entityType: string | null;
  entityId: string | null;
  status: string;
  durationMs: number | null;
  outputTable: string | null;
  outputId: string | null;
  outputAction: string | null;
  traceId: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

interface RelatedEntities {
  /** e.g. { application: ["app-1", "app-2"], match: ["m-1"] } */
  [entityType: string]: string[];
}

/**
 * Get activity log entries for an entity and optionally its related entities.
 *
 * Usage:
 *   // Just direct activity
 *   getEntityActivity("role", roleId)
 *
 *   // With related entities
 *   getEntityActivity("role", roleId, {
 *     related: { application: appIds, match: matchIds },
 *   })
 */
export async function getEntityActivity(
  entityType: string,
  entityId: string,
  opts?: { related?: RelatedEntities; limit?: number },
): Promise<ActivityEntry[]> {
  const limit = opts?.limit ?? 50;

  // Build OR conditions: direct entity + each related entity type
  const conditions = [
    and(eq(automationLog.entityType, entityType), eq(automationLog.entityId, entityId)),
  ];

  if (opts?.related) {
    for (const [relType, relIds] of Object.entries(opts.related)) {
      if (relIds.length > 0) {
        conditions.push(
          and(eq(automationLog.entityType, relType), inArray(automationLog.entityId, relIds)),
        );
      }
    }
  }

  const rows = await db
    .select({
      id: automationLog.id,
      taskId: automationLog.taskId,
      entityType: automationLog.entityType,
      entityId: automationLog.entityId,
      status: automationLog.status,
      durationMs: automationLog.durationMs,
      outputTable: automationLog.outputTable,
      outputId: automationLog.outputId,
      outputAction: automationLog.outputAction,
      traceId: automationLog.traceId,
      createdAt: automationLog.createdAt,
      completedAt: automationLog.completedAt,
    })
    .from(automationLog)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .orderBy(desc(automationLog.createdAt))
    .limit(limit);

  return rows;
}

/**
 * Get full execution trace — all log entries sharing a traceId.
 */
async function getExecutionTrace(traceId: string): Promise<ActivityEntry[]> {
  return db
    .select({
      id: automationLog.id,
      taskId: automationLog.taskId,
      entityType: automationLog.entityType,
      entityId: automationLog.entityId,
      status: automationLog.status,
      durationMs: automationLog.durationMs,
      outputTable: automationLog.outputTable,
      outputId: automationLog.outputId,
      outputAction: automationLog.outputAction,
      traceId: automationLog.traceId,
      createdAt: automationLog.createdAt,
      completedAt: automationLog.completedAt,
    })
    .from(automationLog)
    .where(eq(automationLog.traceId, traceId))
    .orderBy(automationLog.createdAt);
}
