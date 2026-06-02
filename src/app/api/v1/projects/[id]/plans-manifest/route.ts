import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { plans } from "@/db/schema/plan/plan";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { planFilePath } from "@/domain/plan-markdown";

/**
 * GET /api/v1/projects/:id/plans-manifest
 *
 * Returns an array describing every plan that should be present as a
 * markdown file in the project's repo, e.g. consumed by a CI job that
 * mirrors `.coznt/plans/**` from this list.
 *
 * Output:
 *   [{ id, path, kind, status, updatedAt, url }, ...]
 *
 * `url` is the absolute path on the coznt platform; the consumer's CI
 * fetches it with the same bearer token and writes the body to `path`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = new URL(req.url).origin;

  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    const rows = await db.query.plans.findMany({
      where: and(eq(plans.projectId, id), eq(plans.organizationId, ctx.organizationId)),
      columns: { id: true, kind: true, slug: true, status: true, updatedAt: true },
    });

    return {
      project: { id: project.id, slug: project.slug },
      generatedAt: new Date().toISOString(),
      plans: rows.map((p) => ({
        id: p.id,
        path: planFilePath(p),
        kind: p.kind,
        status: p.status,
        updatedAt: p.updatedAt,
        url: `${origin}/api/v1/plans/${p.id}/markdown`,
      })),
    };
  });
}
