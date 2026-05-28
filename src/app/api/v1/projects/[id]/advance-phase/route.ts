import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { hasElevatedRole } from "@/lib/auth/context";
import { canAdvanceFrom, nextPhase } from "@/domain/phases";
import { findUnmetGates } from "@/operations/phase-gates";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    // Governance gate: only admin/owner API keys can advance phase. Default
    // member keys (used by IDE agents) cannot — mint a separate admin key
    // for CI/promotion automation.
    if (!hasElevatedRole({ isAdmin: false, role: ctx.role })) {
      const err = new Error(
        `Advance-phase requires an admin or owner API key (current role: ${ctx.role}).`,
      ) as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (!canAdvanceFrom(project.phase)) {
      const err = new Error(`Already in final phase (${project.phase})`) as Error & { status?: number };
      err.status = 409;
      throw err;
    }

    const unmet = await findUnmetGates(id, project.phase);
    if (unmet.length > 0) {
      const err = new Error("Unmet phase gates") as Error & { status?: number; details?: unknown };
      err.status = 409;
      err.details = { unmet };
      throw err;
    }

    const phase = nextPhase(project.phase)!;
    await db.update(projects).set({ phase, updatedAt: new Date() }).where(eq(projects.id, id));
    return { id, phase };
  });
}
