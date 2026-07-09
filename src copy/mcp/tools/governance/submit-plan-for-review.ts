/**
 * MCP tool: submit_plan_for_review
 *
 * Move a project_task from `draft` → `in_review` and materialize the
 * governance records that gate the transition. Replaces the legacy
 * `submit_phase_for_review` verb — governance is now plan-bound, not
 * phase-bound.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall } from "../../session";

export const submitPlanForReviewInput = z.object({
  projectTaskId: z
    .string()
    .min(1)
    .describe("Id of the project_task to move into review."),
});

export type SubmitPlanForReviewInput = z.infer<typeof submitPlanForReviewInput>;

export async function runSubmitPlanForReview(
  client: CozntClient,
  input: SubmitPlanForReviewInput,
) {
  bumpToolCall();
  return client.post<unknown>(
    "/api/v1/mcp/governance/submit-plan-for-review",
    input,
  );
}
