/**
 * GET /api/v1/mcp/outcomes
 *
 * Recent `skill_outcomes` rows for agent introspection. Filterable by
 * project and/or skill slug; defaults to the API key's bound project
 * when present.
 *
 * Use this to answer "did my last test-plan-generator run succeed?"
 * without leaving Cursor.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { skillOutcomes } from "@/db/schema/skill-outcome";
import { skills } from "@/db/schema/skill";
import { handleApi, type ApiContext } from "@/lib/auth/api-key";

export interface ListOutcomesForAgentQuery {
  projectId?: string | null;
  skillSlug?: string | null;
  limit?: number;
}

/**
 * Inner read used by the route handler and the milestone smoke. Org-scoped;
 * if `ctx.projectId` is bound (project-scoped API key) and the caller
 * requests a different project, throws a 403-shaped error.
 */
export async function listOutcomesForAgent(ctx: ApiContext, query: ListOutcomesForAgentQuery) {
  const rawLimit = query.limit ?? 20;
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 20, 100);

  const requestedProjectId = query.projectId ?? null;
  const effectiveProjectId = requestedProjectId ?? ctx.projectId ?? null;

  if (
    ctx.projectId &&
    requestedProjectId &&
    requestedProjectId !== ctx.projectId
  ) {
    const err = new Error("API key scoped to a different project.") as Error & { status?: number };
    err.status = 403;
    throw err;
  }

  let skillId: string | null = null;
  if (query.skillSlug) {
    const skill = await db.query.skills.findFirst({
      where: and(eq(skills.slug, query.skillSlug), eq(skills.organizationId, ctx.organizationId)),
      columns: { id: true },
    });
    if (!skill) {
      const err = new Error(`Skill "${query.skillSlug}" not found in this org`) as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    skillId = skill.id;
  }

  const conditions = [eq(skillOutcomes.organizationId, ctx.organizationId)];
  if (skillId) conditions.push(eq(skillOutcomes.skillId, skillId));
  if (effectiveProjectId) conditions.push(eq(skillOutcomes.projectId, effectiveProjectId));

  const rows = await db
    .select({
      id: skillOutcomes.id,
      verdict: skillOutcomes.verdict,
      severity: skillOutcomes.severity,
      sourceKind: skillOutcomes.sourceKind,
      sourceRef: skillOutcomes.sourceRef,
      invocationId: skillOutcomes.invocationId,
      recordedAt: skillOutcomes.recordedAt,
      skillId: skillOutcomes.skillId,
      skillSlug: skills.slug,
      skillName: skills.name,
      projectId: skillOutcomes.projectId,
      projectName: projects.name,
    })
    .from(skillOutcomes)
    .leftJoin(skills, eq(skills.id, skillOutcomes.skillId))
    .leftJoin(projects, eq(projects.id, skillOutcomes.projectId))
    .where(and(...conditions))
    .orderBy(desc(skillOutcomes.recordedAt))
    .limit(limit);

  return {
    filters: {
      projectId: effectiveProjectId,
      skillSlug: query.skillSlug ?? null,
      limit,
    },
    total: rows.length,
    outcomes: rows,
  };
}

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    return listOutcomesForAgent(ctx, {
      projectId: url.searchParams.get("projectId"),
      skillSlug: url.searchParams.get("skillSlug"),
      limit: rawLimit,
    });
  });
}
