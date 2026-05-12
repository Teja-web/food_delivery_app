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

export async function approveApproval(id: string, note?: string): Promise<void> {
  await decideApproval({ approvalId: id, decision: "approved", note });
}

export async function rejectApproval(id: string, reason: string): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new Error("A reason is required to reject an approval.");
  }
  await decideApproval({ approvalId: id, decision: "rejected", note: reason });
}

export async function bulkApproveApprovals(
  ids: string[],
  note?: string,
): Promise<{ approved: string[]; failed: { id: string; error: string }[] }> {
  const approved: string[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    try {
      await decideApproval({ approvalId: id, decision: "approved", note });
      approved.push(id);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { approved, failed };
}

export { listApprovalsForPlan, listApprovalsForEntity, decideApproval, requestPlanApproval };
