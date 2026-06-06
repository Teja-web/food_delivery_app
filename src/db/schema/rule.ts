/**
 * Rule — a constraint that agents validate against on demand.
 *
 * Stored as markdown with YAML-frontmatter conventions. Served over the
 * HTTP API (and optionally synced to a project repo as `.coznt/rules/*.md`).
 * `projectId` null = org-wide rule applied to every project.
 */

import { text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const RULE_SEVERITIES = ["info", "warn", "error"] as const;
export type RuleSeverity = (typeof RULE_SEVERITIES)[number];

export const rules = cozntSchema.table(
  "rules",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /** null = applies to every project in the org. */
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    slug: text().notNull(),
    title: text().notNull(),
    body: text().notNull(),

    /** Free-form tag list (e.g. ["security", "pr-checklist"]). */
    tags: text().array(),
    severity: text().$type<RuleSeverity>().notNull().default("warn"),
    enabled: boolean().notNull().default(true),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("rules_org_idx").on(table.organizationId),
    index("rules_project_idx").on(table.projectId),
    index("rules_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.body})`,
    ),
  ],
);

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
