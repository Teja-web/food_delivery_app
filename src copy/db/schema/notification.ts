/**
 * Notification — in-app + email delivery queue.
 *
 * Created by the worker (e.g. after an approval changes state). The web UI
 * subscribes via SSE; an email channel can ship them on a delay.
 */

import { text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

export const NOTIFICATION_CHANNELS = ["in_app", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const notifications = cozntSchema.table(
  "notifications",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    recipientId: text("recipient_id").notNull(),

    channel: text().$type<NotificationChannel>().notNull().default("in_app"),
    subject: text(),
    body: text().notNull(),
    /** Deep link into the app. */
    link: text(),

    entityType: text("entity_type"),
    entityId: text("entity_id"),

    read: boolean().notNull().default(false),
    readAt: timestamp("read_at"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_recipient_idx").on(table.recipientId, table.read, table.createdAt),
    index("notifications_org_idx").on(table.organizationId),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
