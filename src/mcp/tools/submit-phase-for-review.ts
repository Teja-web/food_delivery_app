/**
 * MCP tool: submit_phase_for_review
 *
 * Asks reviewers to sign off on advancing the current phase. For each
 * `approval`-type phase_gate in the current phase that's still
 * pending or failed, the route ensures an open approval row exists.
 * Idempotent — existing pending approvals are returned as-is.
 *
 * Non-approval gates (coverage / lint / security / custom) clear via
 * their own mechanism — call `get_phase_checklist` to see them.
 *
 * Ported from SDLC's submit_phase_for_review.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const submitPhaseForReviewInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  note: z
    .string()
    .optional()
    .describe("Optional context for reviewers (attached to each created approval row)."),
});

export type SubmitPhaseForReviewInput = z.infer<typeof submitPhaseForReviewInput>;

export async function runSubmitPhaseForReview(
  client: CozntClient,
  input: SubmitPhaseForReviewInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. Call `set_project` first, or pass `projectId`.");
  }
  return client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/submit-phase-for-review`,
    { note: input.note },
  );
}
