/**
 * MCP tool: setup_project_standards
 *
 * Project-scoped setup gate before assigned work starts. The caller either
 * copies existing org artifacts into project_artifacts or provides exclusive
 * Requirements + Design files/bodies for this project.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

const projectStandardInput = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  filePath: z.string().optional(),
  sourceFileName: z.string().optional(),
});

export const setupProjectStandardsInput = z.object({
  projectId: z.string().optional().describe("Defaults to the session's bound project."),
  useOrganizationDefaults: z
    .boolean()
    .describe("true copies org standards into project_artifacts; false requires project Requirements + Design."),
  organizationArtifactIds: z
    .array(z.string())
    .optional()
    .describe("Optional subset of organization artifact ids to copy when useOrganizationDefaults=true."),
  requirements: projectStandardInput
    .optional()
    .describe("Project-exclusive Requirements. Provide body or filePath when useOrganizationDefaults=false."),
  design: projectStandardInput
    .optional()
    .describe("Project-exclusive Design. Provide body or filePath when useOrganizationDefaults=false."),
});

export type SetupProjectStandardsInput = z.infer<typeof setupProjectStandardsInput>;

function inferType(fileName: string): ".md" | ".txt" {
  return fileName.toLowerCase().endsWith(".txt") ? ".txt" : ".md";
}

function defaultFileName(kind: "requirements" | "design", type: ".md" | ".txt"): string {
  return kind === "requirements" ? `requirements${type}` : `design${type}`;
}

async function resolveStandardBody(
  kind: "requirements" | "design",
  input: z.infer<typeof projectStandardInput> | undefined,
): Promise<{
  title?: string;
  body: string;
  type: ".md" | ".txt";
  sourceFileName: string;
}> {
  if (!input) {
    throw new Error(
      `${kind === "requirements" ? "Requirements" : "Design"} is required when useOrganizationDefaults=false.`,
    );
  }

  const fileNameFromPath = input.filePath ? basename(input.filePath) : null;
  const sourceFileName =
    input.sourceFileName?.trim() || fileNameFromPath || defaultFileName(kind, ".md");
  const type = inferType(sourceFileName);
  const body = input.filePath ? await readFile(input.filePath, "utf8") : input.body ?? "";
  if (!body.trim()) {
    throw new Error(
      `${kind === "requirements" ? "Requirements" : "Design"} needs a non-empty body or filePath.`,
    );
  }

  return {
    title: input.title,
    body,
    type,
    sourceFileName,
  };
}

export async function runSetupProjectStandards(
  client: CozntClient,
  input: SetupProjectStandardsInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. API key resolution failed - verify COZNT_API_KEY is valid, or pass `projectId` explicitly.",
    );
  }

  if (input.useOrganizationDefaults) {
    return client.post<unknown>(
      `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/standards/setup`,
      {
        useOrganizationDefaults: true,
        organizationArtifactIds: input.organizationArtifactIds,
      },
    );
  }

  const [requirements, design] = await Promise.all([
    resolveStandardBody("requirements", input.requirements),
    resolveStandardBody("design", input.design),
  ]);

  return client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/standards/setup`,
    {
      useOrganizationDefaults: false,
      requirements,
      design,
    },
  );
}
