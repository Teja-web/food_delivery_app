/**
 * POST /api/v1/mcp/standards/sync
 *
 * Returns exact effective standard bodies for a project. This is the source
 * for `coznt sync` writes into `.coznt/standards/`.
 */

import { z } from "zod/v4";

import { handleApi } from "@/lib/auth/api-key";
import { httpError, requireProjectScope } from "@/lib/auth/scope";
import { getStandardsBundle } from "@/operations/standards";

const bodySchema = z.object({
  projectId: z.string().optional(),
  slugs: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      throw httpError(400, "Invalid body", parsed.error.issues);
    }

    const requestedProjectId = parsed.data.projectId;
    const projectId = requestedProjectId ?? ctx.projectId;
    if (!projectId) {
      throw httpError(400, "projectId is required (pass in body or use a project-scoped API key)");
    }
    await requireProjectScope(ctx, projectId);

    return getStandardsBundle(ctx.organizationId, projectId, parsed.data.slugs);
  });
}
