/**
 * Governance Records — CRUD on rule applications + policy-resolution engine.
 *
 * The single non-polymorphic primitive that the four legacy systems
 * (approvals, phase_gates, gate_evaluations, reviews) collapse into.
 * Status is unified: pending → passed | failed | skipped | expired.
 */

import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { createEntityCrud } from "@/lib/crud";
import {
  governanceRecords,
  GOVERNANCE_RECORD_STATUSES,
  type GovernanceRecordStatus,
} from "@/db/schema/governance/records";
import {
  GOVERNANCE_KINDS,
  type GovernanceKind,
  type GovernancePolicy,
} from "@/db/schema/governance/policies";
import { PLAN_STATUSES, type PlanStatus } from "@/db/schema/plan/plan-kinds";
import { planArtifacts, type PlanArtifact } from "@/db/schema/plan/plan-artifact";
import { projects, type Project } from "@/db/schema/project";
import { safeRevalidate } from "@/lib/safe-revalidate";
import { getActionContext } from "@/lib/auth/context";
import { approvalPolicyDetails } from "@/lib/governance/schemas";
import { listPoliciesForTransition } from "./policies";

const policySnapshotSchema = z.object({
  policyId: z.string(),
  kind: z.enum(GOVERNANCE_KINDS),
  name: z.string(),
  details: z.record(z.string(), z.unknown()).nullable(),
  hash: z.string(),
  capturedAt: z.string(),
});

const recordSchema = z.object({
  projectId: z.string().min(1),
  planArtifactId: z.string().min(1),
  policyId: z.string().nullable().optional(),
  kind: z.enum(GOVERNANCE_KINDS),
  transitionFrom: z.enum(PLAN_STATUSES).nullable().optional(),
  transitionTo: z.enum(PLAN_STATUSES).nullable().optional(),
  status: z.enum(GOVERNANCE_RECORD_STATUSES).default("pending"),
  decidedById: z.string().nullable().optional(),
  decidedByName: z.string().nullable().optional(),
  decisionNote: z.string().nullable().optional(),
  decidedAt: z.date().nullable().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  policySnapshot: policySnapshotSchema.optional(),
});

/**
 * Stable canonical JSON of an object — keys sorted recursively. Identical
 * inputs produce identical strings regardless of key insertion order, which
 * is what makes the resulting sha256 a usable policy fingerprint.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** Frozen attestation of a policy at materialization time. */
function snapshotPolicy(policy: GovernancePolicy): z.infer<typeof policySnapshotSchema> {
  const details = (policy.details ?? null) as Record<string, unknown> | null;
  const body = canonicalJson({ kind: policy.kind, name: policy.name, details });
  return {
    policyId: policy.id,
    kind: policy.kind,
    name: policy.name,
    details,
    hash: createHash("sha256").update(body).digest("hex"),
    capturedAt: new Date().toISOString(),
  };
}

export const governanceRecordCrud = createEntityCrud({
  db,
  table: governanceRecords,
  queryKey: "governanceRecords",
  idField: "id",
  schema: recordSchema,
  searchFields: [],
  onMutate: () => safeRevalidate("/governance"),
});

export async function listRecordsForPlan(
  planArtifactId: string,
  opts: { kind?: GovernanceKind; status?: GovernanceRecordStatus } = {},
) {
  const ctx = await getActionContext();
  const conditions = [
    eq(governanceRecords.organizationId, ctx.organizationId),
    eq(governanceRecords.planArtifactId, planArtifactId),
  ];
  if (opts.kind) conditions.push(eq(governanceRecords.kind, opts.kind));
  if (opts.status) conditions.push(eq(governanceRecords.status, opts.status));
  return db.query.governanceRecords.findMany({
    where: and(...conditions),
    orderBy: [desc(governanceRecords.createdAt)],
  });
}

/**
 * Convert a policy's `details` JSONB (rule definition) into a record's
 * `details` JSONB (rule application). The two have different shapes —
 * see `src/lib/governance/schemas.ts`.
 *
 * Kind-dispatched. Approval is the only kind that does indirection
 * resolution today (`approverSource: "defaultApproverIds"` →
 * `project.defaultApproverIds`, plus `excludeAuthor` filtering).
 * Other kinds pass through unchanged for now.
 */
function policyDetailsToRecordDetails(args: {
  policy: GovernancePolicy;
  project: Project;
  plan: PlanArtifact;
}): Record<string, unknown> | undefined {
  const { policy, project, plan } = args;
  if (policy.kind !== "approval") {
    return policy.details ?? undefined;
  }
  const parsed = approvalPolicyDetails.safeParse(policy.details ?? {});
  if (!parsed.success) return policy.details ?? undefined;
  const cfg = parsed.data;
  const sourceList =
    cfg.approverSource === "defaultApproverIds"
      ? (project.defaultApproverIds ?? [])
      : cfg.approverIds;
  const filtered =
    cfg.excludeAuthor && plan.createdById
      ? sourceList.filter((id) => id !== plan.createdById)
      : sourceList;
  return {
    requestedById: plan.createdById ?? undefined,
    approverIds: filtered,
    requiredCount: cfg.requiredCount,
    decisions: [],
  };
}

/**
 * Policy-resolution engine: for a plan transitioning `from → to`, read
 * applicable policies and materialize a pending governance_record per
 * requirement. Returns the created records.
 *
 * The engine never branches on kind for control flow — that's the
 * evaluator dispatcher's job. The one kind-aware step here is
 * `policyDetailsToRecordDetails`, which is data shaping (no decisions).
 */
