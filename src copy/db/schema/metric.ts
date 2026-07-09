/**
 * Metric — time-series engineering data point.
 *
 * Recorded by webhook handlers (GitHub deploy success → DEPLOYMENT_FREQUENCY)
 * and worker tasks (PR merged → LEAD_TIME). Drives DORA dashboards and
 * coverage / quality gates.
 */

import { text, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";

export const METRIC_TYPES = [
  "lead_time",
  "deployment_frequency",
  "mttr",
  "change_failure_rate",
  "cycle_time",
  "pr_merge_time",
  "build_duration",
  "test_coverage",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const metrics = cozntSchema.table(
  "metrics",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    type: text().$type<MetricType>().notNull(),
    value: doublePrecision().notNull(),
    unit: text(),
    metadata: jsonb().$type<Record<string, unknown>>(),

    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => [
    index("metrics_project_type_time_idx").on(table.projectId, table.type, table.recordedAt),
    index("metrics_org_time_idx").on(table.organizationId, table.recordedAt),
  ],
);

export type Metric = typeof metrics.$inferSelect;
export type NewMetric = typeof metrics.$inferInsert;
