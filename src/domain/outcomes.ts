/**
 * Deterministic outcome assessors — Milestone A signal.
 *
 * Pure functions that map observed (non-AI) SDLC events to a `skill_outcomes`
 * verdict. The orchestration layer (`process-webhook-event.ts` for
 * synchronous-on-event cases, `scripts/assess-outcomes.ts` for the 7-day
 * lookback) calls these and writes the row.
 *
 * Five assessors cover Milestone A:
 *
 *   PR merged, no revert within 7d, checks green            → success
 *   PR closed-without-merge after >24h open                 → rolled_back/low
 *   PR merged then reverted within 7d                       → rolled_back/high
 *   Deploy succeeded + no incident within 24h               → success
 *   Deploy rolled back, or incident within 24h post-deploy  → incident
 *
 * Side-effect free and table-testable, like `decideExecutionGate`.
 * See `docs/milestone-a-plan.md` (§ "what's missing — 1") for context.
 */

import type {
  SkillOutcomeSeverity,
  SkillOutcomeVerdict,
} from "@/db/schema/skill-outcome";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Result discriminated by `verdict`. A `null` verdict means the signal is not
 * actionable yet (e.g. observation window still open) — the caller should NOT
 * write a `skill_outcomes` row. `rationale` is always populated so we can put
 * it in audit logs or skip-reason fields.
 */
export type AssessorResult =
  | { verdict: "success"; severity: null; rationale: string }
  | { verdict: "rolled_back"; severity: "low" | "high"; rationale: string }
  | { verdict: "incident"; severity: "low" | "high" | "critical"; rationale: string }
  | { verdict: null; severity: null; rationale: string };

// Compile-time guard: the union's positive verdicts must remain a subset of
// the schema's SkillOutcomeVerdict.
type _VerdictsAlign = Exclude<AssessorResult["verdict"], null> extends SkillOutcomeVerdict
  ? true
  : never;
type _SeveritiesAlign = Exclude<AssessorResult["severity"], null> extends SkillOutcomeSeverity
  ? true
  : never;
// Reference them so the unused-type checker doesn't strip the constraint.
export type _OutcomeAlignment = [_VerdictsAlign, _SeveritiesAlign];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const PR_REVERT_WINDOW_MS = 7 * DAY_MS;
export const DEPLOY_INCIDENT_WINDOW_MS = 24 * HOUR_MS;
export const PR_ABANDON_THRESHOLD_MS = 24 * HOUR_MS;

/**
 * Which environments count as "production" for severity escalation. Customer
 * adapters can pass an override; the default covers the conventional names.
 */
const DEFAULT_PROD_ENVS: ReadonlySet<string> = new Set(["production", "prod"]);

function isProduction(environment: string, prodEnvs?: ReadonlySet<string>): boolean {
  return (prodEnvs ?? DEFAULT_PROD_ENVS).has(environment.toLowerCase());
}

function hoursBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / HOUR_MS);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// PR assessors
// ---------------------------------------------------------------------------

/** Minimal PR shape — only the fields any assessor reads. */
export interface ObservedPr {
  merged: boolean;
  /** Set when `merged === true`. */
  mergedAt: Date | null;
  closed: boolean;
  /** Set when `closed === true`. */
  closedAt: Date | null;
  createdAt: Date;
}

export interface PrPostMergeHistory {
  /** True if any revert commit referencing this PR has landed in the window. */
  reverted: boolean;
  /**
   * Whether all required CI checks ended green. `null` means we don't know —
   * the safe behaviour is to defer rather than mark success.
   */
  requiredChecksGreen: boolean | null;
}

export interface AssessmentOptions {
  /** Wall-clock "now" — injectable for deterministic tests. */
  now?: Date;
}

export interface AssessPrMergedOptions extends AssessmentOptions {
  /** Override the post-merge observation window. Default: 7 days. */
  windowMs?: number;
}

/**
 * Was this merge clean? Requires (a) the merge actually happened, (b) no
 * revert seen within the window, (c) required checks ended green, and
 * (d) the window has fully elapsed.
 *
 * Returns `verdict: null` when the window is still open — the cron lookback
 * will reassess on a later tick.
 */
