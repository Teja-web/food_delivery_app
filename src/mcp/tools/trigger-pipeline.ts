/**
 * MCP tool: trigger_pipeline
 *
 * Actively trigger a CI/CD pipeline run. Phase-gated to CICD only.
 * Thin wrapper over `/api/v1/mcp/trigger-pipeline`.
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";

export const triggerPipelineInput = z.object({
  source: z.enum(["GITHUB", "AZURE_DEVOPS"]).describe("Which CI provider to trigger."),
  workflowId: z
    .string()
    .min(1)
    .describe(
      "GitHub: workflow filename (e.g. 'ci.yml') or numeric id. ADO: numeric pipeline id (as string).",
    ),
  branch: z.string().optional().describe("Ref to dispatch against. Default: 'main'."),
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
});

export type TriggerPipelineInput = z.infer<typeof triggerPipelineInput>;

export async function runTriggerPipeline(client: CozntClient, input: TriggerPipelineInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. Pass `projectId` or bind a project-scoped API key.",
    );
  }
  return client.post<{
    runId: string | null;
    htmlUrl: string | null;
    status: string;
  }>("/api/v1/mcp/trigger-pipeline", {
    projectId,
    source: input.source,
    workflowId: input.workflowId,
    branch: input.branch,
  });
}
