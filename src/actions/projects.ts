"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { assertElevatedRole, getActionContext } from "@/lib/auth/context";
import { projectCrud } from "@/operations/projects";
import { safeRevalidate } from "@/lib/safe-revalidate";

export async function listProjects(opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function searchProjects(query: string, opts: { offset?: number; limit?: number } = {}) {
  return projectCrud.search(query, { offset: opts.offset ?? 0, limit: opts.limit ?? 25 });
}

export async function getProject(id: string) {
  return projectCrud.get(id);
}

export async function createProject(input: Parameters<typeof projectCrud.create>[0]) {
  return projectCrud.create(input);
}

export async function updateProject(id: string, input: Parameters<typeof projectCrud.update>[1]) {
  return projectCrud.update(id, input);
}

export async function deleteProject(id: string) {
  return projectCrud.delete(id);
}

/**
 * Toggle the per-project "require human approval for merge" gate-policy
 * flag. Governance-sensitive — only admin/owner roles can flip it so a
 * leaked member key can't open or close the dispatch gate.
 */
export async function setRequireHumanApprovalForMerge(
  projectId: string,
  value: boolean,
): Promise<{ projectId: string; requireHumanApprovalForMerge: boolean }> {
  const ctx = await getActionContext();
  assertElevatedRole(ctx, "Changing the merge-approval policy");

  await db
    .update(projects)
    .set({ requireHumanApprovalForMerge: value, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)));

  safeRevalidate(`/projects/${projectId}`);
  return { projectId, requireHumanApprovalForMerge: value };
}
