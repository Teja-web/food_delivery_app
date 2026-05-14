/**
 * MCP tool: submit_for_approval
 *
 * Submits an entity (plan / phase_gate / release / work_item) for human
 * approval. Creates an `approval` row in coznt; reviewers see it on the
 * /approvals inbox.
 *
 * Borrowed from skothapalli's `submit-for-approval` tool, filtered to
 * coznt's entity types.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall } from "../session.js";

export const submitForApprovalInput = z.object({
  entityType: z.enum(["plan", "phase_gate", "release", "work_item"]).describe(
    "What kind of thing is being submitted.",
  ),
  entityId: z.string().min(1).describe("The id of the plan / gate / release / work item."),
  note: z.string().optional().describe("Short context for the reviewer (1-3 sentences)."),
});

export type SubmitForApprovalInput = z.infer<typeof submitForApprovalInput>;

export async function runSubmitForApproval(client: CozntClient, input: SubmitForApprovalInput) {
  bumpToolCall();
  return client.post<unknown>("/api/v1/mcp/approvals", input);
}
