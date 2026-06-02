/**
 * Intelligence — generic AI-generated annotations attached to any entity.
 *
 * `(entityType, entityId, kind)` is the natural key (e.g. plan/abc123/summary).
 * `data` holds the structured payload (validated by the producing agent's
 * Zod schema). Each row references its origin `automation_log` row via
 * `lastRunId` so the UI can link back to the run that produced it.
 */

import { text, timestamp, integer, jsonb, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { automationLog } from "./audit/automation-log";

export const intelligence = cozntSchema.table(
  "intelligence",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    kind: text().notNull(),

    summary: text(),
    body: text(),
    data: jsonb().$type<Record<string, unknown>>(),

    modelId: text("model_id"),
    evaluationCount: integer("evaluation_count").notNull().default(0),
    lastRunId: text("last_run_id").references(() => automationLog.id),
    lastEvaluatedAt: timestamp("last_evaluated_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("intelligence_entity_idx").on(table.entityType, table.entityId),
    index("intelligence_org_idx").on(table.organizationId),
    unique("intelligence_entity_kind_unique").on(table.entityType, table.entityId, table.kind),
    index("intelligence_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.summary}, ${table.body})`,
    ),
  ],
);

export type Intelligence = typeof intelligence.$inferSelect;
export type NewIntelligence = typeof intelligence.$inferInsert;
