/**
 * GET /api/v1/mcp/choreographies
 *
 * Returns the choreography manifest for the API key's bound project (or
 * the `projectId` query param if the key is org-scoped).
 *
 * Read-only. Available in every phase — distribution is orthogonal to
 * phase enforcement.
 *
 * Body shape:
 *   { choreographies: [{slug, version, hash, description, minAutonomy}], manifestHash }
 */

import { handleApi } from "@/lib/auth/api-key";
import { listChoreographies } from "@/operations/choreographies";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const requestedProjectId = url.searchParams.get("projectId");
    const projectId = requestedProjectId ?? ctx.projectId;

    if (!projectId) {
      throw new Error(
        "projectId is required (pass ?projectId=... or use a project-scoped API key)",
      );
    }

    if (ctx.projectId && requestedProjectId && requestedProjectId !== ctx.projectId) {
      throw new Error("API key is bound to a different project");
    }

    return listChoreographies(ctx.organizationId, projectId);
  });
}
