/**
 * MCP tool: upsert_project_artifacts
 *
 * Create missing project Requirements/Design artifacts in project_artifacts,
 * and create or update custom project artifacts. Requirements and Design are
 * mandatory before assigned work can proceed.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { z } from "zod";

import { CozntClient } from "../../client";
import { bumpToolCall, getSessionProject } from "../../session";

const ARTIFACT_FILE_TYPES = [".md", ".txt", ".html", ".json"] as const;
type ArtifactFileType = (typeof ARTIFACT_FILE_TYPES)[number];

const projectArtifactInput = z.object({
  title: z.string().optional().describe("Human-readable title. Required for custom artifacts when no sourceFileName is provided."),
  body: z.string().optional().describe("Inline Markdown/text body. Provide body or filePath."),
  filePath: z.string().optional().describe("Local file path to read. Provide filePath or body."),
  sourceFileName: z.string().optional().describe("Stored file name in project_artifacts. Defaults from filePath or title."),
  type: z.enum(ARTIFACT_FILE_TYPES).optional().describe("Stored file type. Defaults from sourceFileName/filePath."),
  category: z.string().optional().describe("Custom artifact category. Requirements/Design always use project-exclusive; custom artifacts default to project-standard."),
});

export const upsertProjectArtifactsInput = z
  .object({
    projectId: z.string().optional().describe("Defaults to the session's bound project."),
    requirements: projectArtifactInput
      .optional()
      .describe("Project Requirements artifact. Created only when the project does not already have one."),
    design: projectArtifactInput
      .optional()
      .describe("Project Design artifact. Created only when the project does not already have one."),
    customArtifacts: z
      .array(projectArtifactInput)
      .optional()
      .describe("Additional project-level artifacts. Each item needs body or filePath."),
  })
  .refine(
    (value) =>
      Boolean(value.requirements) ||
      Boolean(value.design) ||
      Boolean(value.customArtifacts?.length),
    "Provide requirements, design, or at least one custom artifact.",
  );

export type UpsertProjectArtifactsInput = z.infer<typeof upsertProjectArtifactsInput>;

function inferType(fileName: string | undefined): ArtifactFileType {
  const lower = fileName?.toLowerCase() ?? "";
  if (lower.endsWith(".txt")) return ".txt";
  if (lower.endsWith(".html")) return ".html";
  if (lower.endsWith(".json")) return ".json";
  return ".md";
}

function defaultFileName(kind: "requirements" | "design", type: ArtifactFileType): string {
  return kind === "requirements" ? `requirements${type}` : `design${type}`;
}

async function resolveArtifactBody(
  kind: "requirements" | "design" | "custom",
  input: z.infer<typeof projectArtifactInput>,
): Promise<{
  title?: string;
  body: string;
  type: ArtifactFileType;
  sourceFileName?: string;
  category: string;
}> {
  const fileNameFromPath = input.filePath ? basename(input.filePath) : undefined;
  const sourceFileName = input.sourceFileName?.trim() || fileNameFromPath;
  const type = input.type ?? inferType(sourceFileName);
  const body = input.filePath ? await readFile(input.filePath, "utf8") : input.body ?? "";
  if (!body.trim()) {
    const label =
      kind === "requirements" ? "Requirements" : kind === "design" ? "Design" : "Custom artifact";
    throw new Error(`${label} needs a non-empty body or filePath.`);
  }

  return {
    title: input.title,
    body,
    type,
    sourceFileName:
      sourceFileName || (kind === "custom" ? undefined : defaultFileName(kind, type)),
    category:
      kind === "custom"
        ? input.category?.trim() || "project-standard"
        : "project-exclusive",
  };
}

export async function runUpsertProjectArtifacts(
  client: CozntClient,
  input: UpsertProjectArtifactsInput,
) {
  bumpToolCall();
  const projectId = input.projectId ?? getSessionProject()?.id;
  if (!projectId) {
    throw new Error(
      "No active project. API key resolution failed - verify COZNT_API_KEY is valid, or pass `projectId` explicitly.",
    );
  }

  const [requirements, design, customArtifacts] = await Promise.all([
    input.requirements ? resolveArtifactBody("requirements", input.requirements) : undefined,
    input.design ? resolveArtifactBody("design", input.design) : undefined,
    Promise.all(
      (input.customArtifacts ?? []).map((artifact) =>
        resolveArtifactBody("custom", artifact),
      ),
    ),
  ]);

  return client.post<unknown>(
    `/api/v1/mcp/projects/${encodeURIComponent(projectId)}/artifacts`,
    {
      ...(requirements ? { requirements } : {}),
      ...(design ? { design } : {}),
      customArtifacts,
    },
  );
}
