/**
 * POST /api/v1/mcp/projects/[id]/artifacts
 *
 * Upsert project-owned artifacts from MCP. Requirements and Design are the
 * mandatory project files that unblock assigned work; custom artifacts are
 * stored alongside them in project_artifacts as project-standard rows.
 */

import { z } from "zod/v4";

import { ARTIFACT_FILE_TYPES, type ArtifactFileType } from "@/db/schema/artifact";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import {
  getProjectArtifactsReadiness,
  getProjectRequiredArtifactRows,
  upsertProjectArtifact,
} from "@/operations/artifacts";

const projectArtifactUploadSchema = z.object({
  title: z.string().optional(),
  body: z.string().refine((value) => value.trim().length > 0, "File content is required."),
  type: z.enum(ARTIFACT_FILE_TYPES).optional().default(".md"),
  sourceFileName: z.string().optional(),
  category: z.string().optional().nullable(),
});

const bodySchema = z
  .object({
    requirements: projectArtifactUploadSchema.optional(),
    design: projectArtifactUploadSchema.optional(),
    customArtifacts: z.array(projectArtifactUploadSchema).optional().default([]),
  })
  .refine(
    (value) =>
      Boolean(value.requirements) ||
      Boolean(value.design) ||
      value.customArtifacts.length > 0,
    "Provide requirements, design, or at least one custom artifact.",
  );

function fileNameFromTitle(value: string, type: ArtifactFileType): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "artifact"}${type}`;
}

function typeFromFileName(fileName: string | null | undefined): ArtifactFileType | null {
  const lower = fileName?.trim().toLowerCase() ?? "";
  return ARTIFACT_FILE_TYPES.find((type) => lower.endsWith(type)) ?? null;
}

function resolveArtifactType(
  artifact: z.infer<typeof projectArtifactUploadSchema>,
): ArtifactFileType {
  return typeFromFileName(artifact.sourceFileName) ?? artifact.type;
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Project Artifact";
}

function defaultRequiredFileName(kind: "requirements" | "design", type: ArtifactFileType): string {
  return kind === "requirements" ? `requirements${type}` : `design${type}`;
}

function normalizeRequiredArtifact(
  kind: "requirements" | "design",
  artifact: z.infer<typeof projectArtifactUploadSchema>,
) {
  const type = resolveArtifactType(artifact);
  const title =
    artifact.title?.trim() ||
    (kind === "requirements" ? "Project Requirements" : "Project Design");
  const name = artifact.sourceFileName?.trim() || defaultRequiredFileName(kind, type);
  return {
    title,
    name,
    body: artifact.body,
    type,
    category: "project-exclusive",
    projectArtifactKind: kind,
  } as const;
}

function normalizeCustomArtifact(artifact: z.infer<typeof projectArtifactUploadSchema>) {
  const type = resolveArtifactType(artifact);
  const title =
    artifact.title?.trim() ||
    (artifact.sourceFileName ? titleFromFileName(artifact.sourceFileName) : "");
  if (!title) {
    throw httpError(400, "Custom project artifacts require a title or sourceFileName.");
  }
  const name = artifact.sourceFileName?.trim() || fileNameFromTitle(title, type);
  return {
    title,
    name,
    body: artifact.body,
    type,
    category: artifact.category ?? "project-standard",
    projectArtifactKind: "custom",
  } as const;
}

function artifactDedupeKey(input: {
  name: string;
  projectArtifactKind: "requirements" | "design" | "custom";
}): string {
  if (input.projectArtifactKind === "requirements" || input.projectArtifactKind === "design") {
    return `kind:${input.projectArtifactKind}`;
  }
  return `name:${input.name.toLowerCase()}`;
}

type NormalizedProjectArtifact =
  | ReturnType<typeof normalizeRequiredArtifact>
  | ReturnType<typeof normalizeCustomArtifact>;

type UpsertedProjectArtifact = Awaited<ReturnType<typeof upsertProjectArtifact>>;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await requireProjectScope(ctx, id);
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const artifactsByKey = new Map<string, NormalizedProjectArtifact>();
    for (const artifact of [
      ...(parsed.data.requirements
        ? [normalizeRequiredArtifact("requirements", parsed.data.requirements)]
        : []),
      ...(parsed.data.design ? [normalizeRequiredArtifact("design", parsed.data.design)] : []),
      ...parsed.data.customArtifacts.map(normalizeCustomArtifact),
    ]) {
      artifactsByKey.set(artifactDedupeKey(artifact), artifact);
    }
    const artifacts = [...artifactsByKey.values()];

    const existingRequired = await getProjectRequiredArtifactRows(ctx.organizationId, project.id);
    const rows: UpsertedProjectArtifact[] = [];
    const skipped: Array<{
      projectArtifactKind: "requirements" | "design";
      existingId: string;
      name: string;
      reason: "already_exists";
    }> = [];
    for (const artifact of artifacts) {
      if (
        artifact.projectArtifactKind === "requirements" ||
        artifact.projectArtifactKind === "design"
      ) {
        const existing = existingRequired[artifact.projectArtifactKind];
        if (existing) {
          skipped.push({
            projectArtifactKind: artifact.projectArtifactKind,
            existingId: existing.id,
            name: existing.name,
            reason: "already_exists",
          });
          continue;
        }
      }

      const row = await upsertProjectArtifact({
        projectId: project.id,
        title: artifact.title,
        name: artifact.name,
        body: artifact.body,
        type: artifact.type,
        category: artifact.category,
        projectArtifactKind: artifact.projectArtifactKind,
        createdVia: "MCP",
      });
      if (
        artifact.projectArtifactKind === "requirements" ||
        artifact.projectArtifactKind === "design"
      ) {
        existingRequired[artifact.projectArtifactKind] = row;
      }
      rows.push(row);
    }

    const readiness = await getProjectArtifactsReadiness(ctx.organizationId, project.id);
    return {
      project: { id: project.id },
      upserted: rows.map((row) => ({
        id: row.id,
        title: typeof row.metadata.title === "string" ? row.metadata.title : row.name,
        name: row.name,
        category: row.category,
        type: row.type,
        projectArtifactKind: row.metadata.projectArtifactKind ?? "custom",
        createdVia: row.createdVia,
        updatedAt: row.updatedAt.toISOString(),
      })),
      skipped,
      required: readiness,
      next: readiness.requiredComplete
        ? "Requirements and Design are configured. You can now call get_assigned_work."
        : `Still missing required project artifact(s): ${readiness.missingRequired.join(", ")}.`,
    };
  });
}
