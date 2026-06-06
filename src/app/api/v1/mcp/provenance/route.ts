/**
 * GET /api/v1/mcp/provenance
 *
 * Provenance summary for plans + work_items on a project. Counts and
 * ratios only — never code, never prompt bodies (coznt is not a Git host;
 * per-line annotations live in the PR comment bot at M-C).
 *
 * Query params:
 *   - projectId (optional): defaults to ctx.projectId
 *   - windowDays (optional, default 30): only consider entities created
 *     in the trailing window
 */

import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import { planArtifacts as plans } from "@/db/schema/plan/plan-artifact";
import { workItems } from "@/db/schema/work-item";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { summarizeProvenance } from "@/domain/provenance/summarize";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const requestedProjectId = url.searchParams.get("projectId");
    const effectiveProjectId = requestedProjectId ?? ctx.projectId;
    const windowDays = Number.parseInt(url.searchParams.get("windowDays") ?? "30", 10);
    const since = new Date(
      Date.now() - Math.max(1, Math.min(windowDays, 365)) * 24 * 60 * 60 * 1000,
    );

    if (
      requestedProjectId &&
      ctx.projectId &&
      requestedProjectId !== ctx.projectId
    ) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const [planRows, workItemRows] = await Promise.all([
      db
        .select({
          aiAuthored: plans.aiAuthored,
          generatedByModel: plans.generatedByModel,
          generatedBySkillId: plans.generatedBySkillId,
          autonomyAtGeneration: plans.autonomyAtGeneration,
        })
        .from(plans)
        .where(
          and(
            eq(plans.organizationId, ctx.organizationId),
            eq(plans.projectId, effectiveProjectId),
            gte(plans.createdAt, since),
          ),
        ),
      db
        .select({
          aiAuthored: workItems.aiAuthored,
          generatedByModel: workItems.generatedByModel,
          generatedBySkillId: workItems.generatedBySkillId,
          autonomyAtGeneration: workItems.autonomyAtGeneration,
        })
        .from(workItems)
        .where(
          and(
            eq(workItems.organizationId, ctx.organizationId),
            eq(workItems.projectId, effectiveProjectId),
            gte(workItems.createdAt, since),
          ),
        ),
    ]);

    return {
      projectId: effectiveProjectId,
      windowDays,
      plans: summarizeProvenance(planRows),
      workItems: summarizeProvenance(workItemRows),
    };
  });
}
