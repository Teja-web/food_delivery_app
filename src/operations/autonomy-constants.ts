/**
 * Constants shared between `skill-autonomy.ts` (the DB-side recompute
 * logic), the pure `src/domain/autonomy-distance.ts` helper, and any UI
 * that displays autonomy levels.
 *
 * Single source of truth for the autonomy thresholds and labels. Renamed
 * 2026-05-17 from career-progression labels (Observe/Propose/Merge/Lead)
 * to verb-form labels that describe what the skill is permitted to do.
 * Storage column `skill_autonomy.level` is still an integer 0..3; only
 * display labels changed.
 */

export const LEVEL_NAMES = ["observe", "propose", "merge", "lead"] as const;
export type LevelName = (typeof LEVEL_NAMES)[number];

/**
 * Map an integer level (0..3) to its label. Returns the lowest label
 * (`observe`) for out-of-range values — safer than throwing in a UI hot path.
 */
export function levelToName(level: number): LevelName {
  return LEVEL_NAMES[level] ?? "observe";
}

/**
 * Inverse of `levelToName`. Used by parsers (choreography frontmatter,
 * rule config) that accept the string form on the wire. Returns -1 for
 * unknown labels so callers can detect bad input.
 */
export function nameToLevel(name: string): number {
  const idx = (LEVEL_NAMES as readonly string[]).indexOf(name);
  return idx;
}

export const LEVEL_BLURBS: Record<LevelName, string> = {
  observe: "read-only; can draft plans, comments, PR notes",
  propose: "can author PRs and request human review — no auto-approve",
  merge: "auto-approves low- and medium-risk PRs scoped to its project",
  lead: "auto-approves all entity types in project; can co-sign promotions",
};

export const WINDOW_DAYS = 30;
export const PROMOTE_SUCCESS_RATE = 0.9;
export const PROMOTE_MIN_AT_LEVEL_DAYS = 14;
export const REVIEW_INTERVAL_HOURS = 24;
export const MAX_LEVEL = 3;
export const MIN_LEVEL = 0;
export const MIN_SAMPLES_FOR_PROMOTION = 5;
