/**
 * GET /api/v1/mcp/projects/[id]/status
 *
 * Returns a compact status snapshot for one project: governance record
 * counts (pending/passed/failed), open approval count, last deployment.
 * Sized to be the agent's "where are we?" check before doing work.
 *
 * Auth: bearer API key. The key's org must match the project's org;
 * a project-scoped key may only read its own project.
 */

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { governanceRecords } from "@/db/schema/governance/records";
import { deployments } from "@/db/schema/deployment";
import { projects } from "@/db/schema/project";
import { handleApi } from "@/lib/auth/api-key";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleApi(req, async (ctx) => {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, id), eq(projects.organizationId, ctx.organizationId)),
    });
    if (!project) {
      const err = new Error("Project not found in this organization.") as Error & {
        status?: number;
      };
      err.status = 404;
      throw err;
    }
    if (ctx.projectId && ctx.projectId !== project.id) {
      const err = new Error(
        "This API key is scoped to a different project.",
      ) as Error & { status?: number };
      err.status = 403;
      throw err;
    }

    const [records, lastDeploy] = await Promise.all([
      db.query.governanceRecords.findMany({
        where: and(
          eq(governanceRecords.organizationId, ctx.organizationId),
          eq(governanceRecords.projectId, project.id),
        ),
        columns: {
          id: true,
          kind: true,
          status: true,
          projectTaskId: true,
        },
      }),
      db.query.deployments.findFirst({
        where: eq(deployments.projectId, project.id),
        orderBy: [desc(deployments.startedAt)],
        columns: { startedAt: true, status: true, environment: true },
      }),
    ]);

    const passed = records.filter((g) => g.status === "passed").length;
    const failed = records.filter((g) => g.status === "failed").length;
    const pending = records.filter((g) => g.status === "pending").length;
    const skipped = records.filter((g) => g.status === "skipped").length;
    const openApprovals = records.filter(
      (g) => g.kind === "approval" && g.status === "pending",
    ).length;

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
      },
      governanceRecords: {
        total: records.length,
        passed,
        failed,
        pending,
        skipped,
        pendingByKind: records
          .filter((g) => g.status === "pending")
          .map((g) => ({ id: g.id, kind: g.kind, projectTaskId: g.projectTaskId })),
      },
      openApprovals,
      lastDeploy: lastDeploy
        ? {
            at: lastDeploy.startedAt.toISOString(),
            status: lastDeploy.status,
            environment: lastDeploy.environment,
          }
        : null,
    };
  });
}
