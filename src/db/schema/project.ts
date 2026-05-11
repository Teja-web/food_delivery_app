/**
 * Project — top-level container for a unit of SDLC work.
 *
 * Each project lives in one org, has a current `phase`, and links out to
 * external systems (repo, Jira project, ADO project, Confluence space).
 */

import { text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

export const PROJECT_PHASES = [
  "requirements",
  "design",
  "development",
  "testing",
  "cicd",
  "monitoring",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const PROJECT_STATUSES = ["active", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = cozntSchema.table(
  "projects",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    name: text().notNull(),
    slug: text().notNull(),
    description: text(),

    phase: text().$type<ProjectPhase>().notNull().default("requirements"),
    status: text().$type<ProjectStatus>().notNull().default("active"),

    // External system links — optional; per-org integration credentials live in
    // the `integrations` table.
    repoUrl: text("repo_url"),
    jiraProjectKey: text("jira_project_key"),
    adoProjectId: text("ado_project_id"),
    confluenceSpaceKey: text("confluence_space_key"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("projects_org_idx").on(table.organizationId),
    unique("projects_org_slug_unique").on(table.organizationId, table.slug),
    index("projects_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.name}, ${table.description})`,
    ),
  ],
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