export function assessPrMerged(
  pr: ObservedPr,
  history: PrPostMergeHistory,
  options: AssessPrMergedOptions = {},
): AssessorResult {
  if (!pr.merged || !pr.mergedAt) {
    return { verdict: null, severity: null, rationale: "pr has not merged" };
  }
  if (history.reverted) {
    return {
      verdict: null,
      severity: null,
      rationale: "pr was reverted — see assessPrReverted",
    };
  }
  if (history.requiredChecksGreen !== true) {
    return {
      verdict: null,
      severity: null,
      rationale:
        history.requiredChecksGreen === false
          ? "required checks are not green"
          : "required-check state unknown",
    };
  }
  const now = options.now ?? new Date();
  const windowMs = options.windowMs ?? PR_REVERT_WINDOW_MS;
  const elapsedMs = now.getTime() - pr.mergedAt.getTime();
  if (elapsedMs < windowMs) {
    const elapsedH = Math.max(0, Math.floor(elapsedMs / HOUR_MS));
    const windowH = Math.floor(windowMs / HOUR_MS);
    return {
      verdict: null,
      severity: null,
      rationale: `merged ${elapsedH}h ago — within ${windowH}h observation window`,
    };
  }
  return {
    verdict: "success",
    severity: null,
    rationale: `pr merged ${daysBetween(now, pr.mergedAt)}d ago with green checks and no revert`,
  };
}

export interface AssessPrAbandonedOptions extends AssessmentOptions {
  /** Minimum open-duration before a closed-unmerged PR counts as abandoned. */
  thresholdMs?: number;
}

/**
 * Closed-without-merge after a meaningful open period. Sub-24h closures are
 * usually "wrong branch / pushed to the wrong place" and are not a real
 * rollback signal — they get `verdict: null`.
 */
export function assessPrAbandoned(
  pr: ObservedPr,
  options: AssessPrAbandonedOptions = {},
): AssessorResult {
  if (!pr.closed || !pr.closedAt) {
    return { verdict: null, severity: null, rationale: "pr is not closed" };
  }
  if (pr.merged) {
    return { verdict: null, severity: null, rationale: "pr merged — not abandoned" };
  }
  const thresholdMs = options.thresholdMs ?? PR_ABANDON_THRESHOLD_MS;
  const openMs = pr.closedAt.getTime() - pr.createdAt.getTime();
  if (openMs < thresholdMs) {
    const openH = Math.max(0, Math.floor(openMs / HOUR_MS));
    return {
      verdict: null,
      severity: null,
      rationale: `closed after ${openH}h — under the ${Math.floor(thresholdMs / HOUR_MS)}h abandonment threshold`,
    };
  }
  return {
    verdict: "rolled_back",
    severity: "low",
    rationale: `pr open ${Math.floor(openMs / HOUR_MS)}h then closed without merge`,
  };
}

export interface RevertCommit {
  /** When the revert commit landed (on the default branch). */
  committedAt: Date;
  /** Optional — for the rationale string only. */
  sha?: string;
}

export interface AssessPrRevertedOptions extends AssessmentOptions {
  /** Window in which a revert counts against the merge. Default: 7 days. */
  windowMs?: number;
}

/**
 * Reverted-within-window. A revert outside the window does NOT roll back the
 * outcome — by then the merge has earned its `success` row and the revert is
 * its own independent event.
 */
