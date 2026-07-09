/**
 * Per-kind Zod schemas for the `project_tasks.metadata` JSONB column.
 *
 * Nine kinds: epic | feature | story | spec | adr | test_plan | release_plan
 * | risk_register | incident. The schema for each kind is the contract for
 * what's queryable inside `metadata` without per-kind columns.
 */

import { z } from "zod/v4";
import { PLAN_KINDS, type PlanKind } from "@/db/schema/plan/plan-kinds";

const baseDetailFields = {
  /** Free-form per-kind notes the agent or author wants captured. */
  notes: z.string().optional(),
};

export const epicDetailSchema = z.object({
  ...baseDetailFields,
  objective: z.string().optional(),
  successMetrics: z.array(z.string()).optional(),
  targetQuarter: z.string().optional(),
});

export const featureDetailSchema = z.object({
  ...baseDetailFields,
  userValue: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

export const storyDetailSchema = z.object({
  ...baseDetailFields,
  asA: z.string().optional(),
  iWant: z.string().optional(),
  soThat: z.string().optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

export const specDetailSchema = z.object({
  ...baseDetailFields,
  scope: z.string().optional(),
  apis: z.array(z.string()).optional(),
  dataModel: z.string().optional(),
  edgeCases: z.array(z.string()).optional(),
});

export const adrDetailSchema = z.object({
  ...baseDetailFields,
  context: z.string().optional(),
  decision: z.string().optional(),
  consequences: z.array(z.string()).optional(),
  alternativesConsidered: z.array(z.string()).optional(),
});

export const testPlanDetailSchema = z.object({
  ...baseDetailFields,
  strategy: z.string().optional(),
  coverageGoal: z.number().min(0).max(1).optional(),
  scenarios: z.array(z.string()).optional(),
});

export const releasePlanDetailSchema = z.object({
  ...baseDetailFields,
  version: z.string().optional(),
  rolloutPlan: z.string().optional(),
  rollbackPlan: z.string().optional(),
  goNoGoChecks: z.array(z.string()).optional(),
});

export const riskRegisterDetailSchema = z.object({
  ...baseDetailFields,
  risks: z
    .array(
      z.object({
        description: z.string(),
        likelihood: z.enum(["low", "medium", "high"]).optional(),
        impact: z.enum(["low", "medium", "high"]).optional(),
        mitigation: z.string().optional(),
        owner: z.string().optional(),
      }),
    )
    .optional(),
});

export const incidentDetailSchema = z.object({
  ...baseDetailFields,
  severity: z.enum(["sev1", "sev2", "sev3", "sev4"]).optional(),
  detectedAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  rootCause: z.string().optional(),
  actionItems: z.array(z.string()).optional(),
});

export const PLAN_KIND_DETAIL_SCHEMAS: Record<PlanKind, z.ZodTypeAny> = {
  epic: epicDetailSchema,
  feature: featureDetailSchema,
  story: storyDetailSchema,
  spec: specDetailSchema,
  adr: adrDetailSchema,
  test_plan: testPlanDetailSchema,
  release_plan: releasePlanDetailSchema,
  risk_register: riskRegisterDetailSchema,
  incident: incidentDetailSchema,
};

export function validatePlanDetails(kind: PlanKind, details: unknown) {
  return PLAN_KIND_DETAIL_SCHEMAS[kind].safeParse(details);
}

export { PLAN_KINDS };
