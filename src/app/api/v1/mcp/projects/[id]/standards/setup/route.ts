/**
 * POST /api/v1/mcp/projects/[id]/standards/setup
 *
 * Project-scoped standards setup for MCP/CLI callers. Org artifacts are never
 * uploaded here; callers either copy existing org artifacts into
 * project_artifacts or provide project-exclusive Requirements + Design bodies.
 */

import { z } from "zod/v4";

import { ARTIFACT_FILE_TYPES, type ArtifactFileType } from "@/db/schema/artifact";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import {
  cloneOrganizationArtifactsToProject,
  getOrganizationArtifactsReadiness,
  getProjectArtifactsManifest,
  getProjectRequiredArtifactRows,
  listOrganizationArtifacts,
  upsertProjectArtifact,
} from "@/operations/artifacts";

const projectUploadSchema = z.object({
  title: z.string().optional(),
  body: z.string().refine((value) => value.trim().length > 0, "File content is required."),
  type: z.enum(ARTIFACT_FILE_TYPES).optional().default(".md"),
  sourceFileName: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("useOrganizationDefaults", [
  z.object({
    useOrganizationDefaults: z.literal(true),
    organizationArtifactIds: z.array(z.string().uuid()).optional(),
    additionalArtifacts: z.array(projectUploadSchema).optional().default([]),
  }),
  z.object({
    useOrganizationDefaults: z.literal(false),
    requirements: projectUploadSchema,
    design: projectUploadSchema,
    additionalArtifacts: z.array(projectUploadSchema).optional().default([]),
  }),
]);

type ProjectUpload = z.infer<typeof projectUploadSchema>;
type ProjectRequiredRows = Awaited<ReturnType<typeof getProjectRequiredArtifactRows>>;

function defaultTitle(kind: "requirements" | "design", inputTitle?: string): string {
  const title = inputTitle?.trim();
  if (title) return title;
  return kind === "requirements" ? "Project Requirements" : "Project Design";
}

function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Project Artifact";
}

function typeFromFileName(fileName: string): ArtifactFileType | null {
  const lower = fileName.trim().toLowerCase();
  return ARTIFACT_FILE_TYPES.find((type) => lower.endsWith(type)) ?? null;
}

function reservedRequiredKindFromName(fileName: string): "requirements" | "design" | null {
  const base = fileName
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "");
  if (base === "requirements" || base === "design") return base;
  return null;
}

function resolveUploadType(artifact: ProjectUpload): ArtifactFileType {
  return typeFromFileName(artifact.sourceFileName) ?? artifact.type;
}

async function upsertAdditionalProjectArtifacts(
  projectId: string,
  artifacts: ProjectUpload[],
): Promise<void> {
  for (const artifact of artifacts) {
    const type = resolveUploadType(artifact);
    const requiredKind = reservedRequiredKindFromName(artifact.sourceFileName);
    await upsertProjectArtifact({
      projectId,
      title:
        requiredKind
          ? defaultTitle(requiredKind, artifact.title)
          : artifact.title?.trim() || titleFromFileName(artifact.sourceFileName),
      name: artifact.sourceFileName,
      body: artifact.body,
      type,
      category: requiredKind ? "project-exclusive" : "project-standard",
      projectArtifactKind: requiredKind ?? "custom",
      createdVia: "MCP",
      status: "pending",
    });
  }
}

async function upsertRequiredProjectArtifactIfMissing(
  projectId: string,
  kind: "requirements" | "design",
  artifact: ProjectUpload,
  existingRequired: ProjectRequiredRows,
): Promise<void> {
  if (existingRequired[kind]) {
    return;
  }

  const type = resolveUploadType(artifact);
  const row = await upsertProjectArtifact({
    projectId,
    title: defaultTitle(kind, artifact.title),
    name: artifact.sourceFileName,
    body: artifact.body,
    type,
    category: "project-exclusive",
    projectArtifactKind: kind,
    createdVia: "MCP",
    status: "pending",
  });
  existingRequired[kind] = row;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await requireProjectScope(ctx, id);
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    if (parsed.data.useOrganizationDefaults) {
      const readiness = await getOrganizationArtifactsReadiness(ctx.organizationId);
      if (!readiness.requiredComplete) {
        throw httpError(
          409,
          `Organization standards are incomplete: ${readiness.missingRequired.join(", ")}.`,
          { missingRequired: readiness.missingRequired },
        );
      }

      const orgArtifacts = await listOrganizationArtifacts();
      const requestedIds = parsed.data.organizationArtifactIds;
      const idsToClone =
        requestedIds && requestedIds.length > 0
          ? requestedIds
          : orgArtifacts.map((artifact) => artifact.id);
      if (idsToClone.length === 0) {
        throw httpError(409, "No organization standards are available to copy.");
      }

      await cloneOrganizationArtifactsToProject(project.id, idsToClone, "MCP");
      await upsertAdditionalProjectArtifacts(project.id, parsed.data.additionalArtifacts);
    } else {
      const existingRequired = await getProjectRequiredArtifactRows(ctx.organizationId, project.id);
      await upsertRequiredProjectArtifactIfMissing(
        project.id,
        "requirements",
        parsed.data.requirements,
        existingRequired,
      );
      await upsertRequiredProjectArtifactIfMissing(
        project.id,
        "design",
        parsed.data.design,
        existingRequired,
      );
      await upsertAdditionalProjectArtifacts(project.id, parsed.data.additionalArtifacts);
    }

    const manifest = await getProjectArtifactsManifest(ctx.organizationId, project.id);
    return {
      project: { id: project.id },
      mode: parsed.data.useOrganizationDefaults ? "organization_defaults" : "project_exclusive",
      standards: manifest.standards,
      total: manifest.standards.length,
      manifestHash: manifest.manifestHash,
      next: "Artifacts submitted for approval. After approval, run get_project_standards or coznt sync before starting assigned work.",
    };
  });
}
