/**
 * Governance Records — rule applications, always targeted at a plan_artifact.
 *
 * One table for all four kinds (gate | approval | review | exception). Status
 * state machine is unified: pending → passed | failed | skipped | expired.
 * Per-kind sub-states (approval decision, review round, exception expiry)
 * live in `details` JSONB.
 *
 * Per §10 design discipline: no per-kind columns, no per-kind tables. Only
 * the evaluator dispatcher branches on kind.
 */

import { text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { projects } from "../project";
import { planArtifacts } from "../plan/plan-artifact";
import { governancePolicies } from "./policies";
import { type PlanStatus } from "../plan/plan-kinds";
import {
  GOVERNANCE_RECORD_STATUSES,
  type GovernanceKind,
  type GovernanceRecordStatus,
} from "./governance-kinds";

export {
  GOVERNANCE_RECORD_STATUSES,
  type GovernanceRecordStatus,
};

export const governanceRecords = cozntSchema.table(
  "governance_records",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    planArtifactId: text("plan_artifact_id")
      .notNull()
      .references(() => planArtifacts.id, { onDelete: "cascade" }),
    policyId: text("policy_id").references(() => governancePolicies.id, { onDelete: "set null" }),

    kind: text().$type<GovernanceKind>().notNull(),

    /** Which transition this record gates (for transition-bound kinds). */
    transitionFrom: text("transition_from").$type<PlanStatus>(),
    transitionTo: text("transition_to").$type<PlanStatus>(),

    status: text().$type<GovernanceRecordStatus>().notNull().default("pending"),

    decidedById: text("decided_by_id"),
    decidedByName: text("decided_by_name"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at"),

    /**
     * Kind-specific payload:
     *   gate:      { type, threshold, evaluatedValue, unmetCriterion, validator }
     *   approval:  { requestedById, approverIds[], requiredCount, decision }
     *   review:    { findings[], summary, score, round, supersedesRecordId, reviewerRole }
     *   exception: { reason, supersedesRecordId, expiresAt, allowedApproverRoles[], scope }
     */
    details: jsonb().$type<Record<string, unknown>>(),

    /**
     * Frozen copy of the policy as it existed at materialization time:
     *   { policyId, kind, name, details, hash, capturedAt }
     *
     * The evaluator and audit replay read from this snapshot — never from
     * the live `governance_policies` row — so a policy edit cannot
     * retroactively change how an old record evaluates. `hash` is sha256
     * of the canonical JSON of `{kind, name, details}` and is what the
     * Trust UI surfaces alongside the audit row signature.
     */
    policySnapshot: jsonb("policy_snapshot").$type<{
      policyId: string;
      kind: GovernanceKind;
      name: string;
      details: Record<string, unknown> | null;
      hash: string;
      capturedAt: string;
    }>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("gov_records_org_idx").on(table.organizationId),
    index("gov_records_plan_idx").on(table.planArtifactId, table.kind, table.status),
    index("gov_records_project_status_idx").on(table.projectId, table.status, table.kind),
    index("gov_records_policy_idx").on(table.policyId),
  ],
);

export type GovernanceRecord = typeof governanceRecords.$inferSelect;
export type NewGovernanceRecord = typeof governanceRecords.$inferInsert;
