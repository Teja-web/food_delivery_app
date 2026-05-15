/**
 * GET /api/v1/mcp/projects/[id]/pipeline-status
 *
 * CI/CD + monitoring view: latest deployment, recent test runs (with
 * pass rate + coverage), most recent release_plan in flight. The
 * agent's "is the pipeline healthy?" check, intended for the cicd and
 * monitoring phases.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { deployments } from "@/db/schema/deployment";
import { plans } from "@/db/schema/plan";
import { projects } from "@/db/schema/project";
import { testRuns } from "@/db/schema/test-run";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
      columns: { id: true, organizationId: true, name: true, phase: true },
    });
    if (!project) {
      const err = new Error("Project not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error("API key scoped to a different project.") as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const [recentDeploys, recentTestRuns, activeReleasePlan] = await Promise.all([
      db.query.deployments.findMany({
        where: eq(deployments.projectId, project.id),
        orderBy: [desc(deployments.startedAt)],
        limit: 5,
        columns: {
          id: true,
          environment: true,
          version: true,
          status: true,
          startedAt: true,
          completedAt: true,
          rolledBackAt: true,
          ciRunUrl: true,
        },
      }),
      db.query.testRuns.findMany({
        where: eq(testRuns.projectId, project.id),
        orderBy: [desc(testRuns.ranAt)],
        limit: 5,
        columns: {
          id: true,
          suite: true,
          status: true,
          total: true,
          passed: true,
          failed: true,
          skipped: true,
          coverage: true,
          ranAt: true,
          ciRunUrl: true,
        },
      }),
      db.query.plans.findFirst({
        where: and(
          eq(plans.organizationId, project.organizationId),
          eq(plans.projectId, project.id),
          eq(plans.kind, "release_plan"),
          eq(plans.status, "in_progress"),
        ),
        orderBy: [desc(plans.updatedAt)],
        columns: { id: true, title: true, status: true, updatedAt: true },
      }),
    ]);

    const latestTestRun = recentTestRuns[0];
    const latestDeploy = recentDeploys[0];

    return {
      project: { id: project.id, name: project.name, phase: project.phase },
      activeReleasePlan: activeReleasePlan
        ? {
            id: activeReleasePlan.id,
            title: activeReleasePlan.title,
            status: activeReleasePlan.status,
            updatedAt: activeReleasePlan.updatedAt.toISOString(),
          }
        : null,
      latestDeploy: latestDeploy
        ? {
            id: latestDeploy.id,
            environment: latestDeploy.environment,
            version: latestDeploy.version,
            status: latestDeploy.status,
            startedAt: latestDeploy.startedAt.toISOString(),
            completedAt: latestDeploy.completedAt?.toISOString() ?? null,
            rolledBackAt: latestDeploy.rolledBackAt?.toISOString() ?? null,
            ciRunUrl: latestDeploy.ciRunUrl,
          }
        : null,
      latestTestRun: latestTestRun
        ? {
            id: latestTestRun.id,
            suite: latestTestRun.suite,
            status: latestTestRun.status,
            passRate:
              latestTestRun.total > 0 ? latestTestRun.passed / latestTestRun.total : null,
            counts: {
              total: latestTestRun.total,
              passed: latestTestRun.passed,
              failed: latestTestRun.failed,
              skipped: latestTestRun.skipped,
            },
            coverage: latestTestRun.coverage,
            ranAt: latestTestRun.ranAt.toISOString(),
            ciRunUrl: latestTestRun.ciRunUrl,
          }
        : null,
      recent: {
        deployments: recentDeploys.map((d) => ({
          id: d.id,
          environment: d.environment,
          version: d.version,
          status: d.status,
          startedAt: d.startedAt.toISOString(),
        })),
        testRuns: recentTestRuns.map((t) => ({
          id: t.id,
          suite: t.suite,
          status: t.status,
          passRate: t.total > 0 ? t.passed / t.total : null,
          coverage: t.coverage,
          ranAt: t.ranAt.toISOString(),
        })),
      },
    };
  });
}
