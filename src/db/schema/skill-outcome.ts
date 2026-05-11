/**
 * SkillOutcome — a verdict on a single skill invocation.
 *
 * Append-only ledger. Drives the progressive-autonomy recompute job in
 * `src/operations/skill-autonomy.ts`. Each row records the outcome of one
 * invocation (success / rolled_back / incident) with an optional severity.
 *
 * Producers: `src/operations/skill-invocation.ts` (emits "success" on a clean
 * generate() return and "incident"/"high" on a thrown error).
 * Consumers: `recomputeSkillAutonomy()` reads the trailing 30-day window.
 */

import { text, timestamp, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { skills } from "./skill";

export const SKILL_OUTCOME_VERDICTS = ["success", "rolled_back", "incident"] as const;
export type SkillOutcomeVerdict = (typeof SKILL_OUTCOME_VERDICTS)[number];

export const SKILL_OUTCOME_SEVERITIES = ["low", "high", "critical"] as const;
export type SkillOutcomeSeverity = (typeof SKILL_OUTCOME_SEVERITIES)[number];

export const skillOutcomes = cozntSchema.table(
  "skill_outcomes",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),

    /**
     * Reference to the invoking run id (matches `automation_logs.id` produced
     * by `invokeSkill`). Stored as plain text — automation_logs uses a nanoid
     * for `id` so we don't add a hard FK here to avoid coupling lifecycles.
     */
    invocationId: text("invocation_id"),

    verdict: text().$type<SkillOutcomeVerdict>().notNull(),
    severity: text().$type<SkillOutcomeSeverity>(),

    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => [
    index("skill_outcomes_skill_time_idx").on(table.skillId, table.recordedAt),
    index("skill_outcomes_org_time_idx").on(table.organizationId, table.recordedAt),
  ],
);

export type SkillOutcome = typeof skillOutcomes.$inferSelect;
export type NewSkillOutcome = typeof skillOutcomes.$inferInsert;
