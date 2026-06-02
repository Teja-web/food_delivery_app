/**
 * POST /api/v1/mcp/pipelines/generate
 *
 * Render a CI/CD pipeline config (GitHub Actions, Azure DevOps, GitLab CI,
 * Jenkins) for a project. Pure templating — no DB write. The agent
 * downstream-writes the returned content to the consumer repo at
 * `filename`. Allowed in cicd phase.
 */

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/db/client";
import { projects, type Project } from "@/db/schema/project";
import { PHASE_GUIDANCE } from "@/domain/phases";
import { handleApi } from "@/lib/auth/api-key";
import {
  PIPELINE_PLATFORMS,
  PIPELINE_STACKS,
  renderPipeline,
} from "@/domain/pipelines/templates";
import { upsertPlanByKindAndSlug } from "@/operations/plan/plans";

const bodySchema = z.object({
  projectId: z.string().min(1),
  platform: z.enum(PIPELINE_PLATFORMS),
  techStack: z.enum(PIPELINE_STACKS).optional(),
  includeDocker: z.boolean().optional(),
  includeKubernetes: z.boolean().optional(),
});

const PIPELINE_ALLOWED_PHASES = new Set<Project["phase"]>([
  "development",
  "testing",
  "cicd",
]);

export async function POST(req: Request) {
  return handleApi(req, async (ctx) => {
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      const err = new Error("Invalid body") as Error & { status?: number; details?: unknown };
      err.status = 400;
      err.details = parsed.error.issues;
      throw err;
    }

    const project = (await db.query.projects.findFirst({
      where: and(
        eq(projects.id, parsed.data.projectId),
        eq(projects.organizationId, ctx.organizationId),
      ),
    })) as Project | undefined;
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
    if (!PIPELINE_ALLOWED_PHASES.has(project.phase)) {
      const err = new Error(
        `Generating a pipeline is not allowed in phase "${project.phase}". Allowed in development, testing, cicd.`,
      ) as Error & { status?: number; details?: unknown };
      err.status = 409;
      err.details = { phase: project.phase, forbidden: PHASE_GUIDANCE[project.phase].forbidden };
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

    // Persist as a reviewable plan so the generated YAML has a source-of-record
    // (every other coznt verb has one — this stays consistent with the
    // "trust observable" thesis). Slug includes platform so multiple targets
    // for the same project coexist; subsequent regens append a revision.
    const slug = `cicd-pipeline-${parsed.data.platform.replace(/_/g, "-")}`;
    const lang = parsed.data.platform === "jenkins" ? "groovy" : "yaml";
    const body = [
      `Generated CI/CD pipeline for **${parsed.data.platform.replace(/_/g, " ")}**`,
      ``,
      `- **File:** \`${filename}\``,
      `- **Stack:** ${stack}`,
      `- **Docker:** ${includeDocker ? "yes" : "no"}`,
      `- **Kubernetes:** ${includeKubernetes ? "yes" : "no"}`,
      ``,
      `## Pipeline stages`,
      `1. Lint`,
      `2. Build`,
      `3. Test`,
      `4. Security scan`,
      `5. Deploy to staging`,
      `6. Approval gate`,
      `7. Deploy to production`,
      ``,
      `## Configuration`,
      ``,
      "```" + lang,
      content,
      "```",
      "",
    ].join("\n");

    const upsert = await upsertPlanByKindAndSlug({
      projectId: project.id,
      kind: "cicd_pipeline",
      slug,
      title: `${parsed.data.platform.replace(/_/g, " ").toUpperCase()} pipeline (${stack})`,
      summary: `7-stage pipeline. Stack ${stack}. Docker ${includeDocker ? "on" : "off"}, K8s ${includeKubernetes ? "on" : "off"}.`,
      body,
      details: {
        platform: parsed.data.platform,
        stack,
        filename,
        includeDocker,
        includeKubernetes,
      },
      changeNote: upsertChangeNote({ includeDocker, includeKubernetes }),
    });

    return {
      project: { id: project.id },
      platform: parsed.data.platform,
      stack,
      filename,
      content,
      includeDocker,
      includeKubernetes,
      plan: {
        id: upsert.plan.id,
        kind: upsert.plan.kind,
        slug: upsert.plan.slug,
        revisionNumber: upsert.revisionNumber,
        created: upsert.created,
      },
    };
  });
}

function upsertChangeNote(opts: { includeDocker: boolean; includeKubernetes: boolean }): string {
  const addons: string[] = [];
  if (opts.includeDocker) addons.push("docker");
  if (opts.includeKubernetes) addons.push("k8s");
  return addons.length ? `regenerated with addons: ${addons.join(", ")}` : "regenerated";
}
