/**
 * MCP tool: setup_project_standards
 *
 * Project-scoped setup gate before assigned work starts. The caller either
 * copies existing org artifacts into project_artifacts or provides exclusive
 * Requirements + Design files/bodies for this project.
 */

import { access, readFile } from "node:fs/promises";
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
  additionalArtifacts: z
    .array(projectStandardInput)
    .optional()
    .describe("Optional extra project-standard files. Each item can provide body or filePath."),
  requirements: projectStandardInput
    .optional()
    .describe("Project-exclusive Requirements. Provide body or filePath when useOrganizationDefaults=false."),
  design: projectStandardInput
    .optional()
    .describe("Project-exclusive Design. Provide body or filePath when useOrganizationDefaults=false."),
});

export type SetupProjectStandardsInput = z.infer<typeof setupProjectStandardsInput>;
const REQUIREMENTS_EXISTS_MESSAGE = "requirements.md already exists.\nNo changes were made.";
const DESIGN_EXISTS_MESSAGE = "design.md already exists.\n\nNo changes were made.";
const REQUIREMENTS_MISSING_FOR_DESIGN_MESSAGE =
  "Cannot create design.md because requirements.md does not exist.\n\nPlease create requirements.md first.";

function inferType(fileName: string): ".md" | ".txt" {
  return fileName.toLowerCase().endsWith(".txt") ? ".txt" : ".md";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function defaultFileName(
  kind: "requirements" | "design" | "additional",
  type: ".md" | ".txt",
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
  type: ".md" | ".txt";
  sourceFileName: string;
}> {
  if (!input) {
    const label = kind === "design" ? "Design" : kind === "requirements" ? "Requirements" : "Additional artifact";
    throw new Error(
      `${label} is required when useOrganizationDefaults=false.`,
    );
  }

  const fileNameFromPath = input.filePath ? basename(input.filePath) : null;
  const sourceFileName =
    input.sourceFileName?.trim() ||
    fileNameFromPath ||
    defaultFileName(kind, ".md");
  const type = inferType(sourceFileName);
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

  if (!input.useOrganizationDefaults) {
    const requestedRequirementsFileName =
      input.requirements?.sourceFileName?.trim() ||
      (input.requirements?.filePath ? basename(input.requirements.filePath) : "requirements.md");
    const requestedRequirementsType = inferType(requestedRequirementsFileName);
    const requestedDesignFileName =
      input.design?.sourceFileName?.trim() ||
      (input.design?.filePath ? basename(input.design.filePath) : "design.md");
    const requestedDesignType = inferType(requestedDesignFileName);

    const [repoHasRequirements, repoHasDesign, manifest] = await Promise.all([
      fileExists("requirements.md"),
      fileExists("design.md"),
      client.get<{
        artifacts?: Array<{ name?: string; type?: string }>;
        standards?: Array<{ name?: string; type?: string }>;
      }>(`/api/v1/mcp/standards?projectId=${encodeURIComponent(projectId)}`),
    ]);
    const entries = [...(manifest.artifacts ?? []), ...(manifest.standards ?? [])];
    const tableHasRequirements = entries.some(
      (entry) =>
        entry.name?.toLowerCase() === "requirements.md" && entry.type?.toLowerCase() === ".md",
    );
    const tableHasDesign = entries.some(
      (entry) => entry.name?.toLowerCase() === "design.md" && entry.type?.toLowerCase() === ".md",
    );
    const hasRequirements = repoHasRequirements || tableHasRequirements;
    const hasDesign = repoHasDesign || tableHasDesign;

    if (requestedDesignFileName.toLowerCase() === "design.md" && requestedDesignType === ".md") {
      if (!hasRequirements) {
        return { message: REQUIREMENTS_MISSING_FOR_DESIGN_MESSAGE };
      }
      if (hasDesign) {
        return { message: DESIGN_EXISTS_MESSAGE };
      }
    }

    if (
      requestedRequirementsFileName.toLowerCase() === "requirements.md" &&
      requestedRequirementsType === ".md" &&
      hasRequirements
    ) {
      return { message: REQUIREMENTS_EXISTS_MESSAGE };
    }
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
