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
  /**
   * Agent-loop signal: emitted when a `prompt_logs` row scores
   * NEEDS_IMPROVEMENT or POOR. Carries `skillId=null`, `verdict=null` —
   * read by `recomputeSkillAutonomyTask` purely for the project-level
   * promotion-attenuation factor.
   */
  "prompt_quality_signal",
] as const;
export type SkillOutcomeSourceKind = (typeof SKILL_OUTCOME_SOURCE_KINDS)[number];

export const skillOutcomes = cozntSchema.table(
  "skill_outcomes",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    /**
     * Skill the outcome was produced for. Required for all source kinds
     * except `prompt_quality_signal`, which is a project-level leading
     * indicator and carries `skillId=null`. CHECK enforced in
     * `assertSkillOutcomeShape` at insert time.
     */
    skillId: text("skill_id").references(() => skills.id, { onDelete: "cascade" }),

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

    /**
     * Outcome verdict. NULL only for `prompt_quality_signal` rows — those
     * are signal-only and never roll up into success/failure counts.
     */
    verdict: text().$type<SkillOutcomeVerdict>(),
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

    /**
     * For `prompt_quality_signal` rows only: the prompt that produced this
     * signal. Not an FK because `prompt_logs` is in a different lifecycle
     * (deletable) and outcomes are append-only. Lookup via index below.
     */
    promptLogId: text("prompt_log_id"),

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
    index("skill_outcomes_project_kind_time_idx").on(
      table.projectId,
      table.sourceKind,
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
