/**
 * MCP tool: decide_governance_record
 *
 * Move a governance_record to a terminal status (`passed` | `failed` |
 * `skipped` | `expired`). Kind-agnostic — the underlying op records the
 * decision; the evaluator dispatcher handles per-kind side effects.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";
import { GOVERNANCE_RECORD_STATUSES } from "../../../db/schema/governance/governance-kinds";

export const decideGovernanceRecordInput = z.object({
  id: z.string().min(1).describe("Governance record id."),
  decision: z
    .enum(GOVERNANCE_RECORD_STATUSES)
    .refine((s) => s !== "pending", { message: "decision must be terminal" })
    .describe("Terminal status. `pending` is not a decision."),
  note: z.string().optional().describe("Free-form decision note."),
  detailsPatch: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Optional details merge (e.g. exception approvers)."),
});

export type DecideGovernanceRecordInput = z.infer<typeof decideGovernanceRecordInput>;

export async function runDecideGovernanceRecord(
  client: CozntClient,
  input: DecideGovernanceRecordInput,
) {
  bumpToolCall();
  return client.post<unknown>(
    "/api/v1/mcp/governance/decide-governance-record",
    input,
  );
}
