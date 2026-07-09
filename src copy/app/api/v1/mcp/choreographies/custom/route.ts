/**
 * GET /api/v1/mcp/choreographies/custom
 *
 * Returns the manifest of customer-authored choreographies for the
 * bound (or query-param) project. Companion to /api/v1/mcp/choreographies
 * which returns platform-shipped entries.
 */

import { handleApi } from "@/lib/auth/api-key";
import { listCustomManifest } from "@/operations/choreography/custom-choreographies";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const requestedProjectId = url.searchParams.get("projectId");
    const projectId = requestedProjectId ?? ctx.projectId;

    if (ctx.projectId && requestedProjectId && requestedProjectId !== ctx.projectId) {
      throw new Error("API key is bound to a different project");
    }

    const entries = await listCustomManifest(projectId ?? null);
    return { choreographies: entries };
  });
}
