/**
 * Event — domain event log that feeds SSE subscribers.
 *
 * Lightweight, append-only. PG triggers + pgmq drive the worker; this table
 * exists so the UI (and external subscribers) can replay recent events.
 */

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const events = dillizntSchema.table(
  "events",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    kind: text().notNull(),
    summary: text(),
    actorId: text("actor_id"),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    payload: jsonb(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("events_org_kind_idx").on(table.organizationId, table.kind, table.createdAt),
    index("events_entity_idx").on(table.entityType, table.entityId, table.createdAt),
  ],
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
