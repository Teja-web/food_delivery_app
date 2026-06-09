/**
 * Plan Artifact — the universal governance subject.
 *
 * One table for all nine kinds: epic, feature, story, spec, adr, test_plan,
 * release_plan, risk_register, incident. Per-kind structured fields live in
 * `details` JSONB (validated by Zod schemas in `lib/plan/schemas.ts`).
 *
 * Hierarchy (Epic → Feature → Story, ADR supersession, etc.) lives in
 * `plan_relationships` — there is no privileged `parentPlanId` column.
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

export const planArtifacts = cozntSchema.table(
  "plan_artifacts",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    kind: text().$type<PlanKind>().notNull(),
    slug: text().notNull(),

    title: text().notNull(),
    summary: text(),
    body: text().notNull().default(""),

    /** Per-kind structured fields. Shape per `kind`; see `lib/plan/schemas.ts`. */
    details: jsonb().$type<Record<string, unknown>>(),

    status: text().$type<PlanStatus>().notNull().default("draft"),
    priority: text().$type<PlanPriority>(),
    effortEstimate: text("effort_estimate"),
    dueDate: timestamp("due_date"),

    classifications: text().array().$type<PlanClassification[]>(),

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

    /**
     * File-canonical authoring path per docs/spec/dev-authoring-surface.md §19.
     * Non-null = the artifact is the import of a .agents/plans/<kind>/*.md (or
     * well-known path) file; definition fields (title, summary, body, details,
     * relationships) are only writable by the merge webhook. Runtime state
     * (status, assigneeId, governance_records) stays editable.
     */
    claimedPath: text("claimed_path"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("plan_artifacts_org_idx").on(table.organizationId),
    index("plan_artifacts_project_status_idx").on(table.projectId, table.status),
    index("plan_artifacts_kind_status_idx").on(table.kind, table.status),
    index("plan_artifacts_generated_by_skill_idx").on(table.generatedBySkillId),
    index("plan_artifacts_claimed_path_idx").on(table.projectId, table.claimedPath),
    uniqueIndex("plan_artifacts_project_kind_slug_idx").on(table.projectId, table.kind, table.slug),
    index("plan_artifacts_fts_idx").using(
      "gin",
      sql`coznt.fts_vector(${table.title}, ${table.summary}, ${table.body})`,
    ),
  ],
);

export type PlanArtifact = typeof planArtifacts.$inferSelect;
export type NewPlanArtifact = typeof planArtifacts.$inferInsert;
