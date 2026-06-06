/**
 * POST /api/v1/mcp/decisions — create an ADR (plan_artifact with kind=adr).
 *
 * Phase discipline is gone. ADR creation is now governed by plan-level
 * rules (keyword-presence / action-policy) on the project — see
 * `/api/v1/mcp/check-standards` for the advisory check.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { createPlan } from "@/operations/plan/plans";

const bodySchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().optional(),
  assigneeName: z.string().optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && project.id !== ctx.projectId) {
      const err = new Error("Project outside this API key's scope") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const plan = await createPlan({
      projectId: parsed.data.projectId,
      kind: "adr",
      title: parsed.data.title,
      summary: parsed.data.summary,
      body: parsed.data.body ?? `# ${parsed.data.title}\n\n${parsed.data.summary}\n`,
      status: "draft",
      assigneeName: parsed.data.assigneeName,
    });
    return { id: plan.id, kind: plan.kind, status: plan.status, title: plan.title };
  });
}
