/**
 * `nextAction` — the post-mutation companion of `recommendedKickoff`.
 *
 * Same routing rules (project-lifecycle SKILL.md), same resolver,
 * same shape. The difference is the point-in-time:
 *
 *   - `recommendedKickoff` fires on `get_my_context` — answers
 *     "where do I start?" against initial project state.
 *   - `nextAction` fires on every mutating governed tool response —
 *     answers "what did I just do, and what's next?" against the
 *     post-mutation state.
 *
 * Both are choreography-driven; both return null when no rule matches.
 * The Recommendation type is shared so consumers can render either
 * field with the same code.
 *
 * Why a thin wrapper rather than direct re-export:
 *   - Call sites read `computeNextAction(...)` and immediately convey
 *     intent ("we're asking the post-action question").
 *   - If post-mutation routing ever needs to diverge from initial-state
 *     routing (e.g., suppress kickoff hints that don't make sense after
 *     a specific action), the divergence is one function deep.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";

import {
  resolveRecommendedKickoff,
  type RecommendedKickoff,
} from "./recommended-kickoff";

/** Same shape as recommendedKickoff — they're the same answer at different timestamps. */
export type NextAction = RecommendedKickoff;

/**
 * Post-mutation guidance. Self-contained: takes a projectId, fresh-loads
 * the project, and resolves nextAction against current state.
 *
 * Why this wraps a fresh lookup instead of accepting a loaded Project:
 * callers are mutating endpoints whose previous step may have advanced
 * the phase, closed an approval, or otherwise changed observable state.
 * Forcing the caller to re-fetch after every helper leaks freshness
 * management into every endpoint. The wrapper owns it.
 *
 * For the get_my_context path — where the project is the response
 * payload and was just loaded fresh — call `resolveRecommendedKickoff`
 * directly with the loaded project.
 */
export async function computeNextAction(
  organizationId: string,
  projectId: string,
): Promise<NextAction | null> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
  });
  if (!project) return null;
  return resolveRecommendedKickoff(organizationId, project);
}
