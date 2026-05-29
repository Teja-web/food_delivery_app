/**
 * Resolve the minimum autonomy required for a given
 * (actionKind, changeRisk, organizationId, projectId) tuple.
 *
 * Reads active `autonomy-threshold` rules from the `coznt.rules` table
 * (`validator: autonomy-threshold` in the rule body frontmatter). Falls
 * back to a hardcoded default table that matches pre-policy behavior
 * when no rule matches.
 *
 * Precedence: project-scoped match > org-scoped match > default fallback.
 * Within a scope, first-match by `createdAt` order wins.
 */

import { and, asc, eq, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { rules } from "@/db/schema/rule";
import { nameToLevel } from "@/operations/autonomy-constants";
import {
  parseAutonomyThresholdConfig,
  ruleMatches,
  type ActionKind,
  type ChangeRiskLabel,
} from "@/lib/rule-validators/autonomy-threshold";

export interface ResolvedAutonomyThreshold {
  /** Minimum autonomy level (integer 0..3) the action requires. */
  minLevel: number;
  /** Rule id when a customer rule matched, null when default fallback fired. */
  enforcedByRuleId: string | null;
  /** Human-readable origin tag for logs / audit details. */
  source: "rule:project" | "rule:org" | "default";
}

/**
 * Default fallback table — matches the pre-policy behavior baked into
 * `decideExecutionGate`. Customer-authored rules override per-row by
 * precedence (project > org > default).
 *
 * `null` minLevel means "no autonomy is sufficient — always require a
 * human." We represent this as `Infinity` internally so comparisons
 * still work.
 */
function defaultMinLevel(actionKind: ActionKind, changeRisk: ChangeRiskLabel): number {
  if (actionKind === "deploy_production") return Infinity;
  if (actionKind === "co_sign_promotion") return 3; // lead
  if (actionKind === "advance_phase_gate") return 2; // merge
  // merge_pr
  if (changeRisk === "critical") return Infinity;
  if (changeRisk === "high") return 3; // lead
  if (changeRisk === "medium") return 2; // merge
  return 2; // low risk: merge — matches today (propose=propose can't auto-merge)
}

export async function resolveAutonomyThreshold(params: {
  organizationId: string;
  projectId: string | null;
  actionKind: ActionKind;
  changeRisk: ChangeRiskLabel;
}): Promise<ResolvedAutonomyThreshold> {
  const { organizationId, projectId, actionKind, changeRisk } = params;

  // Pull every enabled rule scoped to this org+project (or org-wide).
  // We could narrow by validator but that field lives in the body's
  // frontmatter, not as a column — filter in JS.
  const candidates = await db
    .select({
      id: rules.id,
      projectId: rules.projectId,
      body: rules.body,
    })
    .from(rules)
    .where(
      and(
        eq(rules.organizationId, organizationId),
        eq(rules.enabled, true),
        projectId
          ? or(eq(rules.projectId, projectId), isNull(rules.projectId))
          : isNull(rules.projectId),
      ),
    )
    .orderBy(asc(rules.createdAt));

  // First pass: collect autonomy-threshold rules that match this tuple, by scope.
  const projectMatches: { id: string; minLevel: number }[] = [];
  const orgMatches: { id: string; minLevel: number }[] = [];

  for (const r of candidates) {
    const parsed = parseAutonomyThresholdConfig(r.body);
    if (!parsed.config) continue;
    if (!ruleMatches(parsed.config, actionKind, changeRisk)) continue;
    const minLevel = nameToLevel(parsed.config.minAutonomy);
    const bucket = r.projectId === null ? orgMatches : projectMatches;
    bucket.push({ id: r.id, minLevel });
  }

  if (projectMatches.length > 0) {
    return {
      minLevel: projectMatches[0].minLevel,
      enforcedByRuleId: projectMatches[0].id,
      source: "rule:project",
    };
  }
  if (orgMatches.length > 0) {
    return {
      minLevel: orgMatches[0].minLevel,
      enforcedByRuleId: orgMatches[0].id,
      source: "rule:org",
    };
  }
  return {
    minLevel: defaultMinLevel(actionKind, changeRisk),
    enforcedByRuleId: null,
    source: "default",
  };
}
