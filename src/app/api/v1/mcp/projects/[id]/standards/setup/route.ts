/**
 * POST /api/v1/mcp/projects/[id]/standards/setup
 *
 * Project-scoped standards setup for MCP/CLI callers. Org artifacts are never
 * uploaded here; callers either copy existing org artifacts into
 * project_artifacts or provide project-exclusive Requirements + Design bodies.
 */

import { z } from "zod/v4";

import { ARTIFACT_FILE_TYPES } from "@/db/schema/artifact";
import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import {
  cloneOrganizationArtifactsToProject,
  deleteProjectArtifact,
  getOrganizationArtifactsReadiness,
  getProjectArtifactsManifest,
  listOrganizationArtifacts,
  listProjectArtifacts,
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
  }),
  z.object({
    useOrganizationDefaults: z.literal(false),
    requirements: projectUploadSchema,
    design: projectUploadSchema,
  }),
]);

function defaultTitle(kind: "requirements" | "design", inputTitle?: string): string {
  const title = inputTitle?.trim();
  if (title) return title;
  return kind === "requirements" ? "Project Requirements" : "Project Design";
}

async function clearProjectArtifacts(projectId: string): Promise<void> {
  const existing = await listProjectArtifacts(projectId);
  for (const artifact of existing) {
    await deleteProjectArtifact(artifact.id);
  }
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

      await clearProjectArtifacts(project.id);
      await cloneOrganizationArtifactsToProject(project.id, idsToClone, "MCP");
    } else {
      await clearProjectArtifacts(project.id);
      await upsertProjectArtifact({
        projectId: project.id,
        title: defaultTitle("requirements", parsed.data.requirements.title),
        name: parsed.data.requirements.sourceFileName,
        body: parsed.data.requirements.body,
        type: parsed.data.requirements.type,
        category: "project-exclusive",
        createdVia: "MCP",
      });
      await upsertProjectArtifact({
        projectId: project.id,
        title: defaultTitle("design", parsed.data.design.title),
        name: parsed.data.design.sourceFileName,
        body: parsed.data.design.body,
        type: parsed.data.design.type,
        category: "project-exclusive",
        createdVia: "MCP",
      });
    }

    const manifest = await getProjectArtifactsManifest(ctx.organizationId, project.id);
    return {
      project: { id: project.id },
      mode: parsed.data.useOrganizationDefaults ? "organization_defaults" : "project_exclusive",
      standards: manifest.standards,
      total: manifest.standards.length,
      manifestHash: manifest.manifestHash,
      next: "Run get_project_standards or coznt sync before starting assigned work.",
    };
  });
}
