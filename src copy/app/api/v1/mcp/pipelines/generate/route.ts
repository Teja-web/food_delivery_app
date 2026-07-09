/**
 * POST /api/v1/mcp/pipelines/generate
 *
 * Render a CI/CD pipeline config (GitHub Actions, Azure DevOps, GitLab CI,
 * Jenkins) for a project. Pure templating — no DB write. The agent
 * downstream-writes the returned content to the consumer repo at
 * `filename`. Phase discipline is gone — governance for pipeline changes
 * is plan-bound via policies/governance_records.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import {
  PIPELINE_PLATFORMS,
  PIPELINE_STACKS,
  renderPipeline,
} from "@/domain/pipelines/templates";

const bodySchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(PIPELINE_PLATFORMS),
  techStack: z.enum(PIPELINE_STACKS).optional(),
  includeDocker: z.boolean().optional(),
  includeKubernetes: z.boolean().optional(),
});

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, parsed.data.projectId),
        eq(projects.organizationId, ctx.organizationId),
      ),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && project.id !== ctx.projectId) {
      const err = new Error("Project outside this API key's scope") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const stack = parsed.data.techStack ?? "node";
    const includeDocker = parsed.data.includeDocker ?? false;
    const includeKubernetes = parsed.data.includeKubernetes ?? false;
    const { filename, content } = renderPipeline({
      platform: parsed.data.platform,
      stack,
      includeDocker,
      includeKubernetes,
    });

    return {
      project: { id: project.id },
      platform: parsed.data.platform,
      stack,
      filename,
      content,
      includeDocker,
      includeKubernetes,
    };
  });
}
