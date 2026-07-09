/**
 * Governance Policies — rule definitions at the Org tier, scoped to any level.
 *
 * One table with `kind` discriminator (gate | approval | review | exception)
 * and `scopeType` (organization | project | repository | environment | project_task).
 * Kind-specific config lives in `details` JSONB validated by Zod in
 * `lib/governance/schemas.ts`.
 *
 * When a plan transitions, the policy engine reads applicable policies and
 * materializes `governance_records` rows on the project task.
 */

import { boolean, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";
import { cozntSchema } from "../schema";
import { type PlanKind, type PlanStatus } from "../plan/plan-kinds";
import {
  GOVERNANCE_KINDS,
  GOVERNANCE_SCOPES,
  GATE_TYPES,
  type GovernanceKind,
  type GovernanceScope,
  type GateType,
} from "./governance-kinds";

export {
  GOVERNANCE_KINDS,
  GOVERNANCE_SCOPES,
  GATE_TYPES,
  type GovernanceKind,
  type GovernanceScope,
  type GateType,
};

export const governancePolicies = cozntSchema.table(
  "governance_policies",
  {
    id: text().primaryKey().$defaultFn(() => nanoid()),
    organizationId: text("organization_id").notNull(),

    kind: text().$type<GovernanceKind>().notNull(),

    scopeType: text("scope_type").$type<GovernanceScope>().notNull(),
    /** Null when scopeType=organization. */
    scopeId: text("scope_id"),

    /**
     * What project-task transitions this policy watches. Null = applies to all
     * kinds; from/to null = unspecified.
     */
    appliesToPlanKind: text("applies_to_plan_kind").$type<PlanKind>(),
    transitionFrom: text("transition_from").$type<PlanStatus>(),
    transitionTo: text("transition_to").$type<PlanStatus>(),

    name: text().notNull(),
    description: text(),
    enabled: boolean().notNull().default(true),

    /**
     * Kind-specific config:
     *   gate:      { type, threshold, validator }
     *   approval:  { approverIds[], requiredCount, role }
     *   review:    { reviewerRole, findingTemplate, requiredFindings }
     *   exception: { allowedApproverRoles[], maxDurationDays, requiresReason }
     */
    details: jsonb().$type<Record<string, unknown>>(),

    createdById: text("created_by_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("gov_policies_org_idx").on(table.organizationId),
    index("gov_policies_scope_idx").on(table.scopeType, table.scopeId, table.enabled),
    index("gov_policies_kind_applies_idx").on(
      table.kind,
      table.appliesToPlanKind,
      table.transitionFrom,
      table.transitionTo,
    ),
  ],
);

export type GovernancePolicy = typeof governancePolicies.$inferSelect;
export type NewGovernancePolicy = typeof governancePolicies.$inferInsert;
