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

import { text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { skills } from "./skill";
import { projects } from "./project";

export const SKILL_OUTCOME_VERDICTS = ["success", "rolled_back", "incident"] as const;
export type SkillOutcomeVerdict = (typeof SKILL_OUTCOME_VERDICTS)[number];

export const SKILL_OUTCOME_SEVERITIES = ["low", "high", "critical"] as const;
export type SkillOutcomeSeverity = (typeof SKILL_OUTCOME_SEVERITIES)[number];

/**
 * Discriminator for *how* the outcome was derived. `invocation` is the
 * existing AI-call path; the rest are Milestone-A deterministic assessors
 * over observed GitHub signal. Adding a kind requires updating the
 * idempotency contract on `source_ref` below.
 */
export const SKILL_OUTCOME_SOURCE_KINDS = [
  "invocation",
  "pr_merge",
  "pr_revert",
  "pr_abandon",
  "deploy_clean",
  "deploy_incident",
] as const;
export type SkillOutcomeSourceKind = (typeof SKILL_OUTCOME_SOURCE_KINDS)[number];

export const skillOutcomes = cozntSchema.table(
  "skill_outcomes",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    skillId: text("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "cascade" }),

    /**
     * Project the outcome was produced for. Autonomy is scored per
     * (skill, project) pair. NULL is reserved for legacy / org-wide
     * outcomes; new code paths must always populate this.
     */
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),

    /**
     * Reference to the invoking run id (matches `automation_logs.id` produced
     * by `invokeSkill`). Stored as plain text — automation_logs uses a nanoid
     * for `id` so we don't add a hard FK here to avoid coupling lifecycles.
     */
    invocationId: text("invocation_id"),

    verdict: text().$type<SkillOutcomeVerdict>().notNull(),
    severity: text().$type<SkillOutcomeSeverity>(),

    /**
     * How this outcome was derived. Null on legacy rows; new code paths set
     * it. Combined with `sourceRef` it gives Milestone-A assessors a stable
     * idempotency key (see partial unique index below).
     */
    sourceKind: text("source_kind").$type<SkillOutcomeSourceKind>(),

    /**
     * Stable reference to the originating signal — e.g.
     *   `github:acme/api#42`   for PR-derived outcomes
     *   `deployment:<id>`      for deploy-derived outcomes
     * Required for non-`invocation` rows; the partial unique index below
     * enforces idempotency on `(skill_id, source_kind, source_ref)`.
     */
    sourceRef: text("source_ref"),

    /** Human-readable explanation written by the assessor. */
    rationale: text(),

    recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  },
  (table) => [
    index("skill_outcomes_skill_time_idx").on(table.skillId, table.recordedAt),
    index("skill_outcomes_org_time_idx").on(table.organizationId, table.recordedAt),
    index("skill_outcomes_project_skill_time_idx").on(
      table.projectId,
      table.skillId,
      table.recordedAt,
    ),
    // Idempotency: assessors that re-fire on retry must not double-write.
    // The index is partial because `invocation`-kind rows can repeat per
    // run (they have invocationId, not a stable sourceRef).
    uniqueIndex("skill_outcomes_source_unique_idx")
      .on(table.skillId, table.sourceKind, table.sourceRef)
      .where(sql`${table.sourceRef} is not null`),
  ],
);

export type SkillOutcome = typeof skillOutcomes.$inferSelect;
export type NewSkillOutcome = typeof skillOutcomes.$inferInsert;
