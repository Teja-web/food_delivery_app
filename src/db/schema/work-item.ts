/**
 * Work Item — a record mirroring an external system's issue/PR/story.
 *
 * `source` says which system (`github`, `jira`, `ado`, `confluence`).
 * `externalId` uniquely identifies the artifact in that system. Optional
 * `planId` links the work item back to the coznt plan it implements.
 */

import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import { plans } from "./plan";

export const WORK_ITEM_SOURCES = ["github", "jira", "ado", "confluence"] as const;
export type WorkItemSource = (typeof WORK_ITEM_SOURCES)[number];

export const WORK_ITEM_KINDS = [
  "issue",
  "pull_request",
  "story",
  "task",
  "bug",
  "epic",
  "page",
] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];

export const workItems = cozntSchema.table(
  "work_items",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),

    source: text().$type<WorkItemSource>().notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),

    kind: text().$type<WorkItemKind>(),
    title: text().notNull(),
    description: text(),
    status: text(),
    assigneeEmail: text("assignee_email"),
    /** Raw payload from the upstream API for forward-compatibility. */
    raw: jsonb(),

    lastSyncedAt: timestamp("last_synced_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("work_items_org_idx").on(table.organizationId),
    index("work_items_project_idx").on(table.projectId),
    index("work_items_plan_idx").on(table.planId),
    unique("work_items_source_external_unique").on(table.source, table.externalId),
    index("work_items_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.description})`,
    ),
  ],
);

export type WorkItem = typeof workItems.$inferSelect;
export type NewWorkItem = typeof workItems.$inferInsert;
