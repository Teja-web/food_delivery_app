/**
 * Resolves the `recommendedKickoff` field on `get_my_context`.
 *
 * Project phase has been removed — SDLC progression is expressed via
 * plan-artifact status. The kickoff state is now derived from the mix of
 * plan kinds and statuses on the project:
 *
 *   - empty                 — no plans
 *   - has_epic_no_feature   — has an epic but no feature
 *   - has_leaves_no_parent  — flat plans (no epic, no feature)
 *   - has_drafts            — lots of draft plans waiting for review
 *   - ready_for_advance     — at least one approved plan, work can move
 *   - none                  — no rule meaningfully matches
 *
 * The routing table lives in the active `project-lifecycle` choreography;
 * this resolver just feeds it a state name. The rule matcher used to key
 * on `(phase, state)`; we now match on `state` alone and treat the
 * choreography rule's `phase` field (if present) as a no-op compatibility
 * shim.
 */

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import type { Project } from "@/db/schema/project";
import { getRoutingRulesForSlug } from "@/operations/choreography/choreographies";

export type KickoffState =
  | "empty"
  | "has_epic_no_feature"
  | "has_leaves_no_parent"
  | "has_drafts"
  | "ready_for_advance"
  | "none";

export interface RecommendedKickoff {
  action: string;
  rationale: string;
  source: "choreography_custom_project" | "choreography_custom_org" | "choreography_default";
}

/**
 * Compute the kickoff state name from observable plan data. Pure function
 * so the routing logic stays table-testable.
 */
export function resolveKickoffState(args: {
  planCount: number;
  hasEpic: boolean;
  hasFeature: boolean;
  hasApprovedPlan: boolean;
  draftCount: number;
}): KickoffState {
  const { planCount, hasEpic, hasFeature, hasApprovedPlan, draftCount } = args;
  if (planCount === 0) return "empty";
  if (hasEpic && !hasFeature) return "has_epic_no_feature";
  if (hasApprovedPlan) return "ready_for_advance";
  if (draftCount >= 3) return "has_drafts";
  if (!hasEpic && !hasFeature) return "has_leaves_no_parent";
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
  draftCount: number;
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
        inArray(plans.kind, ["epic", "feature", "story", "spec", "release_plan"]),
      ),
    );

  let hasEpic = false;
  let hasFeature = false;
  let hasApprovedPlan = false;
  let draftCount = 0;
  for (const r of rows) {
    if (r.kind === "epic") hasEpic = true;
    if (r.kind === "feature") hasFeature = true;
    if (r.status === "approved") hasApprovedPlan = true;
    if (r.status === "draft") draftCount++;
  }
  return { planCount: rows.length, hasEpic, hasFeature, hasApprovedPlan, draftCount };
}

/**
 * Top-level resolver. Returns null when no routing rule matches —
 * never invents a recommendation.
 */
export async function resolveRecommendedKickoff(
  organizationId: string,
  project: Project,
): Promise<RecommendedKickoff | null> {
  const counts = await gatherProjectPlanState(organizationId, project.id);
  const stateName = resolveKickoffState({
    planCount: counts.planCount,
    hasEpic: counts.hasEpic,
    hasFeature: counts.hasFeature,
    hasApprovedPlan: counts.hasApprovedPlan,
    draftCount: counts.draftCount,
  });
  if (stateName === "none") return null;

  const { rules, source } = await getRoutingRulesForSlug(
    organizationId,
    project.id,
    "project-lifecycle",
  );
  if (source === "none" || rules.length === 0) return null;

  // Phase is no longer a project attribute; match on state only.
  const match = rules.find((r) => r.state === stateName);
  if (!match) return null;

  return {
    action: match.kickoff,
    rationale: match.rationale,
    source,
  };
}
