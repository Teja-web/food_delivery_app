/**
 * Engagements — simplified engagement table internalized from platform.
 * Replaces platform.engagement_campaigns with ~10 columns.
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const engagements = dillizntSchema.table("engagements", {
  id: text().primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  recipientId: text("recipient_id").notNull(),
  recipientType: text("recipient_type").notNull().default("candidate"),
  type: text().notNull().default("outreach"),
  channel: text().notNull().default("email"),
  subject: text(),
  body: text(),
  status: text().notNull().default("draft"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_engagements_org_idx").on(table.organizationId),
  index("recruit_engagements_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.subject}, ${table.body})`),
]);
