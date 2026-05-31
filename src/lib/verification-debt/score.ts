/**
 * Verification-debt score — pure formula.
 *
 * See `docs/product/verification-debt-thesis.md` for the rationale. The
 * formula is intentionally simple at M-B; the contract is that it is
 * derived only from the existing audit ledger, never from self-report.
 *
 *   verification_debt =
 *       (autonomy_distance_from_principal × invocations_in_window)
 *     + (open_approvals × age_in_hours × severity_weight)
 *     + (gate_trip_rate × gates_in_window × severity_weight)
 *     + (unreviewed_ai_authored_changes × time_since_authored)
 *
 * Severity weights are fixed defaults at M-B per Decision #3
 * (`security=3, coverage=2, lint=1, custom=1`); per-org override
 * via the `rules` engine is M-D scope and only added on real demand.
 */

import { MAX_LEVEL } from "@/operations/autonomy-constants";

/**
 * Whitelisted gate kinds for severity weighting. Keep in sync with the
 * `phase_gates.type` enum (`src/db/schema/phase-gate.ts`). The "approval"
 * and "unapproved_prs" kinds are intentionally absent — those failures
 * are captured by the `open_approvals` term instead, so weighting them
 * here would double-count.
 */
export type DebtGateKind = "security" | "coverage" | "lint" | "custom";

export const DEFAULT_SEVERITY_WEIGHTS: Record<DebtGateKind, number> = {
  security: 3,
  coverage: 2,
  lint: 1,
  custom: 1,
};

/** Input snapshot for one (skill, project) pair. */
export interface SkillInvocationSnapshot {
  /** Current autonomy level for this skill on this project (0..MAX_LEVEL). */
  autonomyLevel: number;
  /** Count of `skill_outcomes` for this skill in the trailing window. */
  invocationsInWindow: number;
}

export interface OpenApprovalSnapshot {
  /** Hours since the approval was requested. */
  ageHours: number;
  /** Effective severity weight for the underlying gate (defaults to 1). */
  severityWeight?: number;
}

export interface GateTripSnapshot {
  kind: DebtGateKind;
  /** Total gates of this kind in the trailing window. */
  total: number;
  /** Number that failed (`status === 'failed'`) in the window. */
  failed: number;
}

export interface UnreviewedAiChangeSnapshot {
  /** Hours since the entity was generated. */
  hoursSinceAuthored: number;
}

export interface VerificationDebtInput {
  skills: SkillInvocationSnapshot[];
  openApprovals: OpenApprovalSnapshot[];
  gateTrips: GateTripSnapshot[];
  unreviewedAiChanges: UnreviewedAiChangeSnapshot[];
  /** Optional per-org override; merges over `DEFAULT_SEVERITY_WEIGHTS`. */
  severityWeights?: Partial<Record<DebtGateKind, number>>;
}

export interface VerificationDebtBreakdown {
  /** Total score. */
  total: number;
  /** Per-term contribution so the UI can show what drives the score. */
  fromAutonomy: number;
  fromOpenApprovals: number;
  fromGateTrips: number;
  fromUnreviewed: number;
}

/**
 * Compute the verification-debt score for one project.
 *
 * Pure function — no DB access. The data-fetching wrapper that turns
 * project state into the input snapshot lives in
 * `src/operations/verification-debt.ts`.
 */
export function computeVerificationDebt(input: VerificationDebtInput): VerificationDebtBreakdown {
  const weights = { ...DEFAULT_SEVERITY_WEIGHTS, ...(input.severityWeights ?? {}) };

  let fromAutonomy = 0;
  for (const skill of input.skills) {
    const distance = Math.max(0, MAX_LEVEL - skill.autonomyLevel);
    fromAutonomy += distance * skill.invocationsInWindow;
  }

  let fromOpenApprovals = 0;
  for (const approval of input.openApprovals) {
    const weight = approval.severityWeight ?? 1;
    fromOpenApprovals += approval.ageHours * weight;
  }

  let fromGateTrips = 0;
  for (const trip of input.gateTrips) {
    if (trip.total === 0) continue;
    const rate = trip.failed / trip.total;
    const weight = weights[trip.kind] ?? 1;
    fromGateTrips += rate * trip.total * weight;
  }

  let fromUnreviewed = 0;
  for (const change of input.unreviewedAiChanges) {
    fromUnreviewed += change.hoursSinceAuthored;
  }

  return {
    total: fromAutonomy + fromOpenApprovals + fromGateTrips + fromUnreviewed,
    fromAutonomy,
    fromOpenApprovals,
    fromGateTrips,
    fromUnreviewed,
  };
}

/**
 * Compute the projected delta a PR's merge would add (or retire) from the
 * current debt score. Used by the PR-check comment bot (M-C) and the
 * blocker map UI to show "this PR will raise debt by X" before merge.
 */
export function projectedDelta(
  current: VerificationDebtBreakdown,
  projected: VerificationDebtBreakdown,
): number {
  return projected.total - current.total;
}
