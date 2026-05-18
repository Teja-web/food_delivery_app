/**
 * Custom Choreographies — customer-authored workflow guides.
 *
 * Distinct from platform choreographies under
 * `src/automations/skills/<slug>/CHOREOGRAPHY.md` (filesystem, seeded by
 * deployment). These rows are per-org, project-scoped or org-wide,
 * authored via `/choreographies/new` UI or the CRUD API.
 *
 * Distributed alongside platform choreographies by `sync_choreographies`
 * MCP verb; CLI writes them to `<repo>/.coznt/skills/custom/<slug>/SKILL.md`.
 */

import { text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const customChoreographies = cozntSchema.table(
  "custom_choreographies",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = org-wide; visible to every project in the org. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    slug: text().notNull(),
    name: text().notNull(),
    /** Full markdown body — YAML frontmatter + workflow guide. Linted on write. */
    body: text().notNull(),
    version: text().notNull().default("1.0.0"),

    enabled: boolean().notNull().default(true),
    deletedAt: timestamp("deleted_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    updatedById: text("updated_by_id"),
    updatedByName: text("updated_by_name"),
  },
  (table) => [
    uniqueIndex("custom_choreographies_org_slug_uniq").on(table.organizationId, table.slug),
    index("custom_choreographies_project_idx").on(table.projectId),
    index("custom_choreographies_org_idx").on(table.organizationId),
  ],
);

export type CustomChoreography = typeof customChoreographies.$inferSelect;
export type NewCustomChoreography = typeof customChoreographies.$inferInsert;
