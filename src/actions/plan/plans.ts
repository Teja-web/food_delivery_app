"use server";

import { planCrud, createPlan as createPlanOp, listPlansByProject, appendPlanRevision, listPlanRevisions } from "@/operations/plan/plans";

export async function listPlans(opts: { offset?: number; limit?: number } = {}) {
  return planCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "updatedAt", sortOrder: "desc" });
}

export async function getPlan(id: string) {
  return planCrud.get(id);
}

export async function createPlan(input: Parameters<typeof createPlanOp>[0]) {
  return createPlanOp(input);
}

export async function updatePlan(id: string, input: Parameters<typeof planCrud.update>[1]) {
  return planCrud.update(id, input);
}

export async function deletePlan(id: string) {
  return planCrud.delete(id);
}

/**
 * Atomic edit: patches title/summary on the plan row and appends a body
 * revision when the body actually changed. Title/summary edits alone do not
 * create a revision row — the revisions log is body-only.
 */
export async function savePlanRevision(args: {
  planId: string;
  title: string;
  summary: string | null;
  body: string;
  changeNote?: string;
}) {
  const existing = await planCrud.get(args.planId);
  if (!existing) throw new Error("Plan not found");

  const titleChanged = existing.title !== args.title;
  const summaryChanged = (existing.summary ?? null) !== args.summary;
  if (titleChanged || summaryChanged) {
    await planCrud.update(args.planId, { title: args.title, summary: args.summary });
  }

  if ((existing.body ?? "") !== args.body) {
    await appendPlanRevision({
      planArtifactId: args.planId,
      body: args.body,
      changeNote: args.changeNote,
    });
  }
}

export { listPlansByProject, appendPlanRevision, listPlanRevisions };
