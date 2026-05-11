/**
 * Deployment — a record that "version X reached environment Y at time Z".
 *
 * Distinct from `plans.kind=release_plan` (the *plan* for a release) — this
 * is the *event*. CI posts on success/failure; the row also drives
 * `deployment_frequency` and `change_failure_rate` metrics.
 */

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import { plans } from "./plan";

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
    /** Optional link to the release_plan that produced this deploy. */
    planId: text("plan_id").references(() => plans.id, { onDelete: "set null" }),

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
    index("deployments_plan_idx").on(table.planId),
  ],
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
