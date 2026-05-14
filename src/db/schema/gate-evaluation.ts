/**
 * GateEvaluation — append-only record of every execution-gate decision.
 *
 * Each row is the verdict the gate emitted for one (projectId, prRef)
 * snapshot. Re-evaluating the same PR (because new commits land, or
 * because the originating skill was demoted) appends a new row — we
 * never UPDATE, so the history is queryable. The latest row per
 * (projectId, prRef) is the current state.
 *
 * Why a dedicated table (vs. just audit_log): the gate is queried
 * frequently — "how many PRs are currently blocked by this skill",
 * "what's the current verdict for PR #42" — and those queries want
 * structured columns, not jsonb summary strings.
 */

import { boolean, index, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import { cozntSchema } from "./schema";
import { projects } from "./project";
import { skills } from "./skill";

export const GATE_VERDICTS = ["success", "failure", "neutral"] as const;
export type GateVerdict = (typeof GATE_VERDICTS)[number];

export const CHANGE_RISKS = ["low", "medium", "high"] as const;
export type ChangeRisk = (typeof CHANGE_RISKS)[number];

export const gateEvaluations = cozntSchema.table(
  "gate_evaluations",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    /** PR identifier, e.g. "github:owner/repo#42". Opaque string; per-source. */
    prRef: text("pr_ref").notNull(),
    prTitle: text("pr_title"),
    prHeadSha: text("pr_head_sha"),

    /** Originating skill (parsed from commit trailer), or null = no attribution. */
    skillId: text("skill_id").references(() => skills.id, { onDelete: "set null" }),
    /** Skill's autonomy level at the time of this evaluation (0-3). */
    autonomyAtEval: text("autonomy_at_eval"),

    verdict: text().$type<GateVerdict>().notNull(),
    /** Short human reason for the verdict — surfaced in the check-run summary. */
    reason: text().notNull(),
    /** Bullet-list details — surfaced as the check-run text body. */
    details: jsonb().$type<string[]>(),

    changeRisk: text("change_risk").$type<ChangeRisk>().notNull(),
    /** Whether a human override (approval row) was honoured for this verdict. */
    humanOverride: boolean("human_override").notNull().default(false),

    /** GitHub Checks API check-run id, populated after we POST the verdict. */
    checkRunId: text("check_run_id"),
    /** Last error from the check-run POST (null on success or skip). */
    checkRunError: text("check_run_error"),

    evaluatedAt: timestamp("evaluated_at").defaultNow().notNull(),
  },
  (table) => [
    index("gate_evaluations_project_pr_idx").on(table.projectId, table.prRef, table.evaluatedAt),
    index("gate_evaluations_skill_idx").on(table.skillId, table.verdict, table.evaluatedAt),
    index("gate_evaluations_org_idx").on(table.organizationId, table.evaluatedAt),
  ],
);

export type GateEvaluation = typeof gateEvaluations.$inferSelect;
export type NewGateEvaluation = typeof gateEvaluations.$inferInsert;
