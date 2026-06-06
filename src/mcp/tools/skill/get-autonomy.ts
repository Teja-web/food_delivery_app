/**
 * MCP tool: get_autonomy
 *
 * Read autonomy state for the calling project. Without skillSlug,
 * returns the project-level aggregate (counts at each level, recent
 * incidents). With skillSlug, returns the per-project autonomy level
 * for that skill plus the across-projects breakdown.
 *
 * Read-only; available in every phase.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const getAutonomyInput = z.object({
  skillSlug: z
    .string()
    .optional()
    .describe(
      "Optional skill slug (e.g. `change-risk-classifier`). When provided, returns autonomy for that skill on the current project plus an across-projects breakdown. Omit for the project-wide aggregate.",
    ),
  projectId: z
    .string()
    .optional()
    .describe(
      "Optional projectId. Defaults to the session's bound project (auto-resolved from the API key).",
    ),
});

export type GetAutonomyInput = z.infer<typeof getAutonomyInput>;

export async function runGetAutonomy(client: CozntClient, input: GetAutonomyInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  const params = new URLSearchParams();
  if (input.skillSlug) params.set("skillSlug", input.skillSlug);
  if (projectId) params.set("projectId", projectId);
  const query = params.toString();
  return client.get<unknown>(`/api/v1/mcp/autonomy${query ? `?${query}` : ""}`);
}
