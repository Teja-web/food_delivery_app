/**
 * POST /api/v1/mcp/choreographies/sync
 *
 * Returns the full choreography bundle for the API key's bound project.
 * If `slugs` is passed, only those entries are returned (in the order
 * requested). Unknown slugs return 400.
 *
 * Read-only. Same auth + phase semantics as the manifest route.
 *
 * Body shape:
 *   request:  { projectId?: string, slugs?: string[] }
 *   response: { choreographies: [{slug, version, hash, description, minAutonomy, content}], manifestHash }
 */

import { handleApi } from "@/lib/auth/api-key";
import { getChoreographyBundle } from "@/operations/choreography/choreographies";

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const body = (await req.json().catch(() => ({}))) as {
      projectId?: string;
      slugs?: string[];
    };

    const requestedProjectId = body.projectId;
    const projectId = requestedProjectId ?? ctx.projectId;

    if (!projectId) {
      throw new Error(
        "projectId is required (pass in body or use a project-scoped API key)",
      );
    }

    if (ctx.projectId && requestedProjectId && requestedProjectId !== ctx.projectId) {
      throw new Error("API key is bound to a different project");
    }

    if (body.slugs && !Array.isArray(body.slugs)) {
      throw new Error("`slugs` must be an array of strings");
    }

    return getChoreographyBundle(ctx.organizationId, projectId, body.slugs);
  });
}
