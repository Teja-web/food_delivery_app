/**
 * SkillAutonomy — current autonomy level per skill.
 *
 * One row per skill (PK = skillId). Updated by `recomputeSkillAutonomy()` in
 * `src/operations/skill-autonomy.ts`, which reads the trailing 30-day window
 * of `skill_outcomes` and applies promotion/demotion rules.
 *
 * Levels:
 *   0 = intern    (read-only, no auto-approve)
 *   1 = junior    (PRs need human review)
 *   2 = senior    (auto-merge low-complexity changes)
 *   3 = principal (minimal oversight)
 *
 * New skills default to level 0 — `getSkillAutonomy()` returns an in-memory
 * default if no row exists yet, so callers don't need to seed.
 */

import { text, timestamp, integer } from "drizzle-orm/pg-core";
import { cozntSchema } from "./schema";
import { skills } from "./skill";

export const skillAutonomy = cozntSchema.table("skill_autonomy", {
  skillId: text("skill_id")
    .primaryKey()
    .references(() => skills.id, { onDelete: "cascade" }),
  organizationId: text("organization_id").notNull(),

  level: integer().notNull().default(0),
  levelSetAt: timestamp("level_set_at").defaultNow().notNull(),
  lastReviewedAt: timestamp("last_reviewed_at"),
  nextReviewAt: timestamp("next_review_at"),
  lastReason: text("last_reason"),
});

export type SkillAutonomy = typeof skillAutonomy.$inferSelect;
export type NewSkillAutonomy = typeof skillAutonomy.$inferInsert;
