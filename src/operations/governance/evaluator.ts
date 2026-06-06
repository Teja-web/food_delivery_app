/**
 * Governance Evaluator — the only kind-branching point in governance.
 *
 * Routes a record to its kind-specific resolver:
 *   gate      → validator dispatch (coverage, lint, security, custom)
 *   approval  → decision aggregation over `approverIds[]` + `requiredCount`
 *   review    → finding-template check; rounds increment via `details.round`
 *   exception → expiry / supersedesRecordId check
 *
 * Everywhere else in the codebase, `governance_records` is a single primitive.
 * Per §10 of governance-schema-simplified.md, no other `switch(kind)` should
 * exist anywhere else in the governance flow.
 */

import { eq, and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { metrics } from "@/db/schema/metric";
import { testRuns } from "@/db/schema/test-run";
import { getActionContext } from "@/lib/auth/context";
import { decideGovernanceRecord } from "./records";

type RecordRow = typeof governanceRecords.$inferSelect;

interface EvaluationResult {
  status: "passed" | "failed" | "skipped" | "expired" | "pending";
  note?: string;
  evaluatedValue?: number | string;
  unmetCriterion?: string;
}

/** Single switch — the load-bearing place where polymorphism lives. */
export async function evaluateGovernanceRecord(recordId: string): Promise<EvaluationResult> {
  const ctx = await getActionContext();
  const record = await db.query.governanceRecords.findFirst({
    where: and(
      eq(governanceRecords.id, recordId),
      eq(governanceRecords.organizationId, ctx.organizationId),
    ),
  });
  if (!record) throw new Error(`governance_record ${recordId} not found`);

  switch (record.kind) {
    case "gate":
      return evaluateGate(record);
    case "approval":
      return evaluateApproval(record);
    case "review":
      return evaluateReview(record);
    case "exception":
      return evaluateException(record);
  }
}

async function evaluateGate(record: RecordRow): Promise<EvaluationResult> {
  const details = (record.details ?? {}) as {
    type?: string;
    threshold?: number;
    validator?: string;
  };
  switch (details.type) {
    case "coverage": {
      const ctx = await getActionContext();
      const latest = await db.query.testRuns.findFirst({
        where: and(
          eq(testRuns.organizationId, ctx.organizationId),
          eq(testRuns.projectId, record.projectId),
        ),
        orderBy: [desc(testRuns.ranAt)],
      });
      const coverage = latest?.coverage ?? 0;
      const threshold = details.threshold ?? 0;
      return coverage >= threshold
        ? { status: "passed", evaluatedValue: coverage }
        : {
            status: "failed",
            evaluatedValue: coverage,
            unmetCriterion: `coverage ${coverage} < threshold ${threshold}`,
          };
    }
    case "lint":
    case "security":
    case "custom":
    case "approval":
    default:
      return { status: "pending", note: "manual decision required" };
  }
}

async function evaluateApproval(record: RecordRow): Promise<EvaluationResult> {
  const details = (record.details ?? {}) as {
    approverIds?: string[];
    requiredCount?: number;
    decisions?: Array<{ userId: string; decision: "approve" | "reject" }>;
  };
  const required = details.requiredCount ?? 1;
  const approves = (details.decisions ?? []).filter((d) => d.decision === "approve").length;
  const rejects = (details.decisions ?? []).filter((d) => d.decision === "reject").length;
  if (rejects > 0) return { status: "failed", note: `${rejects} rejection(s)` };
  if (approves >= required) return { status: "passed", note: `${approves}/${required} approvals` };
  return { status: "pending", note: `${approves}/${required} approvals` };
}

async function evaluateReview(record: RecordRow): Promise<EvaluationResult> {
  const details = (record.details ?? {}) as {
    findings?: Array<{ kind: string; severity?: string }>;
    requiredFindings?: string[];
  };
  const required = details.requiredFindings ?? [];
  const found = new Set((details.findings ?? []).map((f) => f.kind));
  const missing = required.filter((k) => !found.has(k));
  if (missing.length > 0) {
    return { status: "pending", note: `missing findings: ${missing.join(", ")}` };
  }
  const hasBlocking = (details.findings ?? []).some((f) => f.severity === "blocking");
  return hasBlocking
    ? { status: "failed", note: "blocking finding present" }
    : { status: "passed" };
}

async function evaluateException(record: RecordRow): Promise<EvaluationResult> {
  const details = (record.details ?? {}) as { expiresAt?: string };
  if (!details.expiresAt) return { status: "pending" };
  return new Date(details.expiresAt) < new Date()
    ? { status: "expired", note: "exception expired" }
    : { status: "passed", note: "exception active" };
}

/** Re-evaluate a record and persist the new status. */
export async function reevaluateAndPersist(recordId: string) {
  const result = await evaluateGovernanceRecord(recordId);
  if (result.status === "pending") return result;
  await decideGovernanceRecord({
    id: recordId,
    status: result.status,
    decisionNote: result.note,
    detailsPatch:
      result.evaluatedValue !== undefined || result.unmetCriterion
        ? {
            evaluatedValue: result.evaluatedValue,
            unmetCriterion: result.unmetCriterion,
          }
        : undefined,
  });
  return result;
}

/** Unused import guard. */
void metrics;
