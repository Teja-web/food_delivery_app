/**
 * POST /api/v1/mcp/decisions — create an ADR (plan with kind=adr).
 *
 * Phase discipline: rejects when the project is in a phase whose
 * FORBIDDEN list bans ADR creation. The Design phase explicitly allows
 * it; Development implicitly allows (already-locked decisions can still
 * be amended); other phases are stricter.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { projects, type Project } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";
import { handleApi } from "@/lib/auth/api-key";
import { planCrud } from "@/operations/plans";

const bodySchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.string().optional(),
  assigneeName: z.string().optional(),
});

/**
 * Phases where logging an ADR is explicitly allowed. Mirrors the ALLOWED
 * lists in `src/domain/phases.ts` — design is the canonical phase for
 * ADRs, development is permissive for follow-on decisions, the rest
 * reject the call.
 */
const ADR_ALLOWED_PHASES = new Set<Project["phase"]>(["design", "development"]);

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const project = (await db.query.projects.findFirst({
      where: and(eq(projects.id, parsed.data.projectId), eq(projects.organizationId, ctx.organizationId)),
    })) as Project | undefined;
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

    if (!ADR_ALLOWED_PHASES.has(project.phase)) {
      const err = new Error(
        `Logging an ADR is not allowed in phase "${project.phase}". Forbidden in this phase per the discipline model — see get_my_context.`,
      ) as Error & { status?: number; details?: unknown };
      err.status = 409;
      err.details = { phase: project.phase, forbidden: PHASE_GUIDANCE[project.phase].forbidden };
      throw err;
    }

    const plan = await planCrud.create({
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
