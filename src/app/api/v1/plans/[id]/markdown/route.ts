import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projectTasks as plans } from "@/db/schema/plan/project-task";
import { projects } from "@/db/schema/project";
import { authenticate, withApiContext, UnauthorizedError } from "@/lib/auth/api-key";
import { serializePlanToMarkdown, planFilePath } from "@/domain/plan-markdown";

/**
 * GET /api/v1/plans/:id/markdown
 *
 * Returns the plan as `text/markdown` ready to drop into the consumer's
 * repo at `.coznt/plans/<kind>/<slug>.md`. The relative path is
 * surfaced in `Content-Disposition: filename` and `X-Coznt-File-Path`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let apiCtx;
  try {
    apiCtx = await authenticate(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) return new Response(err.message, { status: 401 });
    throw err;
  }
  return withApiContext(apiCtx, async (ctx) => {
    const plan = await db.query.projectTasks.findFirst({
      where: and(eq(plans.id, id), eq(plans.organizationId, ctx.organizationId)),
    });
    if (!plan) return new Response("Plan not found", { status: 404 });

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, plan.projectId),
      columns: { slug: true },
    });

    const md = serializePlanToMarkdown(plan, { project: project ?? undefined });
    const path = planFilePath(plan);

    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="${path.split("/").pop()}"`,
        "X-Coznt-File-Path": path,
        "X-Coznt-Plan-Id": plan.id,
        "X-Coznt-Plan-Updated-At": plan.updatedAt.toISOString(),
      },
    });
  });
}
