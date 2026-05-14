/**
 * GET /api/v1/mcp/projects/[id]/phase-checklist
 *
 * What needs to happen before the current phase can advance. Returns
 * the project's current phase, every gate in that phase with its
 * status, and a `readyToAdvance` boolean. The agent calls this before
 * `submit_phase_for_review` or `advance_phase`.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { phaseGates } from "@/db/schema/phase-gate";
import { projects } from "@/db/schema/project";
import { canAdvanceFrom, nextPhase } from "@/domain/phases";
import { handleApi } from "@/lib/api/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const gates = await db.query.phaseGates.findMany({
      where: and(eq(phaseGates.projectId, project.id), eq(phaseGates.phase, project.phase)),
    });

    const passed = gates.filter((g) => g.status === "passed");
    const failed = gates.filter((g) => g.status === "failed");
    const pending = gates.filter((g) => g.status === "pending");
    const skipped = gates.filter((g) => g.status === "skipped");

    const allCleared = pending.length === 0 && failed.length === 0;
    const readyToAdvance = allCleared && gates.length > 0 && canAdvanceFrom(project.phase);

    return {
      project: { id: project.id, name: project.name, phase: project.phase },
      nextPhase: nextPhase(project.phase),
      readyToAdvance,
      gates: gates.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        status: g.status,
        threshold: g.threshold,
        unmetCriterion: g.unmetCriterion,
      })),
      counts: {
        total: gates.length,
        passed: passed.length,
        failed: failed.length,
        pending: pending.length,
        skipped: skipped.length,
      },
      nextStep: readyToAdvance
        ? "All gates green. Call `advance_phase` to move forward."
        : gates.length === 0
          ? "No gates configured for this phase. Admin must add gates on the platform before advancing."
          : `${pending.length} gate(s) pending, ${failed.length} failed. Resolve them, then call \`submit_phase_for_review\`.`,
    };
  });
}
