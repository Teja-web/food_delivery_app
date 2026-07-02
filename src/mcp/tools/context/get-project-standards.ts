/**
 * MCP tool: get_project_standards
 *
 * Returns exact effective standards for the active project. Prefer this when
 * the agent needs the bodies; `get_my_context` only returns compact metadata.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const getProjectStandardsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  slugs: z.array(z.string()).optional().describe("Optional standard slugs to fetch."),
});

export type GetProjectStandardsInput = z.infer<typeof getProjectStandardsInput>;

export async function runGetProjectStandards(
  client: CozntClient,
  input: GetProjectStandardsInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. API key resolution failed - verify COZNT_API_KEY is valid, or pass `projectId` explicitly.",
    );
  }
  return client.post<unknown>("/api/v1/mcp/standards/sync", {
    projectId,
    slugs: input.slugs,
  });
}
