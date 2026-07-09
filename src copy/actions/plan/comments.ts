"use server";

import { commentCrud, listCommentsForPlan, setCommentResolved } from "@/operations/plan/comments";

export async function createComment(input: Parameters<typeof commentCrud.create>[0]) {
  return commentCrud.create(input);
}

export async function deleteComment(id: string) {
  return commentCrud.delete(id);
}

export { listCommentsForPlan, setCommentResolved };
