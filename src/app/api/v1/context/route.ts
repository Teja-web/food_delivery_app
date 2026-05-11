import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { listRulesForProject } from "@/operations/rules";
import { listSkillsForProject } from "@/operations/skills";
import { handleApi } from "@/lib/api/auth";

/**
 * GET /api/v1/context
 *
 * Returns the project the API key is scoped to (or a list of projects if the
 * key is org-wide), the current phase, and the active rules + skills.
 */
export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    if (!ctx.projectId) {
      const orgProjects = await db.query.projects.findMany({
        where: eq(projects.organizationId, ctx.organizationId),
        limit: 50,
      });
      return { projects: orgProjects, project: null, rules: [], skills: [] };
    }

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, ctx.projectId), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) throw new Error("Project not found");

    const [rules, skills] = await Promise.all([
      listRulesForProject(ctx.projectId, project.phase),
      listSkillsForProject(ctx.projectId),
    ]);

    return { project, rules, skills };
  });
}
