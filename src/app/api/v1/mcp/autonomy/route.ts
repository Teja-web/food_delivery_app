/**
 * GET /api/v1/mcp/autonomy
 *
 * Read-only autonomy snapshot for an agent / CLI client.
 *
 * Query params (all optional):
 *   - skillSlug: scope to one skill (returns per-project autonomy rows)
 *   - projectId: scope to one project (returns autonomy level for the
 *     skill on that project; combines with skillSlug)
 *
 * Without skillSlug: returns the project-level autonomy aggregate
 * (counts of skills at each level + recent incidents).
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { skills } from "@/db/schema/skill/skill";
import { handleApi } from "@/lib/auth/api-key";
import {
  getSkillAutonomy,
  getSkillAutonomyAcrossProjects,
  getProjectAutonomyAggregate,
} from "@/operations/skill/skill-autonomy";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const skillSlug = url.searchParams.get("skillSlug");
    const requestedProjectId = url.searchParams.get("projectId");
    const effectiveProjectId = requestedProjectId ?? ctx.projectId;

    if (
      requestedProjectId &&
      ctx.projectId &&
      requestedProjectId !== ctx.projectId
    ) {
      const err = new Error("API key scoped to a different project.") as Error & {
        status?: number;
      };
      err.status = 403;
      throw err;
    }

    if (skillSlug) {
      const skill = await db.query.skills.findFirst({
        where: and(eq(skills.organizationId, ctx.organizationId), eq(skills.slug, skillSlug)),
        columns: { id: true, slug: true, name: true },
      });
      if (!skill) {
        const err = new Error(`Skill not found: ${skillSlug}`) as Error & { status?: number };
        err.status = 404;
        throw err;
      }
      const [forProject, acrossProjects] = await Promise.all([
        getSkillAutonomy(skill.id, effectiveProjectId ?? null),
        getSkillAutonomyAcrossProjects(skill.id),
      ]);
      return {
        skill: { id: skill.id, slug: skill.slug, name: skill.name },
        forProject,
        acrossProjects,
      };
    }

    // No skillSlug — project-level aggregate.
    const projectAggregate = await getProjectAutonomyAggregate(
      effectiveProjectId,
      ctx.organizationId,
    );
    return { projectId: effectiveProjectId, projectAggregate };
  });
}