export function assessPrReverted(
  pr: ObservedPr,
  revertCommit: RevertCommit,
  options: AssessPrRevertedOptions = {},
): AssessorResult {
  if (!pr.merged || !pr.mergedAt) {
    return {
      verdict: null,
      severity: null,
      rationale: "pr never merged — revert cannot apply",
    };
  }
  const windowMs = options.windowMs ?? PR_REVERT_WINDOW_MS;
  const deltaMs = revertCommit.committedAt.getTime() - pr.mergedAt.getTime();
  if (deltaMs < 0) {
    return {
      verdict: null,
      severity: null,
      rationale: "revert commit predates the merge — likely misattributed",
    };
  }
  if (deltaMs > windowMs) {
    return {
      verdict: null,
      severity: null,
      rationale: `revert landed ${daysBetween(revertCommit.committedAt, pr.mergedAt)}d after merge — outside ${Math.floor(windowMs / DAY_MS)}d window`,
    };
  }
  return {
    verdict: "rolled_back",
    severity: "high",
    rationale: `merge reverted ${hoursBetween(revertCommit.committedAt, pr.mergedAt)}h later${revertCommit.sha ? ` (${revertCommit.sha.slice(0, 12)})` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Deploy assessors
// ---------------------------------------------------------------------------

/** Minimal deploy shape — only what assessors read. */
export interface ObservedDeploy {
  status: "success" | "failed" | "rolled_back";
  environment: string;
  /** Wall-clock time the deploy reached its terminal state. */
  completedAt: Date | null;
  rolledBackAt: Date | null;
}

/** A discrete incident or post-deploy event flagged against this deploy. */
export interface PostDeployIncident {
  occurredAt: Date;
  /** Optional — surfaces in the rationale. */
  summary?: string;
}

export interface AssessDeployCleanOptions extends AssessmentOptions {
  /** Post-deploy incident window. Default: 24 hours. */
  windowMs?: number;
  /** Override the set of "production" environment names. */
  productionEnvironments?: ReadonlySet<string>;
}

/**
 * Was this deploy clean? Successful + no incident landed in the 24h after
 * `completedAt` + the window has fully elapsed. Premature calls yield
 * `verdict: null`.
 */
export function assessDeployClean(
  deploy: ObservedDeploy,
  history: { firstIncidentAt: Date | null },
  options: AssessDeployCleanOptions = {},
): AssessorResult {
  if (deploy.status !== "success" || !deploy.completedAt) {
    return {
      verdict: null,
      severity: null,
      rationale: `deploy status is ${deploy.status} — not a clean candidate`,
    };
  }
  const windowMs = options.windowMs ?? DEPLOY_INCIDENT_WINDOW_MS;
  if (history.firstIncidentAt) {
    const sinceDeployMs = history.firstIncidentAt.getTime() - deploy.completedAt.getTime();
    if (sinceDeployMs >= 0 && sinceDeployMs <= windowMs) {
      return {
        verdict: null,
        severity: null,
        rationale: "incident landed within window — see assessDeployIncident",
      };
    }
  }
  const now = options.now ?? new Date();
  const elapsedMs = now.getTime() - deploy.completedAt.getTime();
  if (elapsedMs < windowMs) {
    return {
      verdict: null,
      severity: null,
      rationale: `deployed ${Math.max(0, Math.floor(elapsedMs / HOUR_MS))}h ago — within ${Math.floor(windowMs / HOUR_MS)}h observation window`,
    };
  }
  return {
    verdict: "success",
    severity: null,
    rationale: `${deploy.environment} deploy clean after ${Math.floor(elapsedMs / HOUR_MS)}h with no incident`,
  };
}

export interface AssessDeployIncidentOptions extends AssessmentOptions {
  /** Post-deploy incident window. Default: 24 hours. */
  windowMs?: number;
  /** Override the set of "production" environment names. */
  productionEnvironments?: ReadonlySet<string>;
}

/**
 * Deploy ended badly — explicit rollback or a linked incident inside the
 * window. Severity escalates to `critical` for production environments,
 * `high` otherwise.
 */
export function assessDeployIncident(
  deploy: ObservedDeploy,
  incident: PostDeployIncident | null,
  options: AssessDeployIncidentOptions = {},
): AssessorResult {
  const prod = isProduction(deploy.environment, options.productionEnvironments);

  if (deploy.status === "rolled_back") {
    const at = deploy.rolledBackAt ?? deploy.completedAt;
    const detail = at ? ` at ${at.toISOString()}` : "";
    return {
      verdict: "incident",
      severity: prod ? "critical" : "high",
      rationale: `${deploy.environment} deploy rolled back${detail}`,
    };
  }

  if (deploy.status === "failed") {
    return {
      verdict: "incident",
      severity: prod ? "critical" : "high",
      rationale: `${deploy.environment} deploy failed to reach terminal-success state`,
    };
  }

  if (!incident || !deploy.completedAt) {
    return {
      verdict: null,
      severity: null,
      rationale: "no incident linked to this deploy",
    };
  }

  const windowMs = options.windowMs ?? DEPLOY_INCIDENT_WINDOW_MS;
  const sinceDeployMs = incident.occurredAt.getTime() - deploy.completedAt.getTime();
  if (sinceDeployMs < 0) {
    return {
      verdict: null,
      severity: null,
      rationale: "incident predates deploy — not attributable",
    };
  }
  if (sinceDeployMs > windowMs) {
    return {
      verdict: null,
      severity: null,
      rationale: `incident ${hoursBetween(incident.occurredAt, deploy.completedAt)}h after deploy — outside ${Math.floor(windowMs / HOUR_MS)}h window`,
    };
  }
  return {
    verdict: "incident",
    severity: prod ? "critical" : "high",
    rationale: `incident ${hoursBetween(incident.occurredAt, deploy.completedAt)}h after ${deploy.environment} deploy${incident.summary ? `: ${incident.summary}` : ""}`,
  };
}
