/**
 * MCP write endpoint — mark a phase gate as passed.
 *
 * Coznt's analog of `ai-sdlc-framework`'s `update_test_result` /
 * `pass_all_tests` MCP tools (commit 5880737). Used by IDE agents
 * (Cursor / Claude Code) to flip a gate green from inside the editor,
 * with the auto-advance pipeline kicking in when the last gate of the
 * current phase clears.
 *
 * Discipline checks (mirroring the FORBIDDEN list per phase):
 *   - The gate must belong to the project's *current* phase. An agent
 *     can't pre-approve a Testing gate while the project is still in
 *     Design — that's the phase-boundary violation the governance model
 *     exists to prevent.
 *   - The API key's project scope (if set) must match the gate's project.
 *
 * Returns the updated gate plus the auto-advance result, so the calling
 * agent can decide whether to surface a phase-advanced notification.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { phaseGates } from "@/db/schema/phase-gate";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { tryAdvancePhase } from "@/operations/phase-advance";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const gate = await db.query.phaseGates.findFirst({
      where: and(eq(phaseGates.id, id), eq(phaseGates.organizationId, ctx.organizationId)),
    });
    if (!gate) {
      const err = new Error("Gate not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    // Per-project API key scope check.
    if (ctx.projectId && gate.projectId !== ctx.projectId) {
      const err = new Error("Gate belongs to a different project") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, gate.projectId), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    // Phase-boundary check. Can't pre-approve a gate that belongs to a future
    // phase — that's exactly the discipline FORBIDDEN list exists to enforce.
    if (gate.phase !== project.phase) {
      const err = new Error(
        `Gate phase (${gate.phase}) does not match project's current phase (${project.phase})`,
      ) as Error & { status?: number; details?: unknown };
      err.status = 409;
      err.details = { gatePhase: gate.phase, projectPhase: project.phase };
      throw err;
    }

    if (gate.status === "passed" || gate.status === "skipped") {
      // Idempotent: no-op write, still surface the advance result.
      const advance = await tryAdvancePhase({
        organizationId: ctx.organizationId,
        projectId: project.id,
        triggeredByName: "mcp:mark-passed",
      });
      return { gate: { id: gate.id, status: gate.status }, advance };
    }

    const now = new Date();
    await db
      .update(phaseGates)
      .set({ status: "passed", evaluatedAt: now, updatedAt: now })
      .where(eq(phaseGates.id, gate.id));

    const advance = await tryAdvancePhase({
      organizationId: ctx.organizationId,
      projectId: project.id,
      triggeredByName: "mcp:mark-passed",
    });

    return {
      gate: { id: gate.id, status: "passed" as const, evaluatedAt: now.toISOString() },
      advance,
    };
  });
}
