import { z } from "zod/v4";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { comments } from "@/db/schema/plan/comment";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const commentSchema = z.object({
  planArtifactId: z.string().min(1),
  parentCommentId: z.string().optional().nullable(),
  authorId: z.string().min(1),
  authorName: z.string().optional(),
  body: z.string().min(1),
  resolved: z.boolean().default(false),
});

export const commentCrud = createEntityCrud({
  db,
  table: comments,
  queryKey: "comments",
  idField: "id",
  schema: commentSchema,
  searchFields: ["body"],
});

export async function listCommentsForPlan(planArtifactId: string) {
  const ctx = await getActionContext();
  return db.query.comments.findMany({
    where: and(
      eq(comments.planArtifactId, planArtifactId),
      eq(comments.organizationId, ctx.organizationId),
    ),
    orderBy: [asc(comments.createdAt)],
  });
}

export async function upsertExternalCommentsForPlan(
  planArtifactId: string,
  rows: Array<{
    id: string;
    authorId: string;
    authorName?: string | null;
    body: string;
    createdAt: Date;
    updatedAt?: Date;
  }>,
) {
  const ctx = await getActionContext();
  if (rows.length === 0) return;

  await db
    .insert(comments)
    .values(
      rows.map((row) => ({
        organizationId: ctx.organizationId,
        id: row.id,
        planArtifactId,
        parentCommentId: null,
        authorId: row.authorId,
        authorName: row.authorName,
        body: row.body || "No comment body.",
        resolved: false,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt ?? row.createdAt,
      })),
    )
    .onConflictDoUpdate({
      target: comments.id,
      set: {
        authorName: sql`excluded.author_name`,
        body: sql`excluded.body`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
}

export async function deleteExternalCommentsForPlan(
  planArtifactId: string,
  commentIds: string[],
) {
  const ctx = await getActionContext();
  if (commentIds.length === 0) return;

  await db
    .delete(comments)
    .where(
      and(
        eq(comments.organizationId, ctx.organizationId),
        eq(comments.planArtifactId, planArtifactId),
        inArray(comments.id, commentIds),
      ),
    );
}

export async function setCommentResolved(commentId: string, resolved: boolean) {
  const ctx = await getActionContext();
  await db
    .update(comments)
    .set({ resolved, updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.organizationId, ctx.organizationId)));
  safeRevalidate("/plans");
}
