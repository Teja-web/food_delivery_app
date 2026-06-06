"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { getActionContext } from "@/lib/auth/context";
import { safeRevalidate } from "@/lib/safe-revalidate";

export async function archiveProject(projectId: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(projects)
    .set({ status: "archived", updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)));
  safeRevalidate(`/projects/${projectId}`);
  safeRevalidate(`/projects`);
}

export async function restoreProject(projectId: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(projects)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)));
  safeRevalidate(`/projects/${projectId}`);
  safeRevalidate(`/projects`);
}
