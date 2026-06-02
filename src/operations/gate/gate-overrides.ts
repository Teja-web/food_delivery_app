/**
 * Gate overrides — operations.
 *
 * Auditable "skip with reason" for a phase gate. Requires a Plan reference
 * (the authority document for the override) and the autonomy level of the
 * actor at override time. Status moves to `skipped`; the override columns
 * become the audit trail explaining why.
 *
 * Doctrine note: this is the *only* way to clear a failing gate without
 * making it pass. Setting status to `skipped` without these columns is a
 * defect — every skip must be defensible.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { phaseGates } from "@/db/schema/phase-gate";

export interface RecordOverrideInput {
  gateId: string;
  /** User initiating the override. */
  overriddenById: string;
  /** Free-text explanation; should reference the Plan that authorizes it. */
  reason: string;
  /** Plan that authorizes this override (ADR, exception request, etc.). */
  authorizingPlanId: string;
  /** Autonomy level of the overriding actor at override time. */
  autonomyAtTime: number;
}

/**
 * Record a gate override. Flips status to `skipped`, populates the
 * override columns, and bumps `updatedAt`. Idempotent for the
 * `(gate, override) = same` case via the explicit fields — but a
 * second override on the same gate overwrites the first (the latest
 * decision wins; prior overrides survive in `audit_logs`).
 */
export async function recordOverride(input: RecordOverrideInput): Promise<void> {
  await db
    .update(phaseGates)
    .set({
      status: "skipped",
      overriddenAt: new Date(),
      overriddenById: input.overriddenById,
      overrideReason: input.reason,
      overrideAuthorizingPlanId: input.authorizingPlanId,
      overrideAutonomyAtTime: input.autonomyAtTime,
      updatedAt: new Date(),
    })
    .where(eq(phaseGates.id, input.gateId));
}

/**
 * Clear a previously-recorded override. Status returns to `pending`;
 * override columns are nulled. Used when an override is rescinded.
 */
export async function clearOverride(gateId: string): Promise<void> {
  await db
    .update(phaseGates)
    .set({
      status: "pending",
      overriddenAt: null,
      overriddenById: null,
      overrideReason: null,
      overrideAuthorizingPlanId: null,
      overrideAutonomyAtTime: null,
      updatedAt: new Date(),
    })
    .where(eq(phaseGates.id, gateId));
}
