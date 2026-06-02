/**
 * Resolves the `recommendedKickoff` field on `get_my_context`.
 *
 * The platform owns the contract (this field is always computed); the
 * choreography owns the opinion (which kickoff matches which state).
 * Orgs override routing by installing a custom `project-lifecycle`
 * choreography — the existing custom-choreographies path delivers it,
 * no platform redeploy required.
 *
 * State enumeration is closed and matches the names declared in
 * src/automations/skills/project-lifecycle/SKILL.md.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { plans } from "@/db/schema/plan";
import type { Project } from "@/db/schema/project";
import { getRoutingRulesForSlug } from "@/operations/choreographies";

export type KickoffState =
  | "empty"
  | "has_epic_no_feature"
  | "has_leaves_no_parent"
  | "ready_for_advance"
  | "none";

export interface RecommendedKickoff {
  action: string;
  rationale: string;
  source: "choreography_custom_project" | "choreography_custom_org" | "choreography_default";
}

/**
 * Compute the kickoff state name from observable project data. State
 * names are stable identifiers consumed by the routing rules in
 * `project-lifecycle/SKILL.md`.
 *
 * Returns `none` when no rule could meaningfully match — the resolver
 * then returns null rather than guessing.
 */
export function resolveKickoffState(args: {
  phase: Project["phase"];
  planCount: number;
  hasEpic: boolean;
  hasFeature: boolean;
  hasApprovedPlan: boolean;
}): KickoffState {
  const { phase, planCount, hasEpic, hasFeature, hasApprovedPlan } = args;
  if (phase === "requirements") {
    if (planCount === 0) return "empty";
    if (hasEpic && !hasFeature) return "has_epic_no_feature";
    if (hasApprovedPlan) return "ready_for_advance";
    // Plans exist but no organizing parent — the "5 flat stories"
    // scenario. Route to feature-spec-generator so the work gets
    // nested for traceability.
    if (!hasEpic && !hasFeature) return "has_leaves_no_parent";
    return "none";
  }
  // For non-requirements phases the default choreography only ships an
  // `empty` rule today. More states can be added without code changes
  // here as long as resolveKickoffState learns to emit them.
  if (planCount === 0) return "empty";
  return "none";
}

/**
 * Pull just the counts we need from the plans table. Single SQL call;
 * no full plan rows in memory.
 */
async function gatherProjectPlanState(
  organizationId: string,
  projectId: string,
): Promise<{
  planCount: number;
  hasEpic: boolean;
  hasFeature: boolean;
  hasApprovedPlan: boolean;
}> {
  const rows = await db
    .select({
      kind: plans.kind,
      status: plans.status,
    })
    .from(plans)
    .where(
      and(
        eq(plans.organizationId, organizationId),
        eq(plans.projectId, projectId),
        // Only count kinds the routing logic cares about. The full set
        // of kinds may grow; the resolver should still be cheap.
        inArray(plans.kind, ["epic", "feature", "story", "spec", "release_plan"]),
      ),
    );

  let hasEpic = false;
  let hasFeature = false;
  let hasApprovedPlan = false;
  for (const r of rows) {
    if (r.kind === "epic") hasEpic = true;
    if (r.kind === "feature") hasFeature = true;
    if (r.status === "approved") hasApprovedPlan = true;
  }
  return { planCount: rows.length, hasEpic, hasFeature, hasApprovedPlan };
}

/**
 * Top-level resolver. Returns null when no routing rule matches —
 * never invents a recommendation.
 */
export async function resolveRecommendedKickoff(
  organizationId: string,
  project: Project,
): Promise<RecommendedKickoff | null> {
  const state = (async () => {
    const counts = await gatherProjectPlanState(organizationId, project.id);
    return resolveKickoffState({
      phase: project.phase,
      planCount: counts.planCount,
      hasEpic: counts.hasEpic,
      hasFeature: counts.hasFeature,
      hasApprovedPlan: counts.hasApprovedPlan,
    });
  });
  const stateName = await state();
  if (stateName === "none") return null;

  const { rules, source } = await getRoutingRulesForSlug(
    organizationId,
    project.id,
    "project-lifecycle",
  );
  if (source === "none" || rules.length === 0) return null;

  const match = rules.find(
    (r) => r.phase === project.phase && r.state === stateName,
  );
  if (!match) return null;

  return {
    action: match.kickoff,
    rationale: match.rationale,
    source,
  };
}
