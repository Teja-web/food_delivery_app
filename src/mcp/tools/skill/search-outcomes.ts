/**
 * MCP tool: search_outcomes
 *
 * Keyword search over skill_outcomes.rationale. The "have we seen this
 * before?" surface — look for past failures by symptom.
 */

import { z } from "zod";

import { CozntClient } from "../../client.js";
import { bumpToolCall, getSessionProject } from "../../session.js";

const VERDICTS = ["success", "rolled_back", "incident"] as const;

export const searchOutcomesInput = z.object({
  query: z.string().min(1).describe("Free-form text — matched against the outcome's rationale."),
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  verdicts: z.array(z.enum(VERDICTS)).optional(),
  fromIso: z.string().optional().describe("ISO-8601 timestamp — start of search window."),
  toIso: z.string().optional().describe("ISO-8601 timestamp — end of search window."),
  limit: z.number().int().min(1).max(100).optional(),
});

export type SearchOutcomesInput = z.infer<typeof searchOutcomesInput>;

export async function runSearchOutcomes(client: CozntClient, input: SearchOutcomesInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  return client.post<unknown>(`/api/v1/mcp/search/outcomes`, {
    query: input.query,
    projectId,
    verdicts: input.verdicts,
    fromIso: input.fromIso,
    toIso: input.toIso,
    limit: input.limit,
  });
}
