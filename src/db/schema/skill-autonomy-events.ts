/**
 * SkillAutonomyEvent — append-only log of autonomy ladder transitions.
 *
 * Every promotion or demotion in `skill_autonomy` writes one row here so
 * we can render per-skill / per-project autonomy history without scanning
 * the outcome ledger and re-deriving levels. The row carries the
 * triggering outcomes (the window snapshot) so the "why did this skill
 * get demoted?" question is answerable from a single row.
 *
 * Producer: `recomputeSkillAutonomy()` in `src/operations/skill-autonomy.ts`
 *   — fires inside the same DB roundtrip as the skill_autonomy upsert
 *     when the level changes.
 * Consumers: `/me` dashboard (recent events feed), skill detail page
 *   (heatmap / streaks), autonomy event source-of-record writeback.
 *
 * Append-only: no updates, no soft delete, no `updatedAt`. The whole
 * point is an unforgeable audit trail of "what changed when."
 */

import { text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { skills } from "./skill";
import { projects } from "./project";

export const SKILL_AUTONOMY_DIRECTIONS = ["promoted", "demoted"] as const;
export type SkillAutonomyDirection = (typeof SKILL_AUTONOMY_DIRECTIONS)[number];

export const skillAutonomyEvents = cozntSchema.table(
  "skill_autonomy_events",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    /** Null for the legacy / org-wide branch (matches skill_autonomy semantics). */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    direction: text().$type<SkillAutonomyDirection>().notNull(),
    fromLevel: integer("from_level").notNull(),
    toLevel: integer("to_level").notNull(),

    /**
     * Human-readable reason carried over from `skill_autonomy.lastReason`
     * (e.g. "promoted to lead: 94% success across 18 runs (30d)").
     */
    reason: text().notNull(),

    /**
     * IDs of the `skill_outcomes` rows in the trailing window that drove
     * this transition. Array column rather than join table — outcome rows
     * are append-only and we only ever read this list together with the
     * event row.
     */
    triggeringOutcomeIds: text("triggering_outcome_ids").array().notNull().default(sql`'{}'`),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("skill_autonomy_events_skill_time_idx").on(table.skillId, table.createdAt),
    index("skill_autonomy_events_project_time_idx").on(table.projectId, table.createdAt),
    index("skill_autonomy_events_org_time_idx").on(table.organizationId, table.createdAt),
  ],
);

export type SkillAutonomyEvent = typeof skillAutonomyEvents.$inferSelect;
export type NewSkillAutonomyEvent = typeof skillAutonomyEvents.$inferInsert;
