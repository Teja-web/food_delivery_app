/**
 * SkillAutonomy — current autonomy level per (skill, project) pair.
 *
 * Updated by `recomputeSkillAutonomy()` in `src/operations/skill-autonomy.ts`,
 * which reads the trailing 30-day window of `skill_outcomes` filtered to the
 * same (skillId, projectId) pair and applies promotion/demotion rules.
 *
 * Levels:
 *   0 = intern    (read-only, no auto-approve)
 *   1 = junior    (PRs need human review)
 *   2 = senior    (auto-merge low-complexity changes)
 *   3 = principal (minimal oversight)
 *
 * Trust is per-project: a skill that earns senior-level on a docs-only repo
 * restarts at intern on a payments service. NULL projectId is reserved for
 * legacy / org-wide rows; new code paths must always populate it.
 *
 * New (skill, project) pairs default to level 0 — `getSkillAutonomy()`
 * returns an in-memory default if no row exists yet, so callers don't need
 * to seed.
 */

import { text, timestamp, integer, unique, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { skills } from "./skill";
import { projects } from "./project";

export const skillAutonomy = cozntSchema.table(
  "skill_autonomy",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),

    level: integer().notNull().default(0),
    levelSetAt: timestamp("level_set_at").defaultNow().notNull(),
    lastReviewedAt: timestamp("last_reviewed_at"),
    nextReviewAt: timestamp("next_review_at"),
    lastReason: text("last_reason"),
  },
  (table) => [
    unique("skill_autonomy_skill_project_unique")
      .on(table.skillId, table.projectId)
      .nullsNotDistinct(),
    index("skill_autonomy_skill_idx").on(table.skillId),
    index("skill_autonomy_project_idx").on(table.projectId),
  ],
);

export type SkillAutonomy = typeof skillAutonomy.$inferSelect;
export type NewSkillAutonomy = typeof skillAutonomy.$inferInsert;
