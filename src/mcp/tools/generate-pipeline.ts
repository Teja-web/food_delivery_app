/**
 * MCP tool: generate_pipeline
 *
 * Render a CI/CD pipeline config (GitHub Actions, Azure DevOps, GitLab CI,
 * Jenkins) for the bound project. Returns `{ filename, content, ... }` —
 * the agent then writes `content` to the consumer repo at `filename`.
 *
 * Ported from SDLC's generate_pipeline. Pure templating; no DB write.
 * Allowed in development / testing / cicd phases (route enforces).
 */

import { z } from "zod";

import { CozntClient } from "../client.js";
import { bumpToolCall, getSessionProject } from "../session.js";
import { PIPELINE_PLATFORMS, PIPELINE_STACKS } from "../../lib/pipelines/templates.js";

export const generatePipelineInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  platform: z.enum(PIPELINE_PLATFORMS).describe("Target CI/CD platform."),
  techStack: z
    .enum(PIPELINE_STACKS)
    .optional()
    .describe("Tech stack hint. Defaults to `node`."),
  includeDocker: z
    .boolean()
    .optional()
    .describe("Append Docker image build/push stages."),
  includeKubernetes: z
    .boolean()
    .optional()
    .describe("Append Kubernetes deployment steps."),
});

export type GeneratePipelineInput = z.infer<typeof generatePipelineInput>;

export async function runGeneratePipeline(client: CozntClient, input: GeneratePipelineInput) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error("No active project. API key resolution failed — verify COZNT_API_KEY is valid, or pass `projectId` explicitly.");
  }
  return client.post<unknown>(`/api/v1/mcp/pipelines/generate`, { ...input, projectId });
}
