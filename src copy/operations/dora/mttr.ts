/**
 * MTTR — mean time to recovery.
 *
 * Each "incident" is a deployment that ended in `failed` or `rolled_back`
 * status. Recovery is whichever happens first:
 *
 *   - The same deploy's `rolledBackAt` (rollback restored the prior good
 *     state in place)
 *   - The next successful deploy in the same `(projectId, environment)`
 *     lane (forward-fix returned to a working state)
 *
 * Pairing rule — only the *first* failure in a streak is the incident
 * start. If a project has failed, failed, failed, success deploys in a
 * row, MTTR is `success.completedAt - firstFailure.completedAt`. The
 * second and third failures are continuations of the same incident, not
 * separate ones. Without this rule, a long incident gets counted N times.
 *
 * The metric row is written inline by `recordDeployment` (success path)
 * or by `recordRollback` (in-place rollback path), with metadata that
 * pairs the recovery deployment to the original failure. Idempotency is
 * enforced on `(failedDeploymentId)` via a lookup before insert.
 */

import { and, asc, desc, eq, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { deployments, type Deployment } from "@/db/schema/deployment";
import { metrics } from "@/db/schema/metric";

const HOUR_MS = 60 * 60 * 1000;

export interface MttrPairing {
  failedDeploymentId: string;
  recoveryDeploymentId: string | null;
  recoveryType: "rollback" | "next_success";
  recoveredAt: Date;
  failedAt: Date;
  /** Recovery time in hours. */
  hours: number;
}

/**
 * Find the most recent prior incident in the same lane that hasn't been
 * recovered yet (no successful deploy between it and `successDeploy`,
 * and the failure itself wasn't a rolled-back deploy).
 *
 * Used by `recordMttrForSuccess()` — exposed for testing via a thin
 * pure-function shim in `selectIncidentToPair()` below.
 */
export interface DeploymentLite {
  id: string;
  status: Deployment["status"];
  environment: string;
  completedAt: Date | null;
  rolledBackAt: Date | null;
}

/**
 * Pure pairing logic — given a chronologically-ordered list of past
 * deployments in the same lane (oldest first), return the unpaired
 * incident that the most recent success closes. Returns null when:
 *   - there is no prior failure, OR
 *   - the streak's first failure already had its own `rolledBackAt`
 *     (its MTTR was written by `recordRollbackForDeployment`).
 *
 * The caller is responsible for filtering by lane (projectId+environment).
 */
export function selectIncidentToPair(
  history: DeploymentLite[],
  successDeploy: DeploymentLite,
): DeploymentLite | null {
  if (successDeploy.status !== "success") return null;
  // Walk back through `history` (chronological) until we hit either a
  // success (no open incident) or the *first* failure of the current
  // failing streak (the incident start).
  let firstFailureInStreak: DeploymentLite | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const d = history[i];
    if (d.status === "success") {
      // Hit a previous success — anything before this is closed.
      break;
    }
    if (d.status === "failed" || d.status === "rolled_back") {
      // If this failure already has its own rollback recovery, it was
      // closed in place — don't re-pair it.
      if (d.rolledBackAt) {
        break;
      }
      firstFailureInStreak = d;
    }
  }
  return firstFailureInStreak;
}

/**
 * Compute MTTR for the in-place rollback case: `rolledBackAt - completedAt`
 * for a deployment whose status flipped to `rolled_back`. Pure function.
 */
export function rollbackPairing(deploy: DeploymentLite): MttrPairing | null {
  if (deploy.status !== "rolled_back") return null;
  if (!deploy.completedAt || !deploy.rolledBackAt) return null;
  const ms = deploy.rolledBackAt.getTime() - deploy.completedAt.getTime();
  if (ms < 0) return null;
  return {
    failedDeploymentId: deploy.id,
    recoveryDeploymentId: deploy.id,
    recoveryType: "rollback",
    failedAt: deploy.completedAt,
    recoveredAt: deploy.rolledBackAt,
    hours: ms / HOUR_MS,
  };
}

