/**
 * Audit Log — append-only record of every state change of interest.
 *
 * Distinct from `automation_logs` (which logs worker task execution): this
 * captures *what happened to an entity*, by whom, at the domain level
 * (e.g. "plan.status moved from in_review to approved").
 */

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

export const AUDIT_ACTOR_TYPES = ["user", "system", "integration", "api"] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const auditLogs = cozntSchema.table(
  "audit_logs",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    actorType: text("actor_type").$type<AuditActorType>().notNull(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),

    action: text().notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),

    summary: text(),
    before: jsonb(),
    after: jsonb(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_logs_org_idx").on(table.organizationId, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