export async function materializeGovernanceRecords(args: {
  planArtifactId: string;
  transitionFrom: PlanStatus;
  transitionTo: PlanStatus;
}) {
  const ctx = await getActionContext();
  const plan = await db.query.planArtifacts.findFirst({
    where: and(
      eq(planArtifacts.id, args.planArtifactId),
      eq(planArtifacts.organizationId, ctx.organizationId),
    ),
  });
  if (!plan) throw new Error(`plan_artifact ${args.planArtifactId} not found`);

  const [project, policies] = await Promise.all([
    db.query.projects.findFirst({
      where: and(
        eq(projects.id, plan.projectId),
        eq(projects.organizationId, ctx.organizationId),
      ),
    }),
    listPoliciesForTransition({
      projectId: plan.projectId,
      planKind: plan.kind,
      transitionFrom: args.transitionFrom,
      transitionTo: args.transitionTo,
    }),
  ]);
  if (!project) throw new Error(`project ${plan.projectId} not found`);

  const inserted: Awaited<ReturnType<typeof governanceRecordCrud.create>>[] = [];
  for (const policy of policies) {
    const recordDetails = policyDetailsToRecordDetails({ policy, project, plan });
    const row = await governanceRecordCrud.create({
      projectId: plan.projectId,
      planArtifactId: plan.id,
      policyId: policy.id,
      kind: policy.kind,
      transitionFrom: args.transitionFrom,
      transitionTo: args.transitionTo,
      status: "pending",
      details: recordDetails,
      policySnapshot: snapshotPolicy(policy),
    });
    inserted.push(row);
  }
  return inserted;
}

/**
 * True when every transition-bound record on the plan has reached a
 * terminal-pass state (`passed` | `skipped` | `expired`).
 */
export async function allRequiredRecordsSatisfied(
  planArtifactId: string,
  transitionTo: PlanStatus,
): Promise<boolean> {
  const ctx = await getActionContext();
  const rows = await db.query.governanceRecords.findMany({
    where: and(
      eq(governanceRecords.organizationId, ctx.organizationId),
      eq(governanceRecords.planArtifactId, planArtifactId),
      eq(governanceRecords.transitionTo, transitionTo),
    ),
  });
  if (rows.length === 0) return true;
  return rows.every((r) => r.status === "passed" || r.status === "skipped" || r.status === "expired");
}

/**
 * Set a decision on a governance record. The evaluator dispatcher is the
 * only place per-kind logic runs; this op just stores the decision.
 */
export async function decideGovernanceRecord(args: {
  id: string;
  status: GovernanceRecordStatus;
  decisionNote?: string;
  detailsPatch?: Record<string, unknown>;
}) {
  const ctx = await getActionContext();
  const existing = await db.query.governanceRecords.findFirst({
    where: and(
      eq(governanceRecords.id, args.id),
      eq(governanceRecords.organizationId, ctx.organizationId),
    ),
  });
  if (!existing) throw new Error(`governance_record ${args.id} not found`);

  const mergedDetails = {
    ...(existing.details ?? {}),
    ...(args.detailsPatch ?? {}),
  };

  await db
    .update(governanceRecords)
    .set({
      status: args.status,
      decisionNote: args.decisionNote,
      decidedById: ctx.userId,
      decidedByName: ctx.user.name,
      decidedAt: new Date(),
      details: mergedDetails,
      updatedAt: new Date(),
    })
    .where(
      and(eq(governanceRecords.id, args.id), eq(governanceRecords.organizationId, ctx.organizationId)),
    );

  // Plan status progression is governed by the transition-bound records.
  // When all in_review guards pass, promote plan -> approved. Any failed
  // guard during in_review sends it back to changes_requested.
  if (existing.transitionTo === "in_review") {
    const plan = await db.query.planArtifacts.findFirst({
      where: and(
        eq(planArtifacts.id, existing.planArtifactId),
        eq(planArtifacts.organizationId, ctx.organizationId),
      ),
      columns: { id: true, status: true },
    });

    if (plan) {
      const siblings = await db.query.governanceRecords.findMany({
        where: and(
          eq(governanceRecords.organizationId, ctx.organizationId),
          eq(governanceRecords.planArtifactId, existing.planArtifactId),
          eq(governanceRecords.transitionTo, "in_review"),
        ),
        columns: { status: true },
      });

      const hasFailed = siblings.some((r) => r.status === "failed");
      const allPassed = siblings.length > 0
        && siblings.every((r) =>
          r.status === "passed" || r.status === "skipped" || r.status === "expired");

      if (hasFailed && plan.status === "in_review") {
        await db
          .update(planArtifacts)
          .set({
            status: "changes_requested",
            approvedById: null,
            approvedAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(planArtifacts.id, existing.planArtifactId),
              eq(planArtifacts.organizationId, ctx.organizationId),
            ),
          );
      } else if (allPassed) {
        await db
          .update(planArtifacts)
          .set({
            status: "approved",
            approvedById: ctx.userId,
            approvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(planArtifacts.id, existing.planArtifactId),
              eq(planArtifacts.organizationId, ctx.organizationId),
            ),
          );
      }
    }
  }

  safeRevalidate(`/governance`);
  safeRevalidate(`/plans/${existing.planArtifactId}`);
  safeRevalidate("/plans");
}

/** Returns all records the given user is listed as approver/reviewer for. */
export async function listPendingRecordsForUser(userId: string) {
  const ctx = await getActionContext();
  const rows = await db.query.governanceRecords.findMany({
    where: and(
      eq(governanceRecords.organizationId, ctx.organizationId),
      eq(governanceRecords.status, "pending"),
    ),
    orderBy: [desc(governanceRecords.createdAt)],
  });
  return rows.filter((r) => {
    const approvers = (r.details as { approverIds?: string[] } | null)?.approverIds;
    return Array.isArray(approvers) ? approvers.includes(userId) : true;
  });
}
