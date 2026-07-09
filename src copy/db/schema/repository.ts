/**
 * Repository — a registered code/tracker source bound to a project.
 *
 * Multi-repo per project: a microservices project can register N repos.
 * Deployments and work items reference `repositoryId`. Replaces the per-
 * project `repoUrl/jiraProjectKey/adoProjectId/confluenceSpaceKey` columns
 * on `projects`.
 *
 * `branchPolicy` JSONB mirrors per-branch reviewer/protection settings
 * (replaces the old `repo_policies` table's three-state policy at the
 * remote level; project-scoped branch policies live here).
 */

import { text, timestamp, jsonb, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const REPOSITORY_SOURCES = ["github", "jira", "ado", "confluence"] as const;
export type RepositorySource = (typeof REPOSITORY_SOURCES)[number];

export const repositories = cozntSchema.table(
  "repositories",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    source: text().$type<RepositorySource>().notNull(),
    /** org/repo, jira key, ado project id, confluence space key. */
    identifier: text().notNull(),
    url: text(),
    defaultBranch: text("default_branch"),

    /** language, size, topics, etc. */
    metadata: jsonb().$type<Record<string, unknown>>(),

    /** Protected branches, required reviewers — mirrors upstream protection. */
    branchPolicy: jsonb("branch_policy").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("repositories_project_idx").on(table.projectId),
    index("repositories_org_idx").on(table.organizationId),
    unique("repositories_project_source_identifier_unique").on(
      table.projectId,
      table.source,
      table.identifier,
    ),
  ],
);

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
