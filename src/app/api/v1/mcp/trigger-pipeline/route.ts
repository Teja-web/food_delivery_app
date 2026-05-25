/**
 * POST /api/v1/mcp/trigger-pipeline — actively kick off a CI/CD run.
 *
 * Backs the `trigger_pipeline` MCP verb. Phase-gated to CICD only.
 * Thin wrapper over `triggerPipelineForProject` in outbound.ts.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects, type Project } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";
import { handleApi } from "@/lib/auth/api-key";
import { triggerPipelineForProject } from "@/lib/integrations/outbound";

const bodySchema = z.object({
  projectId: z.string().optional(),
  source: z.enum(["GITHUB", "AZURE_DEVOPS"]),
  workflowId: z.string().min(1),
  branch: z.string().optional(),
});

const ALLOWED_PHASES = new Set<Project["phase"]>(["cicd"]);

function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3029";
  return `${base.replace(/\/$/, "")}${path}`;
}

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const projectId = parsed.data.projectId ?? ctx.projectId;
    if (!projectId) {
      const err = new Error("projectId required (or bind a project-scoped API key)") as Error & {
        status?: number;
      };
      err.status = 400;
      throw err;
    }
    if (ctx.projectId && projectId !== ctx.projectId) {
      const err = new Error("Project outside this API key's scope") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const project = (await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
    })) as Project | undefined;
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }

    if (!ALLOWED_PHASES.has(project.phase)) {
      const err = new Error(
        `CI/CD triggering is allowed only in the cicd phase. Advance the project via submit_phase_for_review.`,
      ) as Error & { status?: number; details?: unknown };
      err.status = 403;
      err.details = {
        phase: project.phase,
        phaseGuidance: PHASE_GUIDANCE[project.phase],
      };
      throw err;
    }

    try {
      const result = await triggerPipelineForProject({
        organizationId: ctx.organizationId,
        projectId,
        source: parsed.data.source,
        workflowId: parsed.data.workflowId,
        branch: parsed.data.branch,
      });
      return result;
    } catch (err) {
      const e = err as Error & { kind?: string; status?: number };
      if (e.kind === "missing_binding") {
        const friendly = new Error(e.message) as Error & {
          status?: number;
          details?: unknown;
        };
        friendly.status = 412;
        friendly.details = { fixUrl: appUrl("/integrations") };
        throw friendly;
      }
      throw err;
    }
  });
}