async function mttrExistsForFailure(
  organizationId: string,
  failedDeploymentId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: metrics.id })
    .from(metrics)
    .where(
      and(
        eq(metrics.organizationId, organizationId),
        eq(metrics.type, "mttr"),
        sql`${metrics.metadata}->>'failedDeploymentId' = ${failedDeploymentId}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function writeMttrRow(
  d: Pick<Deployment, "organizationId" | "projectId">,
  pairing: MttrPairing,
  environment: string,
): Promise<void> {
  if (await mttrExistsForFailure(d.organizationId, pairing.failedDeploymentId)) return;
  await db.insert(metrics).values({
    organizationId: d.organizationId,
    projectId: d.projectId,
    type: "mttr",
    value: pairing.hours,
    unit: "hours",
    metadata: {
      environment,
      recoveryType: pairing.recoveryType,
      failedDeploymentId: pairing.failedDeploymentId,
      recoveryDeploymentId: pairing.recoveryDeploymentId,
      failedAt: pairing.failedAt.toISOString(),
      recoveredAt: pairing.recoveredAt.toISOString(),
    },
    recordedAt: pairing.recoveredAt,
  });
}

/**
 * Inline side-effect for `recordDeployment` when a successful deploy
 * lands: pair it with the first failure of the current incident streak
 * (if any) and write an mttr row.
 */
export async function recordMttrForSuccess(deploy: Deployment): Promise<void> {
  if (deploy.status !== "success" || !deploy.completedAt) return;

  const prior = await db
    .select({
      id: deployments.id,
      status: deployments.status,
      environment: deployments.environment,
      completedAt: deployments.completedAt,
      rolledBackAt: deployments.rolledBackAt,
    })
    .from(deployments)
    .where(
      and(
        eq(deployments.projectId, deploy.projectId),
        eq(deployments.environment, deploy.environment),
        lt(deployments.startedAt, deploy.startedAt),
      ),
    )
    .orderBy(asc(deployments.startedAt))
    .limit(50);

  const failure = selectIncidentToPair(
    prior as DeploymentLite[],
    {
      id: deploy.id,
      status: deploy.status,
      environment: deploy.environment,
      completedAt: deploy.completedAt,
      rolledBackAt: deploy.rolledBackAt,
    },
  );
  if (!failure || !failure.completedAt) return;
  const hours = (deploy.completedAt.getTime() - failure.completedAt.getTime()) / HOUR_MS;
  if (hours < 0) return;
  await writeMttrRow(deploy, {
    failedDeploymentId: failure.id,
    recoveryDeploymentId: deploy.id,
    recoveryType: "next_success",
    failedAt: failure.completedAt,
    recoveredAt: deploy.completedAt,
    hours,
  }, deploy.environment);
}

/**
 * Inline side-effect for the in-place rollback path. Writes the
 * `rolledBackAt - completedAt` window as MTTR — the deploy itself
 * recovered, no follow-up success deploy needed.
 */
export async function recordMttrForRollback(deploy: Deployment): Promise<void> {
  const pairing = rollbackPairing({
    id: deploy.id,
    status: deploy.status,
    environment: deploy.environment,
    completedAt: deploy.completedAt,
    rolledBackAt: deploy.rolledBackAt,
  });
  if (!pairing) return;
  await writeMttrRow(deploy, pairing, deploy.environment);
}

// Future use: walk historical deployments to backfill MTTR for incidents
// that pre-date this code path. Exposed for the backfill script.
export async function findUnpairedIncidents(
  organizationId: string,
  limit = 500,
): Promise<Deployment[]> {
  const rows = await db
    .select()
    .from(deployments)
    .where(
      and(
        eq(deployments.organizationId, organizationId),
        sql`${deployments.status} in ('failed', 'rolled_back')`,
      ),
    )
    .orderBy(desc(deployments.startedAt))
    .limit(limit);
  return rows;
}
