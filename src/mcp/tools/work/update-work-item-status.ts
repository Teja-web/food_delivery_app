/**
 * MCP tool: update_work_item_status
 *
 * Update a work_item's status (and optionally assignee) on coznt's
 * side. Does NOT sync upstream — push_to_external is the verb for
 * that, intentionally separate so the coznt record can drift forward
 * of upstream while the agent works.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall } from "../../session.js";

export const updateWorkItemStatusInput = z.object({
  workItemId: z.string().min(1).describe("The coznt work_item id (not the external id)."),
  status: z
    .string()
    .min(1)
    .optional()
    .describe(
      "New status. Free-form string — coznt doesn't enforce a vocabulary; mirror upstream's enum.",
    ),
  assigneeEmail: z.string().email().optional().describe("Reassign to this email."),
});

export type UpdateWorkItemStatusInput = z.infer<typeof updateWorkItemStatusInput>;

export async function runUpdateWorkItemStatus(
  client: CozntClient,
  input: UpdateWorkItemStatusInput,
) {
  bumpToolCall();
  return client.patch<unknown>(
    `/api/v1/mcp/work-items/${encodeURIComponent(input.workItemId)}`,
    { status: input.status, assigneeEmail: input.assigneeEmail },
  );
}
