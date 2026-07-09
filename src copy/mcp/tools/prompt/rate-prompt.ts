/**
 * MCP tool: rate_prompt
 *
 * Score a prompt against the canonical 6-dim rubric without persisting.
 * Provide either inline `content` or an existing `promptLogId`.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const ratePromptInput = z
  .object({
    content: z.string().min(1).optional().describe("Inline content to score."),
    promptLogId: z.string().optional().describe("Re-score an existing prompt-log row."),
    projectId: z.string().optional().describe("Defaults to the session's bound project."),
  })
  .refine((d) => Boolean(d.content) !== Boolean(d.promptLogId), {
    message: "Provide exactly one of `content` or `promptLogId`",
  });

export type RatePromptInput = z.infer<typeof ratePromptInput>;

export async function runRatePrompt(client: CozntClient, input: RatePromptInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>("/api/v1/mcp/score-prompt", {
    content: input.content,
    promptLogId: input.promptLogId,
    projectId,
  });
}
