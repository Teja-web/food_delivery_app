/**
 * Per-project learnings — lightweight notes that the agent's
 * `get_my_context` surfaces on every session start. Soft-deleted so
 * the audit log can still cite past learnings.
 *
 * Three ops surface here:
 *   - listProjectLearnings — for the cockpit UI and the MCP context call
 *   - createProjectLearning — used by both the UI form and (eventually) an
 *     `add_project_note` MCP verb if we add one
 *   - softDeleteProjectLearning — sets deleted_at; row is still queryable
 *     by audit but excluded from default lists
 */

import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { projectLearnings, type ProjectLearning } from "@/db/schema/plan/project-learning";
import { getActionContext } from "@/lib/auth/context";

export async function listProjectLearnings(
  projectId: string,
  options: { limit?: number; includeDeleted?: boolean } = {},
): Promise<ProjectLearning[]> {
  const ctx = await getActionContext();
  const { limit = 20, includeDeleted = false } = options;
  const conditions = [
    eq(projectLearnings.organizationId, ctx.organizationId),
    eq(projectLearnings.projectId, projectId),
  ];
  if (!includeDeleted) conditions.push(isNull(projectLearnings.deletedAt));

  return db
    .select()
    .from(projectLearnings)
    .where(and(...conditions))
    .orderBy(asc(projectLearnings.pinOrder), desc(projectLearnings.createdAt))
    .limit(limit);
}

export interface CreateProjectLearningInput {
  projectId: string;
  body: string;
  pinOrder?: number | null;
}

export async function createProjectLearning(
  input: CreateProjectLearningInput,
): Promise<ProjectLearning> {
  const ctx = await getActionContext();
  const body = input.body.trim();
  if (body.length === 0) {
    throw new Error("Learning body must be non-empty");
  }
  const [row] = await db
    .insert(projectLearnings)
    .values({
      organizationId: ctx.organizationId,
      projectId: input.projectId,
      body,
      pinOrder: input.pinOrder ?? null,
      createdById: ctx.userId,
      createdByName: ctx.user.name,
    })
    .returning();
  return row;
}

export async function softDeleteProjectLearning(id: string): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(projectLearnings)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(projectLearnings.id, id),
        eq(projectLearnings.organizationId, ctx.organizationId),
      ),
    );
}

/**
 * Pin / unpin / re-order. Setting `pinOrder = null` unpins. Operators
 * use small integers (1, 2, 3) to float critical learnings to the top.
 */
export async function setProjectLearningPin(
  id: string,
  pinOrder: number | null,
): Promise<void> {
  const ctx = await getActionContext();
  await db
    .update(projectLearnings)
    .set({ pinOrder, updatedAt: new Date() })
    .where(
      and(
        eq(projectLearnings.id, id),
        eq(projectLearnings.organizationId, ctx.organizationId),
      ),
    );
}
