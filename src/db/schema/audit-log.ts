/**
 * Audit Log — append-only record of every state change of interest.
 *
 * Distinct from `automation_logs` (which logs worker task execution): this
 * captures *what happened to an entity*, by whom, at the domain level
 * (e.g. "plan.status moved from in_review to approved").
 *
 * Hash chain (Milestone B): every row carries `row_hash` = sha256 of
 * `prev_hash || canonical_field_concat`, per-org. The chain is maintained
 * by the `coznt.audit_log_chain` BEFORE INSERT trigger using a per-org
 * advisory lock, so concurrent inserts serialize cheaply within an org
 * but run freely across orgs. Tampering with any row breaks the chain
 * at the next row; `verifyAuditChain()` walks the rows in created_at
 * order and reports the first divergence.
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

    /**
     * sha256 hex of `prev_hash || canonical_field_concat`. Populated by the
     * `coznt.audit_log_chain` BEFORE INSERT trigger; any value supplied by
     * the inserting code is overwritten.
     */
    rowHash: text("row_hash"),
    /** `row_hash` of the previous row in this org's chain (null on genesis). */
    prevHash: text("prev_hash"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_logs_org_idx").on(table.organizationId, table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
