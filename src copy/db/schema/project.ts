/**
 * Project — thin delivery container.
 *
 * Multi-repo + multi-environment per project. Repo/tracker links live in
 * `repositories`; deploy targets live in `environments`. No phase column —
 * SDLC progression is expressed through project-task status, not project
 * state.
 */

import { boolean, jsonb, text, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";

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

    status: text().$type<ProjectStatus>().notNull().default("active"),

    /** Default approvers when no policy-level override applies. */
    defaultApproverIds: text("default_approver_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),

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
     * decided "approved" governance record — even if the originating skill's
     * autonomy would normally clear the change.
     */
    requireHumanApprovalForMerge: boolean("require_human_approval_for_merge")
      .notNull()
      .default(false),

    /** Per-project autonomy config overrides (skill → minLevel). */
    autonomyConfig: jsonb("autonomy_config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

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
