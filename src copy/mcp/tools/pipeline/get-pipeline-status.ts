/**
 * MCP tool: get_pipeline_status
 *
 * CI/CD + monitoring view for the bound project: latest deployment,
 * most recent test runs (with pass rate + coverage), active
 * release_plan if any. Allowed in `cicd` and `monitoring` phases.
 */

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

export const getPipelineStatusInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type GetPipelineStatusInput = z.infer<typeof getPipelineStatusInput>;

export async function runGetPipelineStatus(
  client: CozntClient,
  input: GetPipelineStatusInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  return client.get<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/pipeline-status`,
  );
}
