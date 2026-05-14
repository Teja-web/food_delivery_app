/**
 * Plan — the unified work artifact across all six SDLC phases.
 *
 * One table for: requirement, ADR, feature plan, test plan, release plan,
 * incident — discriminated by `kind`. Phase-specific structured fields live
 * in `details` (JSONB validated by a Zod schema in `operations/plans.ts`).
 *
 * `body` holds the canonical markdown. Every edit creates a `plan_revisions`
 * row; the live row's body is also kept here for query efficiency.
 */

import { text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects } from "./project";
import {
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_STATUSES,
  PLAN_PRIORITIES,
  type PlanKind,
  type PlanStatus,
  type PlanPriority,
} from "./plan-kinds";

// Re-exported so existing `@/db/schema/plan` callers keep working. The
// authoritative definitions live in `./plan-kinds.ts` — a leaf with no
// Drizzle imports so the MCP CLI bundle can use them without dragging
// in pg-core.
export {
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_STATUSES,
  PLAN_PRIORITIES,
  type PlanKind,
  type PlanStatus,
  type PlanPriority,
};

export const plans = cozntSchema.table(
  "plans",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    kind: text().$type<PlanKind>().notNull(),
    slug: text(),

    /** Optional rollup: e.g. a story's parent feature, a feature's parent epic. */
    parentPlanId: text("parent_plan_id"),

    title: text().notNull(),
    summary: text(),
    body: text().notNull().default(""),

    /** Phase-specific fields. Shape per `kind`; see `lib/plan/schemas.ts`. */
    details: jsonb().$type<Record<string, unknown>>(),

    status: text().$type<PlanStatus>().notNull().default("draft"),
    priority: text().$type<PlanPriority>(),
    effortEstimate: text("effort_estimate"),
    dueDate: timestamp("due_date"),

    /** External link (Jira issue, GitHub PR, ADO work item, Confluence page). */
    externalRef: text("external_ref"),

    assigneeId: text("assignee_id"),
    assigneeName: text("assignee_name"),
    approvedById: text("approved_by_id"),
    approvedAt: timestamp("approved_at"),

    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    updatedById: text("updated_by_id"),
    updatedByName: text("updated_by_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("plans_org_idx").on(table.organizationId),
    index("plans_project_idx").on(table.projectId),
    index("plans_parent_idx").on(table.parentPlanId),
    index("plans_kind_status_idx").on(table.kind, table.status),
    /**
     * Upsert key for `upsertPlanByKindAndSlug` — the `(project, kind, slug)`
     * triple is the agent-visible identifier. Null slug stays distinct (rows
     * not authored via the upsert path).
     */
    uniqueIndex("plans_project_kind_slug_idx").on(table.projectId, table.kind, table.slug),
    index("plans_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.summary}, ${table.body})`,
    ),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
