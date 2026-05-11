/**
 * Automation Log — pure execution / audit log.
 *
 * One row per task execution. Tracks what ran, how long it took, whether it
 * succeeded, and — via run references — what structured record it produced.
 */

import { text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { cozntSchema } from "./schema";

export const automationLog = cozntSchema.table("automation_logs", {
  id: text().primaryKey(),
  organizationId: text("organization_id"),

  // What triggered this execution
  entityType: text("entity_type"),
  entityId: text("entity_id"),

  // Execution metadata
  taskId: text("task_id").notNull(),
  traceId: text("trace_id"),
  status: text().notNull(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),

  // Actor
  actorType: text("actor_type"),
  actorId: text("actor_id"),

  // Run references — what this execution produced
  outputTable: text("output_table"),
  outputId: text("output_id"),
  outputAction: text("output_action"), // "created" | "updated"

  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("automation_logs_task_entity_status_idx").on(
    table.taskId, table.entityId, table.status, table.createdAt,
  ),
  index("automation_logs_entity_activity_idx").on(
    table.entityType, table.entityId, table.createdAt,
  ),
  index("automation_logs_output_ref_idx").on(
    table.outputTable, table.outputId,
  ),
  index("automation_logs_trace_idx").on(table.traceId),
]);
