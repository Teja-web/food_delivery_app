import { text, integer, timestamp, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { dillizntSchema } from "./schema";
import { roles } from "./roles";
import { candidates } from "./candidates";
import { matches } from "./matches";

export const PIPELINE_STAGES = ["sourced", "interview", "offer", "hired", "rejected", "withdrawn"] as const;
export type PipelineStage = typeof PIPELINE_STAGES[number];

export const applications = dillizntSchema.table("applications", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),
  organizationId: text("organization_id").notNull(),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  candidateId: text("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  /** Link to the living match intelligence. Null for manually-added candidates with no prior match. */
  matchId: text("match_id").references(() => matches.id, { onDelete: "set null" }),
  stage: text("stage").notNull().default("sourced"),
  hiredAt: timestamp("hired_at"),
  daysInStage: integer("days_in_stage"),
  source: text("source"),
  /**
   * Vendor org id (auth.organization) when the submission came from a vendor;
   * NULL for internal submissions. Load-bearing for vendor scoping
   * (vendor-and-attribution-plan.md Phase 3).
   */
  submittedByOrgId: text("submitted_by_org_id"),
  actorType: text("actor_type"),
  actorId: text("actor_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdById: text("created_by_id"),
  createdByName: text("created_by_name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedById: text("updated_by_id"),
  updatedByName: text("updated_by_name"),
}, (table) => [
  index("recruit_pipeline_org_idx").on(table.organizationId),
  index("recruit_pipeline_org_vendor_idx").on(table.organizationId, table.submittedByOrgId),
  index("recruit_pipeline_role_idx").on(table.roleId),
  index("recruit_pipeline_candidate_idx").on(table.candidateId),
  index("recruit_pipeline_stage_idx").on(table.stage),
  index("recruit_pipeline_match_idx").on(table.matchId),
  unique("recruit_pipeline_role_candidate_uniq").on(table.roleId, table.candidateId),
  index("recruit_pipeline_fts_idx").using("gin", sql`dilliznt.fts_vector(${table.source})`),
]);

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
