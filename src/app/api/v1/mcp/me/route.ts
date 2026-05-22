/**
 * GET /api/v1/mcp/me
 *
 * Returns the project the calling API key is bound to. The MCP server
 * calls this once on first tool dispatch to auto-populate the session,
 * removing any need for the agent to call `set_project` first.
 */

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const [project] = await db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        phase: projects.phase,
      })
      .from(projects)
      .where(eq(projects.id, ctx.projectId))
      .limit(1);

    if (!project) {
      const err = new Error("API key references a project that no longer exists") as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }

    return { project };
  });
}
