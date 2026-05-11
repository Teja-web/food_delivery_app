/**
 * Webhook Event — inbound event log with idempotency.
 *
 * Every webhook delivery (GitHub, Jira, ADO, Confluence) is stored before
 * processing. The `(source, externalId)` unique constraint dedupes retries.
 */

import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const WEBHOOK_SOURCES = ["github", "jira", "ado", "confluence"] as const;
export type WebhookSource = (typeof WEBHOOK_SOURCES)[number];

export const webhookEvents = dillizntSchema.table(
  "webhook_events",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id"),

    source: text().$type<WebhookSource>().notNull(),
    /** Unique delivery id from the upstream platform (used for dedupe). */
    externalId: text("external_id").notNull(),
    event: text().notNull(),
    payload: jsonb().notNull(),

    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    processingError: text("processing_error"),
  },
  (table) => [
    unique("webhook_events_source_external_unique").on(table.source, table.externalId),
    index("webhook_events_unprocessed_idx").on(table.source, table.processedAt),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
