/**
 * MCP tool: create_governance_record
 *
 * Kind-parameterized creator. Spec §10: governance verbs must not split
 * by kind (no `request_approval` / `create_gate`). Pass `kind` and any
 * sub-details in `details`.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";
import { GOVERNANCE_KINDS } from "../../../db/schema/governance/governance-kinds";
import { PLAN_STATUSES } from "../../../db/schema/plan/plan-kinds";

export const createGovernanceRecordInput = z.object({
  projectTaskId: z.string().min(1),
  kind: z.enum(GOVERNANCE_KINDS).describe("Record kind."),
  policyId: z.string().optional().describe("Policy that generated this record (if any)."),
  transitionFrom: z.enum(PLAN_STATUSES).optional(),
  transitionTo: z.enum(PLAN_STATUSES).optional(),
  details: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      "Kind-specific payload. Approval: { approverIds, requiredCount, requestedById }. Gate: { type, threshold, validator }. Review: { findings, reviewerRole }. Exception: { reason, supersedesRecordId, expiresAt }.",
    ),
});

export type CreateGovernanceRecordInput = z.infer<typeof createGovernanceRecordInput>;

export async function runCreateGovernanceRecord(
  client: CozntClient,
  input: CreateGovernanceRecordInput,
) {
  bumpToolCall();
  return client.post<unknown>(
    "/api/v1/mcp/governance/create-governance-record",
    input,
  );
}
