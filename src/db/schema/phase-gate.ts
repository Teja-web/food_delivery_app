/**
 * Phase Gate — a checkpoint that must PASS before its phase can advance.
 *
 * Configured per project per phase. The `type` enum picks the validator:
 *  - APPROVAL — resolved via an `approvals` row targeting this gate
 *  - COVERAGE — `metrics` of type `TEST_COVERAGE` must meet `threshold`
 *  - LINT     — most-recent CI lint run must succeed
 *  - SECURITY — most-recent security scan must succeed
 *  - CUSTOM   — manually set status (e.g. by a worker task)
 *
 * `advanceProjectPhase` rejects the transition unless every gate for the
 * current phase is PASSED or SKIPPED.
 */

import { text, timestamp, doublePrecision, integer, index, unique } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "./schema";
import { projects, type ProjectPhase } from "./project";
import { plans } from "./plan";

export const GATE_TYPES = [
  "approval",
  "coverage",
  "lint",
  "security",
  "custom",
  /**
   * Blocks phase advance while any open GitHub PR for this project has a
   * still-pending `approvals` work_item row. Pairs with
   * `projects.requireHumanApprovalForMerge`: that flag puts the dispatch
   * gate on the PR; this gate puts the phase gate on the project.
   * Together they enforce "only approved PRs move to the next phase".
   */
  "unapproved_prs",
] as const;
export type GateType = (typeof GATE_TYPES)[number];

export const GATE_STATUSES = ["pending", "passed", "failed", "skipped"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export const phaseGates = cozntSchema.table(
  "phase_gates",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),

    phase: text().$type<ProjectPhase>().notNull(),
    name: text().notNull(),
    description: text(),
    type: text().$type<GateType>().notNull(),
    /** Numeric threshold for COVERAGE / quality-metric gates. */
    threshold: doublePrecision(),

    status: text().$type<GateStatus>().notNull().default("pending"),
    approvedById: text("approved_by_id"),
    comment: text(),
    evaluatedAt: timestamp("evaluated_at"),

    unmetCriterion: text("unmet_criterion"),
    assigneeId: text("assignee_id"),
    assigneeName: text("assignee_name"),
    lastChangedAt: timestamp("last_changed_at"),
    lastGreenAt: timestamp("last_green_at"),

    // Gate override — auditable "skipped with reason." Requires a Plan
    // reference + the autonomy level at override time so the override
    // can be reviewed against the actor's then-current authority. Status
    // remains "skipped" when these are populated.
    overriddenAt: timestamp("overridden_at"),
    overriddenById: text("overridden_by_id"),
    overrideReason: text("override_reason"),
    overrideAuthorizingPlanId: text("override_authorizing_plan_id").references(() => plans.id, {
      onDelete: "set null",
    }),
    overrideAutonomyAtTime: integer("override_autonomy_at_time"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("phase_gates_project_phase_idx").on(table.projectId, table.phase, table.status),
    unique("phase_gates_project_phase_name_unique").on(table.projectId, table.phase, table.name),
  ],
);

export type PhaseGate = typeof phaseGates.$inferSelect;
export type NewPhaseGate = typeof phaseGates.$inferInsert;
