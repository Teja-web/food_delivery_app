"use server";

/**
 * Server-action wrappers around governance_records ops. Thin pass-through.
 */

import {
  decideGovernanceRecord as decideOp,
  listPendingRecordsForUser as listPendingOp,
  listRecordsForPlan as listForPlanOp,
} from "@/operations/governance/records";
import type { GovernanceRecordStatus } from "@/db/schema/governance/records";

export async function decideGovernanceRecord(args: {
  id: string;
  status: GovernanceRecordStatus;
  decisionNote?: string;
}) {
  return decideOp(args);
}

export async function listPendingRecordsForUser(userId: string) {
  return listPendingOp(userId);
}

export async function listRecordsForPlan(planArtifactId: string) {
  return listForPlanOp(planArtifactId);
}
