/**
 * Per-kind Zod schemas for `governance_policies.details` and
 * `governance_records.details` JSONB. Co-located so the four kinds'
 * shapes are visible together — per §10 design discipline.
 */

import { z } from "zod/v4";

// --- Policy details (rule definitions) ---

export const gatePolicyDetails = z.object({
  type: z.enum(["approval", "coverage", "lint", "security", "custom"]),
  threshold: z.number().optional(),
  validator: z.string().optional(),
});

export const approvalPolicyDetails = z.object({
  /**
   * Where the approver list comes from at materialization time:
   *   - `literal` (default, legacy): use the `approverIds` array on this row
   *   - `defaultApproverIds`: dereference `projects.defaultApproverIds`
   *     so policy stays in sync as the project's approver set changes
   */
  approverSource: z.enum(["literal", "defaultApproverIds"]).default("literal"),
  approverIds: z.array(z.string()).default([]),
  requiredCount: z.number().int().min(1).default(1),
  /** When true, filter the plan's `createdById` out of the resolved approver set. */
  excludeAuthor: z.boolean().default(false),
  role: z.string().optional(),
});
export type ApprovalPolicyDetails = z.infer<typeof approvalPolicyDetails>;

export const reviewPolicyDetails = z.object({
  reviewerRole: z.string().optional(),
  findingTemplate: z.array(z.string()).optional(),
  requiredFindings: z.array(z.string()).optional(),
});

export const exceptionPolicyDetails = z.object({
  allowedApproverRoles: z.array(z.string()).optional(),
  maxDurationDays: z.number().int().min(1).optional(),
  requiresReason: z.boolean().default(true),
});

export const GOVERNANCE_POLICY_DETAILS = {
  gate: gatePolicyDetails,
  approval: approvalPolicyDetails,
  review: reviewPolicyDetails,
  exception: exceptionPolicyDetails,
} as const;

// --- Record details (rule applications) ---

export const gateRecordDetails = z.object({
  type: z.enum(["approval", "coverage", "lint", "security", "custom"]),
  threshold: z.number().optional(),
  evaluatedValue: z.union([z.number(), z.string()]).optional(),
  unmetCriterion: z.string().optional(),
  validator: z.string().optional(),
});

export const approvalRecordDetails = z.object({
  requestedById: z.string().optional(),
  approverIds: z.array(z.string()).default([]),
  requiredCount: z.number().int().min(1).default(1),
  decisions: z
    .array(
      z.object({
        userId: z.string(),
        decision: z.enum(["approve", "reject"]),
        note: z.string().optional(),
        decidedAt: z.string().optional(),
      }),
    )
    .optional(),
});

export const reviewRecordDetails = z.object({
  findings: z
    .array(
      z.object({
        kind: z.string(),
        severity: z.enum(["info", "warn", "blocking"]).optional(),
        note: z.string().optional(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
  score: z.number().optional(),
  round: z.number().int().min(1).default(1),
  supersedesRecordId: z.string().optional(),
  reviewerRole: z.string().optional(),
});

export const exceptionRecordDetails = z.object({
  reason: z.string(),
  supersedesRecordId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  allowedApproverRoles: z.array(z.string()).optional(),
  /**
   * `persistent` (default) — exception lives in the DB until `expiresAt`,
   * applies to every future invocation that hits the superseded record.
   * `session` — exception is consumed by a single MCP invocation; the
   * autonomy gate at the boundary is responsible for honoring it once
   * and then ignoring it on subsequent calls within the same plan
   * artifact, regardless of `expiresAt`.
   */
  scope: z.enum(["session", "persistent"]).default("persistent"),
});
export type ExceptionRecordDetails = z.infer<typeof exceptionRecordDetails>;

export const GOVERNANCE_RECORD_DETAILS = {
  gate: gateRecordDetails,
  approval: approvalRecordDetails,
  review: reviewRecordDetails,
  exception: exceptionRecordDetails,
} as const;
