/**
 * MCP tool: setup_project_standards
 *
 * Project-scoped setup gate before assigned work starts. The caller either
 * copies existing org artifacts into project_artifacts or provides exclusive
 * Requirements + Design files/bodies for this project. Existing Requirements
 * and Design are left unchanged. Prefer upsert_project_artifacts for custom
 * project-owned artifact edits.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

const ARTIFACT_FILE_TYPES = [".md", ".txt", ".html", ".json"] as const;
type ArtifactFileType = (typeof ARTIFACT_FILE_TYPES)[number];

const projectStandardInput = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  filePath: z.string().optional(),
  sourceFileName: z.string().optional(),
  type: z.enum(ARTIFACT_FILE_TYPES).optional(),
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
  additionalArtifacts: z
    .array(projectStandardInput)
    .optional()
    .describe("Optional extra project-standard files. Each item can provide body or filePath."),
  requirements: projectStandardInput
    .optional()
    .describe("Project-exclusive Requirements. Created only when missing and useOrganizationDefaults=false."),
  design: projectStandardInput
    .optional()
    .describe("Project-exclusive Design. Created only when missing and useOrganizationDefaults=false."),
});

export type SetupProjectStandardsInput = z.infer<typeof setupProjectStandardsInput>;

function inferType(fileName: string): ArtifactFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".txt")) return ".txt";
  if (lower.endsWith(".html")) return ".html";
  if (lower.endsWith(".json")) return ".json";
  return ".md";
}

function defaultFileName(
  kind: "requirements" | "design" | "additional",
  type: ArtifactFileType,
): string {
  if (kind === "requirements") return `requirements${type}`;
  if (kind === "design") return `design${type}`;
  return `additional-artifact${type}`;
}

async function resolveStandardBody(
  kind: "requirements" | "design" | "additional",
  input: z.infer<typeof projectStandardInput> | undefined,
): Promise<{
  title?: string;
  body: string;
  type: ArtifactFileType;
  sourceFileName: string;
}> {
  if (!input) {
    const label = kind === "design" ? "Design" : kind === "requirements" ? "Requirements" : "Additional artifact";
    throw new Error(
      `${label} is required when useOrganizationDefaults=false.`,
    );
  }

  const fileNameFromPath = input.filePath ? basename(input.filePath) : null;
  const explicitType = input.type;
  const sourceFileName =
    input.sourceFileName?.trim() ||
    fileNameFromPath ||
    defaultFileName(kind, explicitType ?? ".md");
  const type = explicitType ?? inferType(sourceFileName);
  const body = input.filePath ? await readFile(input.filePath, "utf8") : input.body ?? "";
  if (!body.trim()) {
    const label = kind === "design" ? "Design" : kind === "requirements" ? "Requirements" : "Additional artifact";
    throw new Error(
      `${label} needs a non-empty body or filePath.`,
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
    const additionalArtifacts = await Promise.all(
      (input.additionalArtifacts ?? []).map((artifact) =>
        resolveStandardBody("additional", artifact),
      ),
    );
    return client.post<unknown>(
      `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/standards/setup`,
      {
        useOrganizationDefaults: true,
        organizationArtifactIds: input.organizationArtifactIds,
        additionalArtifacts,
      },
    );
  }

  const [requirements, design, additionalArtifacts] = await Promise.all([
    resolveStandardBody("requirements", input.requirements),
    resolveStandardBody("design", input.design),
    Promise.all(
      (input.additionalArtifacts ?? []).map((artifact) =>
        resolveStandardBody("additional", artifact),
      ),
    ),
  ]);

  return client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/standards/setup`,
    {
      useOrganizationDefaults: false,
      requirements,
      design,
      additionalArtifacts,
    },
  );
}
