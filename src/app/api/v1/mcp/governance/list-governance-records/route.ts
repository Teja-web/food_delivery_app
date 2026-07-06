/**
 * GET /api/v1/mcp/governance/list-governance-records
 *
 * Read governance records for one project_task. Backs the
 * `list_governance_records` MCP verb.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { projectTasks } from "@/db/schema/plan/project-task";
import { GOVERNANCE_KINDS, type GovernanceKind } from "@/db/schema/governance/policies";
import {
  GOVERNANCE_RECORD_STATUSES,
  type GovernanceRecordStatus,
} from "@/db/schema/governance/records";
import { handleApi } from "@/lib/auth/api-key";
import { httpError } from "@/lib/auth/scope";
import { listRecordsForPlan } from "@/operations/governance/records";

export async function GET(req: Request) {
  return handleApi(req, async (ctx) => {
    const url = new URL(req.url);
    const projectTaskId = url.searchParams.get("projectTaskId");
    if (!projectTaskId) throw httpError(400, "`projectTaskId` is required");

    const plan = await db.query.projectTasks.findFirst({
      where: and(
        eq(projectTasks.id, projectTaskId),
        eq(projectTasks.organizationId, ctx.organizationId),
      ),
    });
    if (!plan) throw httpError(404, "Plan not found");
    if (ctx.projectId && ctx.projectId !== plan.projectId) {
      throw httpError(403, "API key scoped to a different project.");
    }

    const kindParam = url.searchParams.get("kind");
    const statusParam = url.searchParams.get("status");
    const kind =
      kindParam && (GOVERNANCE_KINDS as readonly string[]).includes(kindParam)
        ? (kindParam as GovernanceKind)
        : undefined;
    const status =
      statusParam && (GOVERNANCE_RECORD_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as GovernanceRecordStatus)
        : undefined;

    const items = await listRecordsForPlan(projectTaskId, { kind, status });
    return { projectTaskId, kind: kind ?? null, status: status ?? null, items };
  });
}
