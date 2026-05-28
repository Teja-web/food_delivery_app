/**
 * Project — top-level container for a unit of SDLC work.
 *
 * Each project lives in one org, has a current `phase`, and links out to
 * external systems (repo, Jira project, ADO project, Confluence space).
 */

import { boolean, text, timestamp, index, unique } from "drizzle-orm/pg-core";
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

    // Execution-gate inputs (docs/execution-gate-plan.md). Empty defaults
    // are permissive; the gate's change-risk heuristic upgrades a PR's
    // risk class when any changed file matches a critical-path glob.
    criticalPaths: text("critical_paths").array().notNull().default(sql`ARRAY[]::text[]`),
    productionCriticalPaths: text("production_critical_paths")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

    /**
     * When true, the execution gate forces `failure` on any PR that lacks a
     * decided "approved" row in `approvals` — even if the originating skill's
     * autonomy would normally clear the change. Per-project so customers can
     * lock down sensitive projects (production / regulated) while keeping
     * lighter projects autonomy-only. Defaults to false to preserve the
     * pre-existing autonomy-only behavior.
     */
    requireHumanApprovalForMerge: boolean("require_human_approval_for_merge")
      .notNull()
      .default(false),

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
