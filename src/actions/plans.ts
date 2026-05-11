"use server";

import { planCrud, listPlansByProject, appendPlanRevision, listPlanRevisions } from "@/operations/plans";

export async function listPlans(opts: { offset?: number; limit?: number } = {}) {
  return planCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "updatedAt", sortOrder: "desc" });
}

export async function getPlan(id: string) {
  return planCrud.get(id);
}

export async function createPlan(input: Parameters<typeof planCrud.create>[0]) {
  return planCrud.create(input);
}

export async function updatePlan(id: string, input: Parameters<typeof planCrud.update>[1]) {
  return planCrud.update(id, input);
}

export async function deletePlan(id: string) {
  return planCrud.delete(id);
}

export { listPlansByProject, appendPlanRevision, listPlanRevisions };
