/**
 * GET /api/v1/mcp/standards
 *
 * Read-only manifest for the effective standards on a project. Returns
 * metadata and hashes only; bodies are fetched through /standards/sync or
 * read via the `coznt://standards` MCP resource.
 */

import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { getStandardsManifest } from "@/operations/standards";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const requestedProjectId = url.searchParams.get("projectId");
    const projectId = requestedProjectId ?? ctx.projectId;
    if (!projectId) {
      throw httpError(400, "projectId is required (pass ?projectId=... or use a project-scoped API key)");
    }
    await requireProjectScope(ctx, projectId);
    return getStandardsManifest(ctx.organizationId, projectId);
  });
}
