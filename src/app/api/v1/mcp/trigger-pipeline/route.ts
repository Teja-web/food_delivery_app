/**
 * POST /api/v1/mcp/trigger-pipeline — actively kick off a CI/CD run.
 *
 * Backs the `trigger_pipeline` MCP verb. Thin wrapper over
 * `triggerPipelineForProject` in outbound.ts. Phase discipline is gone;
 * governance for pipeline runs is plan-bound.
 */

import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";
import { triggerPipelineForProject } from "@/lib/integrations/outbound";

const bodySchema = z.object({
  projectId: z.string().optional(),
  source: z.enum(["GITHUB", "AZURE_DEVOPS"]),
  workflowId: z.string().min(1),
  branch: z.string().optional(),
});

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

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
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
