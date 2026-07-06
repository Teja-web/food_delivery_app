/**
 * Test Run — an execution of a test suite on a specific commit.
 *
 * Distinct from `project_tasks.kind=test_plan` (the *strategy doc*) — this is
 * the *result*. CI posts after each test job.
 */

import { text, integer, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import { projectTasks } from "./plan/project-task";

export const TEST_RUN_STATUSES = ["passed", "failed", "errored", "skipped"] as const;
export type TestRunStatus = (typeof TEST_RUN_STATUSES)[number];

export const testRuns = cozntSchema.table(
  "test_runs",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    /** Optional link to the test_plan this run executes. */
    projectTaskId: text("project_tasks_id").references(() => projectTasks.id, {
      onDelete: "set null",
    }),

    suite: text(),
    commitSha: text("commit_sha"),
    branch: text(),

    status: text().$type<TestRunStatus>().notNull(),
    total: integer().notNull().default(0),
    passed: integer().notNull().default(0),
    failed: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    durationMs: integer("duration_ms"),
    /** Reported coverage 0–1. Stored separately so the `coverage` gate can read it. */
    coverage: doublePrecision(),
    ciRunUrl: text("ci_run_url"),
    raw: jsonb(),

    ranAt: timestamp("ran_at").defaultNow().notNull(),
  },
  (table) => [
    index("test_runs_project_time_idx").on(table.projectId, table.ranAt),
    index("test_runs_project_status_idx").on(table.projectId, table.status, table.ranAt),
    index("test_runs_project_tasks_idx").on(table.projectTaskId),
  ],
);

export type TestRun = typeof testRuns.$inferSelect;
export type NewTestRun = typeof testRuns.$inferInsert;
