/**
 * Project Task - the universal governance subject.
 *
 * One table for all nine kinds: epic, feature, story, spec, adr, test_plan,
 * release_plan, risk_register, incident. Per-kind structured fields live in
 * `metadata` JSONB (validated by Zod schemas in `lib/plan/schemas.ts`).
 *
 * Hierarchy (Epic -> Feature -> Story, ADR supersession, etc.) lives in
 * `plan_relationships`; there is no privileged `parentPlanId` column.
 */

import { text, timestamp, jsonb, boolean, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projects } from "../project";
import { skills } from "../skill/skill";
import {
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_STATUSES,
  PLAN_PRIORITIES,
  PLAN_CLASSIFICATIONS,
  PLAN_RELATIONSHIP_KINDS,
  type PlanKind,
  type PlanStatus,
  type PlanPriority,
  type PlanClassification,
  type PlanRelationshipKind,
} from "./plan-kinds";

export {
  PLAN_KINDS,
  PLAN_KIND_PARENTS,
  PLAN_STATUSES,
  PLAN_PRIORITIES,
  PLAN_CLASSIFICATIONS,
  PLAN_RELATIONSHIP_KINDS,
  type PlanKind,
  type PlanStatus,
  type PlanPriority,
  type PlanClassification,
  type PlanRelationshipKind,
};

export const projectTasks = cozntSchema.table(
  "project_tasks",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    kind: text().$type<PlanKind>().notNull(),
    slug: text().notNull(),

    title: text().notNull(),
    summary: text(),
    body: text().notNull().default(""),

    /** Per-kind structured fields and migrated legacy metadata. */
    metadata: jsonb().$type<Record<string, unknown>>(),

    status: text().$type<PlanStatus>().notNull().default("draft"),
    priority: text().$type<PlanPriority>(),
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

    aiAuthored: boolean("ai_authored").notNull().default(false),
    generatedByModel: text("generated_by_model"),
    generatedBySkillId: text("generated_by_skill_id").references(() => skills.id, {
      onDelete: "set null",
    }),
    autonomyAtGeneration: integer("autonomy_at_generation"),
    promptHash: text("prompt_hash"),
    generatedAt: timestamp("generated_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("project_tasks_org_idx").on(table.organizationId),
    index("project_tasks_project_status_idx").on(table.projectId, table.status),
    index("project_tasks_kind_status_idx").on(table.kind, table.status),
    index("project_tasks_generated_by_skill_idx").on(table.generatedBySkillId),
    uniqueIndex("project_tasks_project_kind_slug_idx").on(table.projectId, table.kind, table.slug),
    index("project_tasks_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.summary}, ${table.body})`,
    ),
  ],
);

export type ProjectTask = typeof projectTasks.$inferSelect;
export type NewProjectTask = typeof projectTasks.$inferInsert;
