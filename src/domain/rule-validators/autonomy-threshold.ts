/**
 * `autonomy-threshold` rule validator — exposes the execution gate's
 * autonomy → behavior binding as customer-configurable policy.
 *
 * Rule config shape (in the rule body's YAML frontmatter):
 *
 *   ---
 *   validator: autonomy-threshold
 *   actionKind: merge_pr        # one of MERGE_PR, ADVANCE_PHASE_GATE, CO_SIGN_PROMOTION, DEPLOY_PRODUCTION, "*"
 *   changeRisk: low             # one of low, medium, high, critical, "*"
 *   minAutonomy: merge          # one of observe, propose, merge, lead
 *   ---
 *
 * The default fallback table (matching pre-policy behavior) lives in
 * `src/operations/execution-gate.ts`. Customer rules win by precedence:
 * project-scoped > org-scoped > default.
 *
 * Pure helpers in this file are side-effect free. The DB query that
 * fetches active rules lives in `src/operations/autonomy-policy.ts`.
 */

import { z } from "zod";

import {
  LEVEL_NAMES,
  nameToLevel,
  type LevelName,
} from "@/domain/autonomy-constants";

export const ACTION_KINDS = [
  "merge_pr",
  "advance_phase_gate",
  "co_sign_promotion",
  "deploy_production",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const CHANGE_RISKS = ["low", "medium", "high", "critical"] as const;
export type ChangeRiskLabel = (typeof CHANGE_RISKS)[number];

/** Zod schema for the rule's frontmatter config. */
export const autonomyThresholdConfigSchema = z.object({
  actionKind: z
    .union([z.enum(ACTION_KINDS), z.literal("*")])
    .describe("Action kind this rule binds to, or '*' for any action."),
  changeRisk: z
    .union([z.enum(CHANGE_RISKS), z.literal("*")])
    .describe("Change-risk level, or '*' for any risk."),
  minAutonomy: z
    .enum(LEVEL_NAMES)
    .describe("Minimum autonomy required (string form)."),
});

export type AutonomyThresholdConfig = z.infer<typeof autonomyThresholdConfigSchema>;

/**
 * Does this rule's config match the (actionKind, changeRisk) tuple?
 * Wildcards match any value.
 */
export function ruleMatches(
  cfg: AutonomyThresholdConfig,
  actionKind: ActionKind,
  changeRisk: ChangeRiskLabel,
): boolean {
  const actionMatches = cfg.actionKind === "*" || cfg.actionKind === actionKind;
  const riskMatches = cfg.changeRisk === "*" || cfg.changeRisk === changeRisk;
  return actionMatches && riskMatches;
}

/**
 * Convenience: the integer level (0..3) the rule requires. Useful when
 * comparing against `skill_autonomy.level`.
 */
export function requiredLevelInt(cfg: AutonomyThresholdConfig): number {
  return nameToLevel(cfg.minAutonomy);
}

/**
 * Parse a rule body's frontmatter into the typed config. Returns null
 * (with a reason) if the body doesn't carry an autonomy-threshold rule.
 */
export function parseAutonomyThresholdConfig(
  ruleBody: string,
): { config: AutonomyThresholdConfig } | { config: null; reason: string } {
  const match = ruleBody.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return { config: null, reason: "no frontmatter delimiters" };
  const yaml = match[1];

  const raw: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const kv = line.match(/^([a-zA-Z_-]+):\s*(.+)$/);
    if (!kv) continue;
    raw[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }

  if (raw.validator !== "autonomy-threshold") {
    return { config: null, reason: `validator is '${raw.validator ?? "(none)"}'` };
  }

  const parsed = autonomyThresholdConfigSchema.safeParse({
    actionKind: raw.actionKind,
    changeRisk: raw.changeRisk,
    minAutonomy: raw.minAutonomy as LevelName,
  });
  if (!parsed.success) {
    return { config: null, reason: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { config: parsed.data };
}
