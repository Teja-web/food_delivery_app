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

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { projects } from "./project";

export const PLAN_KINDS = [
  "requirement",
  "adr",
  "feature_plan",
  "test_plan",
  "release_plan",
  "incident",
] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_PRIORITIES = ["p0", "p1", "p2", "p3"] as const;
export type PlanPriority = (typeof PLAN_PRIORITIES)[number];

export const plans = dillizntSchema.table(
  "plans",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    kind: text().$type<PlanKind>().notNull(),
    slug: text(),

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
    index("plans_kind_status_idx").on(table.kind, table.status),
    index("plans_fts_idx").using(
      "gin",
      sql`dilliznt.fts_vector(${table.title}, ${table.summary}, ${table.body})`,
    ),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
