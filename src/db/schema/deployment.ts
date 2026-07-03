/**
 * Deployment — a record that "version X reached environment Y at time Z".
 *
 * Distinct from `project_tasks.kind=release_plan` (the *plan* for a release) —
 * this is the *event*. CI posts on success/failure; the row also drives
 * `deployment_frequency` and `change_failure_rate` metrics.
 */

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import { projectTasks } from "./plan/project-task";
import { environments } from "./environment";

export const DEPLOYMENT_STATUSES = [
  "pending",
  "in_progress",
  "success",
  "failed",
  "rolled_back",
] as const;
export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number];

export const deployments = cozntSchema.table(
  "deployments",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** Optional link to the release_plan project task. */
    projectTaskId: text("project_tasks_id").references(() => projectTasks.id, {
      onDelete: "set null",
    }),
    /** Optional typed environment. Falls back to `environment` free-text if null. */
    environmentId: text("environment_id").references(() => environments.id, {
      onDelete: "set null",
    }),

    environment: text().notNull(),
    version: text().notNull(),
    commitSha: text("commit_sha"),

    status: text().$type<DeploymentStatus>().notNull().default("pending"),
    deployedById: text("deployed_by_id"),
    deployedByName: text("deployed_by_name"),
    ciRunUrl: text("ci_run_url"),
    notes: text(),
    raw: jsonb(),

    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    rolledBackAt: timestamp("rolled_back_at"),
    rolledBackReason: text("rolled_back_reason"),
  },
  (table) => [
    index("deployments_project_env_time_idx").on(table.projectId, table.environment, table.startedAt),
    index("deployments_project_status_idx").on(table.projectId, table.status, table.startedAt),
    index("deployments_project_tasks_idx").on(table.projectTaskId),
    index("deployments_environment_idx").on(table.environmentId),
  ],
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
