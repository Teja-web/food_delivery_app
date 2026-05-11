"use server";

import {
  approvalCrud,
  listApprovalsForPlan,
  listApprovalsForEntity,
  decideApproval,
  requestPlanApproval,
} from "@/operations/approvals";

export async function listApprovals(opts: { offset?: number; limit?: number } = {}) {
  return approvalCrud.list({ offset: opts.offset ?? 0, limit: opts.limit ?? 25, sortBy: "createdAt", sortOrder: "desc" });
}

export async function getApproval(id: string) {
  return approvalCrud.get(id);
}

export async function createApproval(input: Parameters<typeof approvalCrud.create>[0]) {
  return approvalCrud.create(input);
}

export { listApprovalsForPlan, listApprovalsForEntity, decideApproval, requestPlanApproval };
