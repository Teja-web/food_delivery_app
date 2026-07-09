import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";

import type { ApiContext } from "./api-key";

export type HttpError = Error & { status: number; details?: unknown };

export function httpError(status: number, message: string, details?: unknown): HttpError {
  const err = new Error(message) as HttpError;
  err.status = status;
  if (details !== undefined) err.details = details;
  return err;
}

export type ScopedProject = typeof projects.$inferSelect;

/**
 * Verify the project exists, belongs to the API key's org, and (if the key
 * is project-pinned) matches `ctx.projectId`. Throws 404 / 403 accordingly.
 * Returns the full project row.
 */
export async function requireProjectScope(
  ctx: ApiContext,
  projectId: string,
): Promise<ScopedProject> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
  });
  if (!project) throw httpError(404, "Project not found");
  if (ctx.projectId && ctx.projectId !== project.id) {
    throw httpError(403, "API key scoped to a different project.");
  }
  return project;
}
