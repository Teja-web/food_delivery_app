import { z } from "zod/v4";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import { comments } from "@/db/schema/comment";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";

const commentSchema = z.object({
  planId: z.string().min(1),
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

export async function listCommentsForPlan(planId: string) {
  const ctx = await getActionContext();
  return db.query.comments.findMany({
    where: and(eq(comments.planId, planId), eq(comments.organizationId, ctx.organizationId)),
    orderBy: [asc(comments.createdAt)],
  });
}

export async function setCommentResolved(commentId: string, resolved: boolean) {
  const ctx = await getActionContext();
  await db
    .update(comments)
    .set({ resolved, updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.organizationId, ctx.organizationId)));
  safeRevalidate("/plans");
}
