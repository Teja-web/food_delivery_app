"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, type ProjectPhase } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { canAdvanceFrom, nextPhase } from "@/domain/phases";
import { findUnmetGates } from "@/operations/phase-gates";

export class UnmetGatesError extends Error {
  status = 409;
  constructor(public readonly unmet: { id: string; name: string; status: string }[]) {
    super(`Phase cannot advance: ${unmet.length} gate(s) unmet`);
    this.name = "UnmetGatesError";
  }
}

export async function advanceProjectPhase(projectId: string): Promise<{ phase: ProjectPhase }> {
  const ctx = await getActionContext();

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
  });
  if (!project) throw new Error("Project not found");
  if (!canAdvanceFrom(project.phase)) {
    throw new Error(`Project is already in the final phase (${project.phase}).`);
  }

  const unmet = await findUnmetGates(projectId, project.phase);
  if (unmet.length > 0) {
    throw new UnmetGatesError(unmet);
  }

  const phase = nextPhase(project.phase)!;
  await db.update(projects).set({ phase, updatedAt: new Date() }).where(eq(projects.id, projectId));

  safeRevalidate(`/projects/${projectId}`);
  safeRevalidate("/projects");
  return { phase };
}

export async function setProjectPhase(projectId: string, phase: ProjectPhase): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(projects)
    .set({ phase, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)));
  safeRevalidate(`/projects/${projectId}`);
  safeRevalidate("/projects");
}
