/**
 * Compute the human-readable "distance to next autonomy level" given a
 * snapshot of the ledger window.
 *
 * Pure function — no DB access, no current time dependency outside of the
 * passed-in `daysAtLevel`. Reads the same thresholds the recompute logic
 * uses in `src/operations/skill-autonomy.ts`, so the UI signal cannot
 * drift from the actual promotion math.
 */

import {
  PROMOTE_SUCCESS_RATE,
  MIN_SAMPLES_FOR_PROMOTION,
  PROMOTE_MIN_AT_LEVEL_DAYS,
  MAX_LEVEL,
  MIN_LEVEL,
  LEVEL_NAMES,
  type LevelName,
} from "@/operations/autonomy-constants";

export interface AutonomyDistanceInput {
  /** Current level (0–3). */
  level: number;
  /** Whole days spent at the current level. */
  daysAtLevel: number;
  /** Outcome counts inside the trailing 30-day window. */
  windowStats: {
    total: number;
    successes: number;
    rollbacks: number;
    incidents: number;
    criticalIncidents: number;
  };
}

export type AutonomyDistanceKind =
  | "at-top"
  | "demotion-pending"
  | "needs-samples"
  | "needs-clean-runs"
  | "needs-time"
  | "eligible";

export interface AutonomyDistance {
  kind: AutonomyDistanceKind;
  /** A short string suitable for a UI chip. */
  label: string;
  /** Optional next level name when applicable. */
  nextLevel?: LevelName;
}

const TARGET_SUCCESSES_FOR_PROMOTION = MIN_SAMPLES_FOR_PROMOTION;

/**
 * Distance-to-next-level signal. The math here MUST stay consistent with
 * the promotion + demotion conditions in `recomputeSkillAutonomy()`.
 */
export function computeAutonomyDistance(
  input: AutonomyDistanceInput,
): AutonomyDistance {
  const { level, daysAtLevel, windowStats } = input;

  // Demotion path takes priority — a single critical incident immediately
  // demotes the skill to Intern.
  if (windowStats.criticalIncidents > 0 && level > MIN_LEVEL) {
    return {
      kind: "demotion-pending",
      label: `Demotion: ${windowStats.criticalIncidents} critical incident${windowStats.criticalIncidents === 1 ? "" : "s"} in window`,
    };
  }

  if (level >= MAX_LEVEL) {
    return {
      kind: "at-top",
      label: "Lead — top of the ladder",
    };
  }

  const nextLevel = LEVEL_NAMES[level + 1] ?? "observe";

  // Samples gate.
  if (windowStats.total < TARGET_SUCCESSES_FOR_PROMOTION) {
    const need = TARGET_SUCCESSES_FOR_PROMOTION - windowStats.total;
    return {
      kind: "needs-samples",
      label: `${need} more invocation${need === 1 ? "" : "s"} to ${nextLevel}`,
      nextLevel,
    };
  }

  // Success rate gate.
  const rate = windowStats.successes / windowStats.total;
  if (rate < PROMOTE_SUCCESS_RATE) {
    // How many additional clean runs would push the rate above 0.9?
    // Solve (s + x) / (t + x) >= 0.9 → x >= (0.9·t − s) / 0.1
    const needFloat =
      (PROMOTE_SUCCESS_RATE * windowStats.total - windowStats.successes) /
      (1 - PROMOTE_SUCCESS_RATE);
    const need = Math.max(1, Math.ceil(needFloat));
    return {
      kind: "needs-clean-runs",
      label: `${need} more clean run${need === 1 ? "" : "s"} to lift success rate to ${nextLevel}`,
      nextLevel,
    };
  }

  // Time gate.
  if (daysAtLevel < PROMOTE_MIN_AT_LEVEL_DAYS) {
    const need = PROMOTE_MIN_AT_LEVEL_DAYS - Math.floor(daysAtLevel);
    return {
      kind: "needs-time",
      label: `${need}d at level remaining to ${nextLevel}`,
      nextLevel,
    };
  }

  // All gates clear.
  return {
    kind: "eligible",
    label: `Eligible for ${nextLevel} at next review`,
    nextLevel,
  };
}
