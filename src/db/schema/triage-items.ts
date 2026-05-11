import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";

export const triageItems = dillizntSchema.table("triage_items", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  type: text("type").notNull(),
  urgency: text("urgency").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  roleId: text("role_id"),
  candidateId: text("candidate_id"),
  interviewId: text("interview_id"),
  applicationId: text("application_id"),
  action: text("action"),
  actionTaskId: text("action_task_id"),
  actionParams: jsonb("action_params").$type<Record<string, unknown>>(),
  status: text("status").notNull().default("active"),
  resolvedAt: timestamp("resolved_at"),
  executedAt: timestamp("executed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_triage_org_idx").on(table.organizationId),
  index("recruit_triage_status_idx").on(table.status),
  index("recruit_triage_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.title}, ${table.subtitle}, ${table.action})`),
]);

export type TriageItem = typeof triageItems.$inferSelect;
export type NewTriageItem = typeof triageItems.$inferInsert;
